import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  ANSWERS,
  Engine,
  MODES,
  MODE_CONFIG,
  compileCatalog,
  loadCatalogFile,
  type AnswerRecord,
  type GameInput,
  type GuessRecord,
  type Mode,
} from '@am/engine';
import { Store, type Outcome } from './store';

export interface AppOptions {
  catalogPath: string;
  dbPath: string;
  /** Carpeta con la SPA compilada (apps/web/dist); si no existe, solo se sirve la API. */
  staticDir?: string;
  logger?: boolean;
  /** Detrás de un proxy inverso: usar X-Forwarded-For para la IP del limitador. */
  trustProxy?: boolean;
}

const MAX_ANSWERS = 90;

const answerSchema = {
  type: 'object',
  required: ['q', 'a'],
  additionalProperties: false,
  properties: { q: { type: 'string', minLength: 1, maxLength: 80 }, a: { type: 'string', enum: [...ANSWERS] } },
} as const;

const gameStateSchema = {
  type: 'object',
  required: ['mode', 'answers', 'guesses'],
  properties: {
    mode: { type: 'string', enum: [...MODES] },
    answers: { type: 'array', maxItems: MAX_ANSWERS, items: answerSchema },
    guesses: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        required: ['id', 'at'],
        additionalProperties: false,
        properties: { id: { type: 'string', maxLength: 32 }, at: { type: 'integer', minimum: 0, maximum: MAX_ANSWERS } },
      },
    },
    seed: { type: 'integer' },
  },
} as const;

interface GameBody {
  mode: Mode;
  answers: AnswerRecord[];
  guesses: GuessRecord[];
  seed?: number;
}

interface FinishBody extends GameBody {
  outcome: Outcome;
  songId?: string | null;
  clientId?: string;
}

/** Limitador mínimo en memoria para los endpoints que escriben (protege el aprendizaje de abusos). */
function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: FastifyRequest): boolean => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  };
}

export async function buildApp(options: AppOptions): Promise<{ app: FastifyInstance; engine: Engine; store: Store }> {
  const t0 = performance.now();
  const engine = new Engine(compileCatalog(loadCatalogFile(options.catalogPath)));
  const store = new Store(options.dbPath);

  // Aplicar lo aprendido en partidas anteriores
  let learned = 0;
  for (const row of store.allCounts()) if (engine.applyLearning(row.songId, row.questionId, row.counts)) learned++;
  for (const q of store.questionStats()) engine.setUnknownStats(q.questionId, q.asked, q.unknown);

  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 64 * 1024, trustProxy: options.trustProxy ?? false });
  app.log.info(
    `Catálogo: ${engine.catalog.songs.length} canciones, ${learned} celdas aprendidas, listo en ${Math.round(performance.now() - t0)} ms`,
  );
  const writeLimit = rateLimiter(60, 60_000);

  /** Descarta respuestas a preguntas que el motor no conoce (p. ej. de una versión anterior del catálogo). */
  const validAnswers = (answers: AnswerRecord[]) => answers.filter((a) => engine.resolve(a.q) !== null);
  /** Para aprender solo cuentan preguntas fijas: las dinámicas (artista, título) son hechos deterministas. */
  const learnable = (answers: AnswerRecord[]) => answers.filter((a) => engine.resolve(a.q)?.kind === 'static');

  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/meta', async () => ({
    songs: engine.catalog.songs.length,
    pools: Object.fromEntries(MODES.map((m) => [m, engine.catalog.modes[m].pool.length])),
    questions: engine.catalog.questions.length,
    builtAt: engine.catalog.builtAt,
    sources: engine.catalog.sources,
    modes: Object.fromEntries(MODES.map((m) => [m, { maxQuestions: MODE_CONFIG[m].maxQuestions, maxGuesses: MODE_CONFIG[m].maxGuesses }])),
  }));

  app.post<{ Body: GameBody }>('/api/game/step', { schema: { body: gameStateSchema } }, async (req) => {
    const input: GameInput = { ...req.body, answers: validAnswers(req.body.answers) };
    return engine.step(input);
  });

  app.get<{ Querystring: { q?: string; limit?: number } }>(
    '/api/search',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: { q: { type: 'string', maxLength: 120 }, limit: { type: 'integer', minimum: 1, maximum: 20 } },
        },
      },
    },
    async (req) => ({ results: engine.search(req.query.q ?? '', req.query.limit ?? 8) }),
  );

  app.get<{ Params: { id: string } }>('/api/song/:id', async (req, reply) => {
    const i = engine.songIndex(req.params.id);
    if (i === undefined) return reply.code(404).send({ error: 'Canción no encontrada' });
    return engine.songView(i);
  });

  app.post<{ Body: FinishBody }>(
    '/api/game/finish',
    {
      schema: {
        body: {
          ...gameStateSchema,
          required: [...gameStateSchema.required, 'outcome'],
          properties: {
            ...gameStateSchema.properties,
            outcome: { type: 'string', enum: ['won', 'lost', 'abandoned'] },
            songId: { type: ['string', 'null'], maxLength: 32 },
            clientId: { type: 'string', maxLength: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!writeLimit(req)) return reply.code(429).send({ error: 'Demasiadas partidas seguidas; espera un momento.' });
      const { mode, outcome, guesses, clientId } = req.body;
      const answers = validAnswers(req.body.answers);
      const songId = req.body.songId && engine.songIndex(req.body.songId) !== undefined ? req.body.songId : null;
      const gameId = store.recordGame({
        mode,
        outcome,
        songId,
        questions: answers.length,
        guesses: guesses.length + (outcome === 'won' ? 1 : 0),
        clientId: clientId ?? null,
        answers,
      });
      for (const a of answers) {
        const s = store.questionStat(a.q);
        engine.setUnknownStats(a.q, s.asked, s.unknown);
      }
      if (!songId) return { gameId, insights: [], learningQuestions: [], learned: 0 };
      // Aprendizaje: las respuestas de la partida describen la canción confirmada
      const counts = store.addCounts(songId, learnable(answers));
      for (const [q, c] of counts) engine.applyLearning(songId, q, c);
      return {
        gameId,
        insights: engine.compareWithData(songId, answers).slice(0, 5),
        learningQuestions: engine.learningQuestions(songId, answers.map((a) => a.q)),
        learned: counts.size,
      };
    },
  );

  app.post<{ Body: { gameId: number; answers: AnswerRecord[] } }>(
    '/api/game/learn',
    {
      schema: {
        body: {
          type: 'object',
          required: ['gameId', 'answers'],
          properties: { gameId: { type: 'integer', minimum: 1 }, answers: { type: 'array', maxItems: 5, items: answerSchema } },
        },
      },
    },
    async (req, reply) => {
      if (!writeLimit(req)) return reply.code(429).send({ error: 'Demasiadas peticiones; espera un momento.' });
      const game = store.gameExists(req.body.gameId);
      if (!game?.songId) return reply.code(404).send({ error: 'Partida no encontrada o sin canción confirmada' });
      if (store.hasLearnPhase(req.body.gameId)) return reply.code(409).send({ error: 'Esta partida ya enseñó lo que sabía' });
      const answers = learnable(req.body.answers);
      store.insertAnswers(req.body.gameId, 'learn', answers);
      const counts = store.addCounts(game.songId, answers);
      for (const [q, c] of counts) engine.applyLearning(game.songId, q, c);
      return { learned: counts.size };
    },
  );

  app.post<{ Body: { gameId?: number; title: string; artist: string } }>(
    '/api/missing',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title', 'artist'],
          properties: {
            gameId: { type: 'integer', minimum: 1 },
            title: { type: 'string', minLength: 1, maxLength: 160 },
            artist: { type: 'string', minLength: 1, maxLength: 160 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!writeLimit(req)) return reply.code(429).send({ error: 'Demasiadas peticiones; espera un momento.' });
      // Sugerencia sin verificar: queda registrada para revisarla, pero no entra en el juego.
      store.addMissingSong(req.body.gameId ?? null, req.body.title.trim(), req.body.artist.trim());
      return { saved: true };
    },
  );

  app.get('/api/stats', async () => {
    const stats = store.stats();
    return {
      ...stats,
      topSongs: stats.topSongs.flatMap((t) => {
        const i = engine.songIndex(t.songId);
        return i === undefined ? [] : [{ song: engine.songView(i), count: t.count }];
      }),
    };
  });

  if (options.staticDir && existsSync(join(options.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: options.staticDir });
    // SPA: cualquier ruta que no sea de la API devuelve index.html
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado' });
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', async () => store.close());
  return { app, engine, store };
}

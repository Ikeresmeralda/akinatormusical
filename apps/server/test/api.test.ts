import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SimulatedPlayer, seededRandom, type AnswerRecord, type Decision, type GuessRecord } from '@am/engine';
import { buildApp } from '../src/app';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let ctx: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  ctx = await buildApp({ catalogPath: `${root}data/catalog/catalog.json.gz`, dbPath: ':memory:' });
});
afterAll(async () => {
  await ctx.app.close();
});

const post = (url: string, payload: unknown) => ctx.app.inject({ method: 'POST', url, payload: payload as object });

describe('API', () => {
  it('expone metadatos del catálogo', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/meta' });
    expect(res.statusCode).toBe(200);
    const meta = res.json();
    expect(meta.songs).toBeGreaterThan(50_000);
    expect(meta.pools.normal).toBeLessThan(meta.pools.hard);
  });

  it('la primera jugada es una pregunta', async () => {
    const res = await post('/api/game/step', { mode: 'normal', answers: [], guesses: [], seed: 7 });
    expect(res.statusCode).toBe(200);
    const d = res.json() as Decision;
    expect(d.type).toBe('question');
  });

  it('rechaza respuestas mal formadas', async () => {
    const res = await post('/api/game/step', { mode: 'normal', answers: [{ q: 'lang_es', a: 'quizás' }], guesses: [] });
    expect(res.statusCode).toBe(400);
  });

  it('juega una partida completa, aprende de ella y no deja enseñar dos veces', async () => {
    const target = ctx.engine.catalog.songs.findIndex((s) => s.title === 'Despacito' && s.popularity === 1);
    const targetId = ctx.engine.catalog.songs[target].id;
    const player = new SimulatedPlayer(ctx.engine, target, seededRandom(3), { mistakeRate: 0, sureRate: 1 });
    const answers: AnswerRecord[] = [];
    const guesses: GuessRecord[] = [];
    let won = false;
    for (let i = 0; i < 80 && !won; i++) {
      const d = (await post('/api/game/step', { mode: 'normal', answers, guesses, seed: 1 })).json() as Decision;
      if (d.type === 'question') answers.push({ q: d.question.id, a: player.answer(d.question.id) });
      else if (d.type === 'guess') {
        expect(d.confidence).toBeGreaterThan(0);
        expect(d.confidence).toBeLessThanOrEqual(1);
        if (d.song.id === targetId) won = true;
        else guesses.push({ id: d.song.id, at: answers.length });
      } else break;
    }
    expect(won).toBe(true);

    const finish = await post('/api/game/finish', { mode: 'normal', answers, guesses, outcome: 'won', songId: targetId });
    expect(finish.statusCode).toBe(200);
    const body = finish.json();
    expect(body.gameId).toBeGreaterThan(0);
    expect(body.learned).toBeGreaterThan(0);
    expect(Array.isArray(body.learningQuestions)).toBe(true);

    const learnQ = body.learningQuestions[0]?.id ?? 'viral';
    const learn = await post('/api/game/learn', { gameId: body.gameId, answers: [{ q: learnQ, a: 'yes' }] });
    expect(learn.statusCode).toBe(200);
    expect(learn.json().learned).toBe(1);
    expect((await post('/api/game/learn', { gameId: body.gameId, answers: [{ q: learnQ, a: 'yes' }] })).statusCode).toBe(409);

    const stats = (await ctx.app.inject({ method: 'GET', url: '/api/stats' })).json();
    expect(stats.games).toBe(1);
    expect(stats.won).toBe(1);
    expect(stats.topSongs[0].song.id).toBe(targetId);
  });

  it('busca en el catálogo', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/search?q=bohemian%20queen' });
    const { results } = res.json();
    expect(results[0].title).toBe('Bohemian Rhapsody');
    expect(results[0].links.some((l: { label: string }) => l.label === 'Spotify')).toBe(true);
  });
});

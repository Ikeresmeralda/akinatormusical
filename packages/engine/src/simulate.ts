import { fromCode } from './answers';
import { Engine, type Posterior, type ScoredQuestion } from './engine';
import type { Answer, AnswerRecord, GameInput, GuessRecord, Mode } from './types';

/** Generador pseudoaleatorio reproducible (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Elige la canción en la que "piensa" el jugador simulado, según el prior del modo. */
export function sampleTarget(engine: Engine, mode: Mode, rng: () => number): number {
  const { pool, logPrior } = engine.catalog.modes[mode];
  let u = rng();
  for (let k = 0; k < pool.length; k++) {
    u -= Math.exp(logPrior[k]);
    if (u <= 0) return pool[k];
  }
  return pool[pool.length - 1];
}

export interface PlayerProfile {
  /** Probabilidad de equivocarse de verdad (responder lo contrario). */
  mistakeRate: number;
  /** Probabilidad de contestar con seguridad ("sí"/"no") en vez de "probablemente". */
  sureRate: number;
}

export const DEFAULT_PLAYER: PlayerProfile = { mistakeRate: 0.04, sureRate: 0.8 };

/**
 * Jugador simulado. Conoce "la verdad" de su canción: se muestrea de los datos
 * del catálogo (o, si faltan, de la tasa de canciones parecidas) una vez por
 * pregunta y se mantiene durante la partida; el motor solo ve las respuestas.
 * Además duda ("no lo sé") con la tasa propia de cada pregunta y se equivoca a veces.
 */
export class SimulatedPlayer {
  private readonly truths = new Map<string, boolean>();

  constructor(
    private readonly engine: Engine,
    readonly song: number,
    private readonly rng: () => number,
    private readonly profile: PlayerProfile = DEFAULT_PLAYER,
  ) {}

  answer(questionId: string): Answer {
    const r = this.engine.resolve(questionId);
    if (!r) return 'unknown';
    const dk = r.kind === 'static' ? r.q.def.dk : 0.02;
    if (this.rng() < dk) return 'unknown';
    let truth = this.truths.get(questionId);
    if (truth === undefined) {
      // Donde falta el dato, el código del motor es la tasa observada en canciones
      // parecidas: la "verdad" oculta del jugador se muestrea de ese mismo modelo del mundo.
      truth = this.rng() < fromCode(this.engine.code(r, this.song));
      this.truths.set(questionId, truth);
    }
    const said = this.rng() < this.profile.mistakeRate ? !truth : truth;
    const sure = this.rng() < this.profile.sureRate;
    return said ? (sure ? 'yes' : 'probably') : sure ? 'no' : 'probably_not';
  }
}

export interface GameResult {
  target: string;
  won: boolean;
  /** Preguntas respondidas hasta el final de la partida. */
  questions: number;
  guesses: number;
  /** Confianza declarada en cada intento y si fue correcto (para calibración). */
  attempts: Array<{ confidence: number; correct: boolean }>;
  msPerStep: number;
}

export function playGame(engine: Engine, mode: Mode, target: number, rng: () => number, profile = DEFAULT_PLAYER): GameResult {
  const player = new SimulatedPlayer(engine, target, rng, profile);
  const answers: AnswerRecord[] = [];
  const guesses: GuessRecord[] = [];
  const attempts: GameResult['attempts'] = [];
  const targetId = engine.catalog.songs[target].id;
  let steps = 0;
  const t0 = performance.now();
  for (let safety = 0; safety < 200; safety++) {
    const input: GameInput = { mode, answers, guesses };
    const decision = engine.step(input);
    steps++;
    if (decision.type === 'question') {
      answers.push({ q: decision.question.id, a: player.answer(decision.question.id) });
    } else if (decision.type === 'guess') {
      const correct = decision.song.id === targetId;
      attempts.push({ confidence: decision.confidence, correct });
      if (correct) return finish(true);
      guesses.push({ id: decision.song.id, at: answers.length });
    } else break;
  }
  return finish(false);

  function finish(won: boolean): GameResult {
    return {
      target: targetId,
      won,
      questions: answers.length,
      guesses: attempts.length,
      attempts,
      msPerStep: (performance.now() - t0) / Math.max(1, steps),
    };
  }
}

/** Línea base: misma inferencia y misma política de intento, pero preguntas al azar. */
export class RandomQuestionEngine extends Engine {
  rng: () => number = Math.random;
  protected override selectQuestion(input: GameInput, posterior: Posterior): ScoredQuestion | undefined {
    const asked = new Set(input.answers.map((a) => a.q));
    const options = this.catalog.questions.filter((q) => !asked.has(q.def.id));
    if (!options.length) return undefined;
    const q = options[Math.floor(this.rng() * options.length)];
    void posterior;
    return { id: q.def.id, resolved: { kind: 'static', q }, infoGain: Number.NaN, score: Number.POSITIVE_INFINITY, yesProbability: Number.NaN };
  }
}

/** Línea base: cuestionario fijo (siempre las mismas preguntas en el mismo orden). */
export class FixedQuestionnaireEngine extends Engine {
  protected override selectQuestion(input: GameInput): ScoredQuestion | undefined {
    const asked = new Set(input.answers.map((a) => a.q));
    const q = this.catalog.questions.find((x) => !asked.has(x.def.id));
    if (!q) return undefined;
    return { id: q.def.id, resolved: { kind: 'static', q }, infoGain: Number.NaN, score: Number.POSITIVE_INFINITY, yesProbability: Number.NaN };
  }
}

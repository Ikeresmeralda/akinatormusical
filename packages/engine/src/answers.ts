import { ANSWERS, type Answer } from './types';

/**
 * Modelo de respuesta: P(respuesta | la respuesta "verdadera" es sí/no).
 * "No lo sé" tiene la misma probabilidad en ambas filas, así que no altera el
 * posterior; un "sí" rotundo pesa ~30 veces más que un "no", pero nunca anula
 * una canción, lo que permite recuperarse de respuestas equivocadas.
 */
export const GIVEN_TRUE = [0.78, 0.14, 0.05, 0.02, 0.01] as const;
export const GIVEN_FALSE = [0.01, 0.02, 0.05, 0.14, 0.78] as const;
/** Tasa de "no lo sé" que ya contempla el modelo. */
export const BASE_UNKNOWN_RATE = GIVEN_TRUE[2];

export const ANSWER_INDEX: Record<Answer, number> = Object.fromEntries(ANSWERS.map((a, i) => [a, i])) as Record<Answer, number>;

/** Error factual del jugador: incluso con un dato seguro, P(sí) ∈ [ε, 1 − ε]. */
export const USER_EPSILON = 0.02;

export const CODE_LEVELS = 256;

/** Probabilidad → código uint8. */
export function toCode(p: number): number {
  return Math.max(0, Math.min(255, Math.round(p * 255)));
}

export function fromCode(c: number): number {
  return c / 255;
}

/** Probabilidad de que el hecho sea cierto → probabilidad de que el jugador diga "sí". */
export function factToYes(fact: number): number {
  return USER_EPSILON + (1 - 2 * USER_EPSILON) * fact;
}

function likelihood(answer: number, p: number): number {
  return p * GIVEN_TRUE[answer] + (1 - p) * GIVEN_FALSE[answer];
}

/** Entropía (bits) de la distribución de respuestas cuando P(verdad = sí) = p. */
export function answerEntropy(p: number): number {
  let h = 0;
  for (let a = 0; a < 5; a++) {
    const l = likelihood(a, p);
    if (l > 0) h -= l * Math.log2(l);
  }
  return h;
}

/** Tablas precalculadas por código: verosimilitud, su logaritmo y entropía. */
export const LIKELIHOOD: Float64Array[] = [];
export const LOG_LIKELIHOOD: Float64Array[] = [];
export const ENTROPY_BY_CODE = new Float64Array(CODE_LEVELS);
export const P_BY_CODE = new Float64Array(CODE_LEVELS);

for (let a = 0; a < 5; a++) {
  LIKELIHOOD.push(new Float64Array(CODE_LEVELS));
  LOG_LIKELIHOOD.push(new Float64Array(CODE_LEVELS));
}
for (let c = 0; c < CODE_LEVELS; c++) {
  const p = fromCode(c);
  P_BY_CODE[c] = p;
  ENTROPY_BY_CODE[c] = answerEntropy(p);
  for (let a = 0; a < 5; a++) {
    const l = likelihood(a, p);
    LIKELIHOOD[a][c] = l;
    LOG_LIKELIHOOD[a][c] = Math.log(l);
  }
}

export function answerLikelihood(answer: Answer, p: number): number {
  return likelihood(ANSWER_INDEX[answer], p);
}

/** Peso de cada respuesta como evidencia de "sí" para el aprendizaje (null = no cuenta). */
export const LEARNING_WEIGHT: Record<Answer, number | null> = {
  yes: 1,
  probably: 0.75,
  unknown: null,
  probably_not: 0.25,
  no: 0,
};

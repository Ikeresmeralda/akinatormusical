import type { Answer, Mode } from '@am/engine';

/** Nombre propio de la app («Akinator» es una marca registrada de Elokence). */
export const APP_NAME = 'Oído Absoluto';
export const APP_TAGLINE = 'el detective musical';

export const ANSWER_OPTIONS: Array<{ value: Answer; label: string; short: string; key: string; icon: string }> = [
  { value: 'yes', label: 'Sí', short: 'Sí', key: '1', icon: '✓' },
  { value: 'no', label: 'No', short: 'No', key: '5', icon: '✕' },
  { value: 'probably', label: 'Probablemente sí', short: 'Prob. sí', key: '2', icon: '≈' },
  { value: 'probably_not', label: 'Probablemente no', short: 'Prob. no', key: '4', icon: '≉' },
  { value: 'unknown', label: 'No lo sé', short: 'No lo sé', key: '3', icon: '?' },
];

export const ANSWER_LABELS: Record<Answer, string> = Object.fromEntries(ANSWER_OPTIONS.map((o) => [o.value, o.label])) as Record<
  Answer,
  string
>;

export const MODE_INFO: Record<Mode, { name: string; blurb: string; emoji: string }> = {
  normal: { name: 'Clásico', blurb: 'Los grandes éxitos de todas las épocas.', emoji: '🎧' },
  hard: { name: 'Difícil', blurb: 'Todo el catálogo, con canciones poco conocidas.', emoji: '🔥' },
  challenge: { name: 'Reto 20', blurb: '20 preguntas y 3 intentos. ¿Podrás ganarme?', emoji: '⚔️' },
};

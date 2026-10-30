export const ANSWERS = ['yes', 'probably', 'unknown', 'probably_not', 'no'] as const;
export type Answer = (typeof ANSWERS)[number];

export const ANSWER_LABELS: Record<Answer, string> = {
  yes: 'Sí',
  probably: 'Probablemente sí',
  unknown: 'No lo sé',
  probably_not: 'Probablemente no',
  no: 'No',
};

export const MODES = ['normal', 'hard', 'challenge'] as const;
export type Mode = (typeof MODES)[number];

export type Family =
  | 'era'
  | 'language'
  | 'voice'
  | 'artist'
  | 'origin'
  | 'genre'
  | 'sound'
  | 'lyrics'
  | 'media'
  | 'charts'
  | 'title'
  | 'trivia';

export const FAMILY_INFO: Record<Family, { label: string; icon: string }> = {
  era: { label: 'Época', icon: '🕰️' },
  language: { label: 'Idioma', icon: '🗣️' },
  voice: { label: 'Voz', icon: '🎤' },
  artist: { label: 'Artista', icon: '👤' },
  origin: { label: 'Origen', icon: '🌍' },
  genre: { label: 'Género', icon: '🎸' },
  sound: { label: 'Ritmo y sonido', icon: '🥁' },
  lyrics: { label: 'Letra', icon: '✍️' },
  media: { label: 'Cine, series y redes', icon: '🎬' },
  charts: { label: 'Éxito', icon: '🏆' },
  title: { label: 'Título', icon: '🔤' },
  trivia: { label: 'Curiosidades', icon: '✨' },
};

export interface AnswerRecord {
  /** Id de la pregunta (estática, p. ej. "lang_es", o dinámica, p. ej. "artist:123"). */
  q: string;
  a: Answer;
}

export interface GuessRecord {
  /** Id de la canción propuesta y rechazada. */
  id: string;
  /** Número de respuestas que había cuando se propuso. */
  at: number;
}

export interface GameInput {
  mode: Mode;
  answers: AnswerRecord[];
  guesses: GuessRecord[];
  /**
   * Semilla de la partida: entre preguntas casi igual de buenas (±4 %) elige
   * una de forma reproducible, para que no todas las partidas empiecen igual.
   */
  seed?: number;
}

export interface PublicQuestion {
  id: string;
  text: string;
  family: Family;
  familyLabel: string;
  icon: string;
  dynamic?: boolean;
}

export interface SongLink {
  label: string;
  url: string;
}

export interface SongView {
  id: string;
  title: string;
  credit: string;
  artists: string[];
  year: number | null;
  work?: string;
  popularity: number;
  /** Procedencia legible ("Billboard Hot 100: nº 1, 52 semanas"…). */
  sources: string[];
  links: SongLink[];
}

export interface Progress {
  asked: number;
  guesses: number;
  /** Número efectivo de canciones aún posibles (exp de la entropía del posterior). */
  effectiveCandidates: number;
  /** Confianza (calibrada) en la canción más probable. */
  topConfidence: number;
  poolSize: number;
  maxQuestions: number;
  maxGuesses: number;
}

export interface Clue {
  question: string;
  answer: Answer;
}

export type Decision =
  | { type: 'question'; question: PublicQuestion; progress: Progress }
  | { type: 'guess'; song: SongView; confidence: number; clues: Clue[]; progress: Progress }
  | { type: 'give_up'; progress: Progress; candidates: Array<{ song: SongView; confidence: number }> };

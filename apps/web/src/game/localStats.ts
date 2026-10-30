import type { Mode } from '@am/engine';

/**
 * Estadísticas personales en el navegador. Son una comodidad por jugador:
 * si el almacenamiento no está disponible (modo privado, bloqueo), la app
 * funciona igual y simplemente no recuerda el historial.
 */
export interface PlayedGame {
  id: string;
  at: string;
  mode: Mode;
  /** Quién ganó: la IA (adivinó) o el jugador (la IA no la encontró). */
  winner: 'ai' | 'player';
  questions: number;
  guesses: number;
  confidence?: number;
  song?: { id: string; title: string; credit: string };
}

const KEY = 'oido-absoluto:games:v1';
const MAX_GAMES = 300;

export function loadGames(): PlayedGame[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as PlayedGame[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGame(game: PlayedGame): PlayedGame[] {
  const games = [game, ...loadGames().filter((g) => g.id !== game.id)].slice(0, MAX_GAMES);
  try {
    localStorage.setItem(KEY, JSON.stringify(games));
  } catch {
    // Sin almacenamiento: el historial no persiste, pero la partida no se ve afectada.
  }
  return games;
}

export interface PersonalStats {
  total: number;
  aiWins: number;
  playerWins: number;
  aiWinRate: number;
  avgQuestions: number | null;
  bestQuestions: number | null;
  streak: number;
  histogram: Array<{ bucket: string; count: number }>;
  byMode: Record<Mode, { total: number; aiWins: number; avgQuestions: number | null }>;
  /** Puntuación del Reto 20: la IA suma más cuanto antes acierta; tú sumas cuando no lo consigue. */
  challenge: { player: number; ai: number; aiPoints: number; playerPoints: number };
}

const BUCKETS: Array<[string, number, number]> = [
  ['≤10', 0, 10],
  ['11-15', 11, 15],
  ['16-20', 16, 20],
  ['21-25', 21, 25],
  ['26-30', 26, 30],
  ['>30', 31, Number.POSITIVE_INFINITY],
];

export function challengePoints(game: Pick<PlayedGame, 'winner' | 'questions' | 'guesses'>): number {
  return game.winner === 'ai' ? Math.max(1, 21 - game.questions) + Math.max(0, 3 - game.guesses) * 2 : 15;
}

export function computeStats(games: PlayedGame[]): PersonalStats {
  const aiWon = games.filter((g) => g.winner === 'ai');
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  let streak = 0;
  for (const g of games) {
    if (g.winner !== 'ai') break;
    streak++;
  }
  const byMode = {} as PersonalStats['byMode'];
  for (const mode of ['normal', 'hard', 'challenge'] as Mode[]) {
    const ofMode = games.filter((g) => g.mode === mode);
    const won = ofMode.filter((g) => g.winner === 'ai');
    byMode[mode] = { total: ofMode.length, aiWins: won.length, avgQuestions: avg(won.map((g) => g.questions)) };
  }
  const challenge = games.filter((g) => g.mode === 'challenge');
  return {
    total: games.length,
    aiWins: aiWon.length,
    playerWins: games.length - aiWon.length,
    aiWinRate: games.length ? aiWon.length / games.length : 0,
    avgQuestions: avg(aiWon.map((g) => g.questions)),
    bestQuestions: aiWon.length ? Math.min(...aiWon.map((g) => g.questions)) : null,
    streak,
    histogram: BUCKETS.map(([bucket, lo, hi]) => ({ bucket, count: aiWon.filter((g) => g.questions >= lo && g.questions <= hi).length })),
    byMode,
    challenge: {
      ai: challenge.filter((g) => g.winner === 'ai').length,
      player: challenge.filter((g) => g.winner === 'player').length,
      aiPoints: challenge.filter((g) => g.winner === 'ai').reduce((s, g) => s + challengePoints(g), 0),
      playerPoints: challenge.filter((g) => g.winner === 'player').reduce((s, g) => s + challengePoints(g), 0),
    },
  };
}

const CURRENT_KEY = 'oido-absoluto:current:v1';

export function saveCurrent(value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(CURRENT_KEY);
    else localStorage.setItem(CURRENT_KEY, JSON.stringify(value));
  } catch {
    // Igual que arriba: retomar la partida es opcional.
  }
}

export function loadCurrent<T>(): T | null {
  try {
    const raw = localStorage.getItem(CURRENT_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function clientId(): string {
  const key = 'oido-absoluto:client';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

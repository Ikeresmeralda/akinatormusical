import type { AnswerRecord, DataMismatch, Decision, GuessRecord, Mode, PublicQuestion, SongView } from '@am/engine';

export interface Meta {
  songs: number;
  pools: Record<Mode, number>;
  questions: number;
  builtAt: string;
  sources: Array<{ id: string; name: string; url: string; license: string }>;
  modes: Record<Mode, { maxQuestions: number; maxGuesses: number }>;
}

export interface FinishResult {
  gameId: number;
  insights: DataMismatch[];
  learningQuestions: PublicQuestion[];
  learned: number;
}

export interface GlobalStats {
  games: number;
  won: number;
  lost: number;
  winRate: number;
  avgQuestionsWon: number | null;
  byMode: Record<string, { games: number; won: number; avgQuestionsWon: number | null }>;
  questionsHistogram: Array<{ bucket: string; count: number }>;
  topSongs: Array<{ song: SongView; count: number }>;
  learnedFacts: number;
}

export interface GameState {
  mode: Mode;
  answers: AnswerRecord[];
  guesses: GuessRecord[];
  seed?: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: init?.json !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(body?.error ?? body?.message ?? `Error ${res.status}`, res.status);
    return body as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('No puedo conectar con el servidor. ¿Está en marcha?', 0);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  meta: () => request<Meta>('/api/meta'),
  step: (state: GameState) => request<Decision>('/api/game/step', { method: 'POST', json: state }),
  finish: (state: GameState & { outcome: 'won' | 'lost' | 'abandoned'; songId: string | null; clientId: string }) =>
    request<FinishResult>('/api/game/finish', { method: 'POST', json: state }),
  learn: (gameId: number, answers: AnswerRecord[]) => request<{ learned: number }>('/api/game/learn', { method: 'POST', json: { gameId, answers } }),
  search: (q: string) => request<{ results: SongView[] }>(`/api/search?q=${encodeURIComponent(q)}&limit=8`),
  missing: (title: string, artist: string, gameId?: number) =>
    request<{ saved: boolean }>('/api/missing', { method: 'POST', json: { title, artist, ...(gameId ? { gameId } : {}) } }),
  stats: () => request<GlobalStats>('/api/stats'),
};

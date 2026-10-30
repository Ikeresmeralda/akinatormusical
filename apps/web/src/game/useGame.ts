import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { Answer, AnswerRecord, Decision, GuessRecord, Mode, PublicQuestion, SongView } from '@am/engine';
import { api, type FinishResult } from '../api';
import { clientId, loadCurrent, saveCurrent, saveGame, type PlayedGame } from './localStats';

export type Screen = 'home' | 'play' | 'guess' | 'won' | 'lost' | 'stats' | 'about';

export interface LoggedAnswer {
  question: PublicQuestion;
  answer: Answer;
}

export interface GameResult {
  winner: 'ai' | 'player';
  song: SongView | null;
  confidence?: number;
  questions: number;
  guesses: number;
  finish: FinishResult | null;
  /** Candidatas entre las que dudaba la IA al rendirse. */
  candidates?: Array<{ song: SongView; confidence: number }>;
}

export interface State {
  screen: Screen;
  mode: Mode;
  seed: number;
  gameId: string;
  log: LoggedAnswer[];
  guesses: GuessRecord[];
  decision: Decision | null;
  pending: boolean;
  error: string | null;
  result: GameResult | null;
}

interface SavedGame {
  mode: Mode;
  seed: number;
  gameId: string;
  log: LoggedAnswer[];
  guesses: GuessRecord[];
}

type Action =
  | { type: 'screen'; screen: Screen }
  | { type: 'start'; game: SavedGame }
  | { type: 'request' }
  | { type: 'decision'; decision: Decision }
  | { type: 'error'; error: string }
  | { type: 'answer'; entry: LoggedAnswer }
  | { type: 'undo' }
  | { type: 'reject'; guess: GuessRecord }
  | { type: 'result'; result: GameResult; screen: Screen }
  | { type: 'finish'; finish: FinishResult; song?: SongView | null };

const initial: State = {
  screen: 'home',
  mode: 'normal',
  seed: 0,
  gameId: '',
  log: [],
  guesses: [],
  decision: null,
  pending: false,
  error: null,
  result: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'screen':
      return { ...state, screen: action.screen, error: null };
    case 'start':
      return { ...initial, ...action.game, screen: 'play', pending: true };
    case 'request':
      return { ...state, pending: true, error: null };
    case 'decision': {
      const screen = action.decision.type === 'guess' ? 'guess' : action.decision.type === 'give_up' ? 'lost' : 'play';
      return { ...state, decision: action.decision, pending: false, screen };
    }
    case 'error':
      return { ...state, pending: false, error: action.error };
    case 'answer':
      return { ...state, log: [...state.log, action.entry], pending: true, error: null };
    case 'undo': {
      // Los intentos hechos después de la respuesta deshecha dependían de ella: también se deshacen.
      const log = state.log.slice(0, -1);
      return { ...state, log, guesses: state.guesses.filter((g) => g.at <= log.length), pending: true, screen: 'play' };
    }
    case 'reject':
      return { ...state, guesses: [...state.guesses, action.guess], pending: true, screen: 'play' };
    case 'result':
      return { ...state, result: action.result, screen: action.screen, pending: false };
    case 'finish':
      return state.result
        ? { ...state, result: { ...state.result, finish: action.finish, song: action.song === undefined ? state.result.song : action.song } }
        : state;
  }
}

const toAnswers = (log: LoggedAnswer[]): AnswerRecord[] => log.map((l) => ({ q: l.question.id, a: l.answer }));

export function useGame() {
  const [state, dispatch] = useReducer(reducer, initial);
  const latest = useRef(state);
  latest.current = state;
  const requestId = useRef(0);

  const recordLocal = useCallback((s: State, result: GameResult) => {
    const game: PlayedGame = {
      id: s.gameId,
      at: new Date().toISOString(),
      mode: s.mode,
      winner: result.winner,
      questions: result.questions,
      guesses: result.guesses,
      confidence: result.confidence,
      song: result.song ? { id: result.song.id, title: result.song.title, credit: result.song.credit } : undefined,
    };
    saveGame(game);
    saveCurrent(null);
  }, []);

  /** Pide al servidor la siguiente jugada para el estado dado (sin estado en el servidor). */
  const advance = useCallback(async (mode: Mode, seed: number, log: LoggedAnswer[], guesses: GuessRecord[]) => {
    const id = ++requestId.current;
    try {
      const decision = await api.step({ mode, seed, answers: toAnswers(log), guesses });
      if (id !== requestId.current) return;
      dispatch({ type: 'decision', decision });
      if (decision.type === 'give_up') {
        const result: GameResult = {
          winner: 'player',
          song: null,
          questions: log.length,
          guesses: guesses.length,
          finish: null,
          candidates: decision.candidates,
        };
        dispatch({ type: 'result', screen: 'lost', result });
        recordLocal(latest.current, result);
      }
    } catch (err) {
      if (id === requestId.current) dispatch({ type: 'error', error: (err as Error).message });
    }
  }, [recordLocal]);

  // Guarda la partida en curso para poder retomarla tras recargar
  useEffect(() => {
    if (state.screen === 'play' || state.screen === 'guess') {
      const saved: SavedGame = { mode: state.mode, seed: state.seed, gameId: state.gameId, log: state.log, guesses: state.guesses };
      saveCurrent(saved);
    }
  }, [state.screen, state.mode, state.seed, state.gameId, state.log, state.guesses]);

  const start = useCallback(
    (mode: Mode) => {
      const game: SavedGame = { mode, seed: Math.floor(Math.random() * 2 ** 31), gameId: crypto.randomUUID(), log: [], guesses: [] };
      dispatch({ type: 'start', game });
      void advance(game.mode, game.seed, game.log, game.guesses);
    },
    [advance],
  );

  const resume = useCallback(() => {
    const saved = loadCurrent<SavedGame>();
    if (!saved) return false;
    dispatch({ type: 'start', game: saved });
    void advance(saved.mode, saved.seed, saved.log, saved.guesses);
    return true;
  }, [advance]);

  const answer = useCallback(
    (value: Answer) => {
      const s = latest.current;
      if (s.pending || s.decision?.type !== 'question') return;
      const entry = { question: s.decision.question, answer: value };
      dispatch({ type: 'answer', entry });
      void advance(s.mode, s.seed, [...s.log, entry], s.guesses);
    },
    [advance],
  );

  const undo = useCallback(() => {
    const s = latest.current;
    if (!s.log.length || s.pending) return;
    const log = s.log.slice(0, -1);
    dispatch({ type: 'undo' });
    void advance(s.mode, s.seed, log, s.guesses.filter((g) => g.at <= log.length));
  }, [advance]);

  const retry = useCallback(() => {
    const s = latest.current;
    dispatch({ type: 'request' });
    void advance(s.mode, s.seed, s.log, s.guesses);
  }, [advance]);

  /** Respuesta del jugador al intento de la IA. */
  const confirmGuess = useCallback(
    async (correct: boolean) => {
      const s = latest.current;
      if (s.decision?.type !== 'guess' || s.pending) return;
      const guess = s.decision;
      if (!correct) {
        const rejected = { id: guess.song.id, at: s.log.length };
        dispatch({ type: 'reject', guess: rejected });
        void advance(s.mode, s.seed, s.log, [...s.guesses, rejected]);
        return;
      }
      const result: GameResult = {
        winner: 'ai',
        song: guess.song,
        confidence: guess.confidence,
        questions: s.log.length,
        guesses: s.guesses.length + 1,
        finish: null,
      };
      dispatch({ type: 'result', result, screen: 'won' });
      recordLocal(s, result);
      try {
        const finish = await api.finish({
          mode: s.mode,
          seed: s.seed,
          answers: toAnswers(s.log),
          guesses: s.guesses,
          outcome: 'won',
          songId: guess.song.id,
          clientId: clientId(),
        });
        dispatch({ type: 'finish', finish });
      } catch {
        // Las estadísticas globales y el aprendizaje son opcionales para el jugador.
      }
    },
    [advance, recordLocal],
  );

  /** El jugador revela la canción tras ganar (o la IA se rinde): se registra y se aprende de ella. */
  const reveal = useCallback(
    async (song: SongView | null) => {
      const s = latest.current;
      const result: GameResult = {
        ...(s.result ?? { winner: 'player', questions: s.log.length, guesses: s.guesses.length, finish: null }),
        winner: 'player',
        song,
      };
      dispatch({ type: 'result', result, screen: 'lost' });
      recordLocal(s, result);
      try {
        const finish = await api.finish({
          mode: s.mode,
          seed: s.seed,
          answers: toAnswers(s.log),
          guesses: s.guesses,
          outcome: 'lost',
          songId: song?.id ?? null,
          clientId: clientId(),
        });
        dispatch({ type: 'finish', finish, song });
        return finish;
      } catch {
        return null;
      }
    },
    [recordLocal],
  );

  /** El jugador decide terminar antes de que la IA se rinda. */
  const surrender = useCallback(() => {
    const s = latest.current;
    requestId.current++;
    const result: GameResult = { winner: 'player', song: null, questions: s.log.length, guesses: s.guesses.length, finish: null };
    dispatch({ type: 'result', screen: 'lost', result });
    recordLocal(s, result);
  }, [recordLocal]);

  const go = useCallback((screen: Screen) => {
    // La partida en curso queda guardada (efecto de arriba) para poder retomarla desde el inicio.
    requestId.current++;
    dispatch({ type: 'screen', screen });
  }, []);

  return { state, start, resume, answer, undo, retry, confirmGuess, reveal, surrender, go };
}

export function hasSavedGame(): boolean {
  const saved = loadCurrent<SavedGame>();
  return !!saved && Array.isArray(saved.log) && saved.log.length > 0;
}

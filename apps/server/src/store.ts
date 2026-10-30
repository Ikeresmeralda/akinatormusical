import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ANSWERS, type Answer, type AnswerCounts, type AnswerRecord, type Mode } from '@am/engine';

export type Outcome = 'won' | 'lost' | 'abandoned';

export interface GameRecord {
  mode: Mode;
  outcome: Outcome;
  songId: string | null;
  questions: number;
  guesses: number;
  clientId: string | null;
  answers: AnswerRecord[];
}

export interface GlobalStats {
  games: number;
  won: number;
  lost: number;
  winRate: number;
  avgQuestionsWon: number | null;
  byMode: Record<string, { games: number; won: number; avgQuestionsWon: number | null }>;
  /** Partidas ganadas por número de preguntas (para el histograma). */
  questionsHistogram: Array<{ bucket: string; count: number }>;
  topSongs: Array<{ songId: string; count: number }>;
  learnedFacts: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  mode TEXT NOT NULL,
  outcome TEXT NOT NULL,
  song_id TEXT,
  questions INTEGER NOT NULL,
  guesses INTEGER NOT NULL,
  client_id TEXT
);
CREATE TABLE IF NOT EXISTS answers (
  game_id INTEGER NOT NULL REFERENCES games(id),
  phase TEXT NOT NULL,
  idx INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  PRIMARY KEY (game_id, phase, idx)
);
CREATE TABLE IF NOT EXISTS song_question_counts (
  song_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  yes INTEGER NOT NULL DEFAULT 0,
  probably INTEGER NOT NULL DEFAULT 0,
  unknown INTEGER NOT NULL DEFAULT 0,
  probably_not INTEGER NOT NULL DEFAULT 0,
  no INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (song_id, question_id)
);
CREATE TABLE IF NOT EXISTS question_stats (
  question_id TEXT PRIMARY KEY,
  asked INTEGER NOT NULL DEFAULT 0,
  unknown INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS missing_songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  game_id INTEGER,
  title TEXT NOT NULL,
  artist TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_song ON games(song_id);
`;

/**
 * Persistencia del aprendizaje y de las estadísticas globales.
 * SQLite integrado en Node 22 (`node:sqlite`): sin dependencias nativas.
 */
export class Store {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  recordGame(game: GameRecord): number {
    this.db.exec('BEGIN');
    try {
      const res = this.db
        .prepare('INSERT INTO games (mode, outcome, song_id, questions, guesses, client_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(game.mode, game.outcome, game.songId, game.questions, game.guesses, game.clientId);
      const gameId = Number(res.lastInsertRowid);
      this.insertAnswers(gameId, 'game', game.answers);
      const stat = this.db.prepare(
        `INSERT INTO question_stats (question_id, asked, unknown) VALUES (?, 1, ?)
         ON CONFLICT(question_id) DO UPDATE SET asked = asked + 1, unknown = unknown + excluded.unknown`,
      );
      for (const a of game.answers) stat.run(a.q, a.a === 'unknown' ? 1 : 0);
      this.db.exec('COMMIT');
      return gameId;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  gameExists(gameId: number): { songId: string | null } | null {
    const row = this.db.prepare('SELECT song_id FROM games WHERE id = ?').get(gameId) as { song_id: string | null } | undefined;
    return row ? { songId: row.song_id } : null;
  }

  hasLearnPhase(gameId: number): boolean {
    return this.db.prepare("SELECT 1 FROM answers WHERE game_id = ? AND phase = 'learn' LIMIT 1").get(gameId) !== undefined;
  }

  insertAnswers(gameId: number, phase: 'game' | 'learn', answers: AnswerRecord[]): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO answers (game_id, phase, idx, question_id, answer) VALUES (?, ?, ?, ?, ?)');
    answers.forEach((a, i) => stmt.run(gameId, phase, i, a.q, a.a));
  }

  /** Suma respuestas a los conteos de (canción, pregunta) y devuelve los conteos actualizados. */
  addCounts(songId: string, answers: AnswerRecord[]): Map<string, AnswerCounts> {
    const byQuestion = new Map<string, Answer[]>();
    for (const a of answers) byQuestion.set(a.q, [...(byQuestion.get(a.q) ?? []), a.a]);
    const out = new Map<string, AnswerCounts>();
    this.db.exec('BEGIN');
    try {
      const upsert = this.db.prepare(
        `INSERT INTO song_question_counts (song_id, question_id, yes, probably, unknown, probably_not, no)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(song_id, question_id) DO UPDATE SET
           yes = yes + excluded.yes, probably = probably + excluded.probably, unknown = unknown + excluded.unknown,
           probably_not = probably_not + excluded.probably_not, no = no + excluded.no`,
      );
      const read = this.db.prepare('SELECT yes, probably, unknown, probably_not, no FROM song_question_counts WHERE song_id = ? AND question_id = ?');
      for (const [q, list] of byQuestion) {
        const c = Object.fromEntries(ANSWERS.map((a) => [a, list.filter((x) => x === a).length])) as AnswerCounts;
        upsert.run(songId, q, c.yes, c.probably, c.unknown, c.probably_not, c.no);
        out.set(q, read.get(songId, q) as unknown as AnswerCounts);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return out;
  }

  allCounts(): Array<{ songId: string; questionId: string; counts: AnswerCounts }> {
    const rows = this.db.prepare('SELECT song_id, question_id, yes, probably, unknown, probably_not, no FROM song_question_counts').all() as Array<
      Record<string, string | number>
    >;
    return rows.map((r) => ({
      songId: String(r.song_id),
      questionId: String(r.question_id),
      counts: { yes: Number(r.yes), probably: Number(r.probably), unknown: Number(r.unknown), probably_not: Number(r.probably_not), no: Number(r.no) },
    }));
  }

  questionStats(): Array<{ questionId: string; asked: number; unknown: number }> {
    const rows = this.db.prepare('SELECT question_id, asked, unknown FROM question_stats').all() as Array<Record<string, string | number>>;
    return rows.map((r) => ({ questionId: String(r.question_id), asked: Number(r.asked), unknown: Number(r.unknown) }));
  }

  questionStat(questionId: string): { asked: number; unknown: number } {
    const row = this.db.prepare('SELECT asked, unknown FROM question_stats WHERE question_id = ?').get(questionId) as
      | { asked: number; unknown: number }
      | undefined;
    return row ?? { asked: 0, unknown: 0 };
  }

  addMissingSong(gameId: number | null, title: string, artist: string): void {
    this.db.prepare('INSERT INTO missing_songs (game_id, title, artist) VALUES (?, ?, ?)').run(gameId, title, artist);
  }

  stats(): GlobalStats {
    const one = <T>(sql: string, ...params: Array<string | number>) => this.db.prepare(sql).get(...params) as T;
    const totals = one<{ games: number; won: number; lost: number; avg: number | null }>(
      `SELECT COUNT(*) AS games, SUM(outcome = 'won') AS won, SUM(outcome = 'lost') AS lost,
              AVG(CASE WHEN outcome = 'won' THEN questions END) AS avg FROM games WHERE outcome != 'abandoned'`,
    );
    const byModeRows = this.db
      .prepare(
        `SELECT mode, COUNT(*) AS games, SUM(outcome = 'won') AS won, AVG(CASE WHEN outcome = 'won' THEN questions END) AS avg
         FROM games WHERE outcome != 'abandoned' GROUP BY mode`,
      )
      .all() as Array<{ mode: string; games: number; won: number; avg: number | null }>;
    const histogramRows = this.db
      .prepare(
        `SELECT CASE WHEN questions <= 10 THEN '≤10' WHEN questions <= 15 THEN '11-15' WHEN questions <= 20 THEN '16-20'
                     WHEN questions <= 25 THEN '21-25' WHEN questions <= 30 THEN '26-30' ELSE '>30' END AS bucket,
                COUNT(*) AS count
         FROM games WHERE outcome = 'won' GROUP BY bucket`,
      )
      .all() as Array<{ bucket: string; count: number }>;
    const order = ['≤10', '11-15', '16-20', '21-25', '26-30', '>30'];
    const top = this.db
      .prepare(`SELECT song_id, COUNT(*) AS count FROM games WHERE song_id IS NOT NULL GROUP BY song_id ORDER BY count DESC LIMIT 5`)
      .all() as Array<{ song_id: string; count: number }>;
    const learned = one<{ n: number }>('SELECT COUNT(*) AS n FROM song_question_counts');
    const games = Number(totals.games ?? 0);
    const won = Number(totals.won ?? 0);
    return {
      games,
      won,
      lost: Number(totals.lost ?? 0),
      winRate: games ? won / games : 0,
      avgQuestionsWon: totals.avg === null ? null : Number(totals.avg),
      byMode: Object.fromEntries(
        byModeRows.map((r) => [r.mode, { games: Number(r.games), won: Number(r.won ?? 0), avgQuestionsWon: r.avg === null ? null : Number(r.avg) }]),
      ),
      questionsHistogram: order.map((bucket) => ({ bucket, count: Number(histogramRows.find((r) => r.bucket === bucket)?.count ?? 0) })),
      topSongs: top.map((r) => ({ songId: r.song_id, count: Number(r.count) })),
      learnedFacts: Number(learned.n ?? 0),
    };
  }
}

import {
  ANSWER_INDEX,
  BASE_UNKNOWN_RATE,
  ENTROPY_BY_CODE,
  LEARNING_WEIGHT,
  LOG_LIKELIHOOD,
  P_BY_CODE,
  TOLERANT_LOG_LIKELIHOOD,
  answerEntropy,
  answerLikelihood,
  fromCode,
  toCode,
} from './answers';
import { normalizeSearch, type CompiledCatalog, type CompiledQuestion } from './compile';
import { LEARNING_PRIORITY } from './questions';
import { COUNTRY_BY_CODE } from './taxonomy';
import {
  ANSWERS,
  FAMILY_INFO,
  type Answer,
  type AnswerRecord,
  type Clue,
  type Decision,
  type Family,
  type GameInput,
  type Mode,
  type Progress,
  type PublicQuestion,
  type SongView,
} from './types';

export interface ModeConfig {
  maxQuestions: number;
  maxGuesses: number;
  /** Confianza a partir de la cual se intenta adivinar. */
  guessThreshold: number;
  /** ...o confianza mínima + ventaja sobre la segunda canción. */
  ratioMinConfidence: number;
  ratioThreshold: number;
  /** Preguntas mínimas antes del primer intento. */
  minQuestions: number;
  /** A partir de aquí se intenta cada `forcedGuessEvery` preguntas aunque no haya mucha confianza. */
  forcedGuessAfter: number;
  forcedGuessEvery: number;
  forcedGuessMinConfidence: number;
  /** Si la mejor pregunta aporta menos (bits), se intenta adivinar. */
  minInfoGain: number;
}

export const MODE_CONFIG: Record<Mode, ModeConfig> = {
  normal: {
    maxQuestions: 60,
    maxGuesses: 6,
    guessThreshold: 0.85,
    ratioMinConfidence: 0.55,
    ratioThreshold: 8,
    minQuestions: 4,
    forcedGuessAfter: 30,
    forcedGuessEvery: 8,
    forcedGuessMinConfidence: 0.3,
    minInfoGain: 0.03,
  },
  hard: {
    maxQuestions: 70,
    maxGuesses: 7,
    guessThreshold: 0.85,
    ratioMinConfidence: 0.55,
    ratioThreshold: 8,
    minQuestions: 5,
    forcedGuessAfter: 35,
    forcedGuessEvery: 8,
    forcedGuessMinConfidence: 0.25,
    minInfoGain: 0.03,
  },
  // Reto 20: pocas preguntas y pocos intentos, así que la IA arriesga antes.
  challenge: {
    maxQuestions: 20,
    maxGuesses: 3,
    guessThreshold: 0.6,
    ratioMinConfidence: 0.4,
    ratioThreshold: 4,
    minQuestions: 3,
    forcedGuessAfter: 20,
    forcedGuessEvery: 99,
    forcedGuessMinConfidence: 0,
    minInfoGain: 0.02,
  },
};

/** P(sí) para «¿Es una canción de X?»: X es el artista principal, un invitado u otro. */
const ARTIST_PRIMARY = toCode(0.96);
const ARTIST_FEATURED = toCode(0.6);
const ARTIST_OTHER = toCode(0.02);

/** Masa mínima de un artista para preguntar por él, y preferencia frente a preguntas de atributo. */
const MIN_ARTIST_MASS = 0.1;
/** Al final de la partida se puede preguntar por artistas con menos masa. */
const MIN_ARTIST_MASS_LATE = 0.04;
const LATE_GAME = 12;
const ARTIST_QUESTION_WEIGHT = 0.9;
/** P(sí) a «¿El título contiene la palabra X?». */
const WORD_IN = toCode(0.95);
const WORD_OUT = toCode(0.03);
const WORD_QUESTION_WEIGHT = 0.85;

/** Copias locales de las tablas: leer un binding importado dentro del bucle caliente es ~15× más lento. */
const P_TABLE = Float64Array.from(P_BY_CODE);
const LOG_TABLES = LOG_LIKELIHOOD.map((t) => Float64Array.from(t));
const TOLERANT_LOG_TABLES = TOLERANT_LOG_LIKELIHOOD.map((t) => Float64Array.from(t));
/** Tras este número de intentos fallidos se recalcula con el modelo de respuesta tolerante. */
const TOLERANT_AFTER_GUESSES = 2;
const H_TABLE = Float64Array.from(ENTROPY_BY_CODE);

/** Bucle caliente (monomórfico): m = Σ w·p y H(A|s) esperada = Σ w·h(p). */
function accumulate(codes: Uint8Array, index: Int32Array, w: Float64Array, P: Float64Array, H: Float64Array, out: Float64Array): void {
  let m = 0;
  let condH = 0;
  for (let j = 0; j < index.length; j++) {
    const c = codes[index[j]];
    m += w[j] * P[c];
    condH += w[j] * H[c];
  }
  out[0] = m;
  out[1] = condH;
}

/** Por encima de este tamaño, la elección de pregunta usa solo las canciones con más masa. */
const MAX_ACTIVE = 25_000;
const MIN_ACTIVE_MASS = 1e-7;
/** Si casi todas las candidatas responderían igual, la pregunta no se hace. */
const NEAR_CERTAIN = 0.985;

export type ResolvedQuestion =
  | { kind: 'static'; q: CompiledQuestion }
  | { kind: 'artist'; artist: number }
  | { kind: 'word'; word: number };

export interface Posterior {
  /** Índices de canción del modo. */
  pool: Int32Array;
  /** Probabilidad posterior alineada con `pool` (suma 1, o 0 si no queda ninguna). */
  post: Float64Array;
  alive: boolean;
}

export interface ScoredQuestion {
  id: string;
  resolved: ResolvedQuestion;
  infoGain: number;
  score: number;
  yesProbability: number;
}

export type AnswerCounts = Record<Answer, number>;

export interface DataMismatch {
  questionId: string;
  question: string;
  answer: Answer;
  /** Lo que dicen los datos de la canción. */
  dataSaysYes: boolean;
}

export class Engine {
  /** Tasa de "no lo sé" por pregunta (a priori, refinada con lo aprendido). */
  private readonly unknownRate: Float64Array;

  constructor(readonly catalog: CompiledCatalog) {
    this.unknownRate = Float64Array.from(catalog.questions.map((q) => q.def.dk));
  }

  // ----------------------------------------------------------- preguntas

  resolve(id: string): ResolvedQuestion | null {
    const qi = this.catalog.questionIndex.get(id);
    if (qi !== undefined) return { kind: 'static', q: this.catalog.questions[qi] };
    if (id.startsWith('artist:')) {
      const a = Number(id.slice(7));
      if (Number.isInteger(a) && a >= 0 && a < this.catalog.artists.length) return { kind: 'artist', artist: a };
    }
    if (id.startsWith('word:')) {
      const w = this.catalog.wordIndex.get(id.slice(5));
      if (w !== undefined) return { kind: 'word', word: w };
    }
    return null;
  }

  static questionId(resolved: ResolvedQuestion, catalog: CompiledCatalog): string {
    if (resolved.kind === 'static') return resolved.q.def.id;
    if (resolved.kind === 'artist') return `artist:${resolved.artist}`;
    return `word:${catalog.words[resolved.word]}`;
  }

  private wordCode(song: number, word: number): number {
    const words = this.catalog.titleWords[song];
    for (let j = 0; j < words.length; j++) if (words[j] === word) return WORD_IN;
    return WORD_OUT;
  }

  private artistCode(song: number, artist: number): number {
    const artists = this.catalog.songs[song].artists;
    if (artists[0] === artist) return ARTIST_PRIMARY;
    for (let j = 1; j < artists.length; j++) if (artists[j] === artist) return ARTIST_FEATURED;
    return ARTIST_OTHER;
  }

  /** Código de P(sí) de una canción para una pregunta (estática o dinámica). */
  code(resolved: ResolvedQuestion, song: number): number {
    if (resolved.kind === 'static') return resolved.q.codes[song];
    if (resolved.kind === 'artist') return this.artistCode(song, resolved.artist);
    return this.wordCode(song, resolved.word);
  }

  /** ¿La fuente tiene el dato? (artista y título siempre se conocen). */
  isKnown(resolved: ResolvedQuestion, song: number): boolean {
    return resolved.kind !== 'static' || resolved.q.known[song] === 1;
  }

  private family(resolved: ResolvedQuestion): Family {
    return resolved.kind === 'static' ? resolved.q.def.family : resolved.kind === 'artist' ? 'artist' : 'title';
  }

  questionText(resolved: ResolvedQuestion): string {
    if (resolved.kind === 'static') return resolved.q.def.text;
    if (resolved.kind === 'artist') return `¿Es una canción de ${this.catalog.artists[resolved.artist]}?`;
    return `¿El título contiene la palabra «${this.catalog.wordDisplay[resolved.word]}»?`;
  }

  publicQuestion(resolved: ResolvedQuestion): PublicQuestion {
    const family = this.family(resolved);
    return {
      id: Engine.questionId(resolved, this.catalog),
      text: this.questionText(resolved),
      family,
      familyLabel: FAMILY_INFO[family].label,
      icon: FAMILY_INFO[family].icon,
      ...(resolved.kind !== 'static' ? { dynamic: true } : {}),
    };
  }

  // ------------------------------------------------------------ posterior

  posterior(input: GameInput): Posterior {
    const prior = this.catalog.modes[input.mode];
    const pool = prior.pool;
    const n = pool.length;
    const logw = Float64Array.from(prior.logPrior);
    const tables = input.guesses.length >= TOLERANT_AFTER_GUESSES ? TOLERANT_LOG_TABLES : LOG_TABLES;
    for (const ans of input.answers) {
      const r = this.resolve(ans.q);
      const table = tables[ANSWER_INDEX[ans.a]];
      if (!r || !table) continue;
      if (r.kind === 'static') {
        const codes = r.q.codes;
        for (let k = 0; k < n; k++) logw[k] += table[codes[pool[k]]];
      } else {
        for (let k = 0; k < n; k++) logw[k] += table[this.code(r, pool[k])];
      }
    }
    const rejected = new Set<number>();
    for (const g of input.guesses) {
      const i = this.catalog.idIndex.get(g.id);
      if (i !== undefined) rejected.add(i);
    }
    let max = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < n; k++) {
      if (rejected.has(pool[k])) logw[k] = Number.NEGATIVE_INFINITY;
      else if (logw[k] > max) max = logw[k];
    }
    const post = new Float64Array(n);
    let sum = 0;
    if (max > Number.NEGATIVE_INFINITY) {
      for (let k = 0; k < n; k++) {
        const w = Math.exp(logw[k] - max);
        post[k] = w;
        sum += w;
      }
      for (let k = 0; k < n; k++) post[k] /= sum;
    }
    return { pool, post, alive: sum > 0 };
  }

  /** Las k posiciones (en el pool) con más probabilidad, de mayor a menor. */
  static topK(post: Float64Array, k: number): number[] {
    const best: number[] = [];
    for (let i = 0; i < post.length; i++) {
      const v = post[i];
      if (best.length === k && v <= post[best[k - 1]]) continue;
      let j = best.length < k ? best.length : k - 1;
      if (best.length < k) best.push(i);
      while (j > 0 && post[best[j - 1]] < v) {
        best[j] = best[j - 1];
        j--;
      }
      best[j] = i;
    }
    return best;
  }

  static effectiveCandidates(post: Float64Array): number {
    let h = 0;
    for (let i = 0; i < post.length; i++) {
      const p = post[i];
      if (p > 0) h -= p * Math.log(p);
    }
    return Math.exp(h);
  }

  // --------------------------------------------------- elección de pregunta

  rankQuestions(input: GameInput, posterior: Posterior, limit = 1): ScoredQuestion[] {
    const { pool, post } = posterior;

    // Conjunto activo: canciones con masa apreciable (renormalizado)
    let active: number[] = [];
    for (let k = 0; k < post.length; k++) if (post[k] > MIN_ACTIVE_MASS) active.push(k);
    if (active.length > MAX_ACTIVE) active = active.sort((a, b) => post[b] - post[a]).slice(0, MAX_ACTIVE);
    const songs = new Int32Array(active.length);
    const w = new Float64Array(active.length);
    let total = 0;
    active.forEach((k, j) => {
      songs[j] = pool[k];
      w[j] = post[k];
      total += post[k];
    });
    if (total <= 0) return [];
    for (let j = 0; j < w.length; j++) w[j] /= total;

    const context = this.answerContext(input.answers);
    const scored: ScoredQuestion[] = [];
    const acc = new Float64Array(2);
    const consider = (resolved: ResolvedQuestion, id: string, family: Family, unknownRate: number, codes: Uint8Array, index: Int32Array, extra: number) => {
      accumulate(codes, index, w, P_TABLE, H_TABLE, acc);
      const m = acc[0];
      if (m > NEAR_CERTAIN || m < 1 - NEAR_CERTAIN) return;
      const infoGain = Math.max(0, answerEntropy(m) - acc[1]);
      const answerability = Math.min(1.05, Math.max(0.3, (1 - unknownRate) / (1 - BASE_UNKNOWN_RATE)));
      const score = infoGain * answerability * this.familyFactor(family, context) * extra;
      scored.push({ id, resolved, infoGain, score, yesProbability: m });
    };

    for (const q of this.catalog.questions) {
      const def = q.def;
      if (context.asked.has(def.id)) continue;
      if (def.group && context.closedGroups.has(def.group)) continue;
      if (def.parent && context.definiteNo.has(def.parent)) continue;
      if (def.era && eraDetermined(def.era, context.era)) continue;
      consider({ kind: 'static', q }, def.id, def.family, this.unknownRate[q.index], q.codes, songs, def.weight ?? 1);
    }

    // Preguntas dinámicas: solo artistas que concentran bastante probabilidad,
    // para no preguntar por nombres al azar.
    const artistMass = new Map<number, number>();
    for (let j = 0; j < songs.length; j++) {
      const artists = this.catalog.songs[songs[j]].artists;
      for (let idx = 0; idx < artists.length; idx++) {
        artistMass.set(artists[idx], (artistMass.get(artists[idx]) ?? 0) + w[j] * (idx === 0 ? 1 : 0.5));
      }
    }
    const late = input.answers.length >= LATE_GAME;
    const minArtistMass = late ? MIN_ARTIST_MASS_LATE : MIN_ARTIST_MASS;
    const topArtists = [...artistMass.entries()]
      .filter(([a, mass]) => mass >= minArtistMass && !context.asked.has(`artist:${a}`))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const identity = Int32Array.from({ length: songs.length }, (_, j) => j);
    const codes = new Uint8Array(songs.length);
    const artistExtra = ARTIST_QUESTION_WEIGHT * (input.answers.length < 6 ? 0.85 : 1);
    for (const [artist] of topArtists) {
      for (let j = 0; j < songs.length; j++) codes[j] = this.artistCode(songs[j], artist);
      consider({ kind: 'artist', artist }, `artist:${artist}`, 'artist', 0.03, codes, identity, artistExtra);
    }

    // Preguntas dinámicas sobre palabras del título: la herramienta de detective
    // para separar las últimas candidatas (el jugador conoce el título de su canción).
    if (input.answers.length >= 6) {
      const wordMass = new Map<number, number>();
      for (let j = 0; j < songs.length; j++) {
        const tw = this.catalog.titleWords[songs[j]];
        for (let t = 0; t < tw.length; t++) wordMass.set(tw[t], (wordMass.get(tw[t]) ?? 0) + w[j]);
      }
      const topWords = [...wordMass.entries()]
        .filter(([word, mass]) => mass >= 0.05 && mass <= 0.95 && !context.asked.has(`word:${this.catalog.words[word]}`))
        .sort((a, b) => Math.abs(a[1] - 0.5) - Math.abs(b[1] - 0.5))
        .slice(0, 5);
      const wordExtra = WORD_QUESTION_WEIGHT * (late ? 1 : 0.7);
      for (const [word] of topWords) {
        for (let j = 0; j < songs.length; j++) codes[j] = this.wordCode(songs[j], word);
        consider({ kind: 'word', word }, `word:${this.catalog.words[word]}`, 'title', 0.04, codes, identity, wordExtra);
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private answerContext(answers: AnswerRecord[]) {
    const asked = new Set<string>();
    const closedGroups = new Set<string>();
    const definiteNo = new Set<string>();
    const recentFamilies: Family[] = [];
    const unknownByFamily = new Map<Family, number>();
    let lo = Number.NEGATIVE_INFINITY;
    let hi = Number.POSITIVE_INFINITY;
    for (const ans of answers) {
      asked.add(ans.q);
      const r = this.resolve(ans.q);
      if (!r) continue;
      const family = this.family(r);
      recentFamilies.push(family);
      if (ans.a === 'unknown') unknownByFamily.set(family, (unknownByFamily.get(family) ?? 0) + 1);
      if (r.kind !== 'static') continue;
      const def = r.q.def;
      if (ans.a === 'yes' && def.group) closedGroups.add(def.group);
      if (ans.a === 'no') definiteNo.add(def.id);
      if (def.era && (ans.a === 'yes' || ans.a === 'no')) {
        const [a, b] = def.era;
        if (ans.a === 'yes') {
          lo = Math.max(lo, a);
          hi = Math.min(hi, b);
        } else if (a <= lo || a <= -9999) lo = Math.max(lo, b);
        else if (b >= hi || b >= 9999) hi = Math.min(hi, a);
      }
    }
    return {
      asked,
      closedGroups,
      definiteNo,
      recent: recentFamilies.slice(-3).reverse(),
      unknownByFamily,
      era: [lo, hi] as [number, number],
    };
  }

  /**
   * Variedad y sentido común: penaliza repetir la familia de las últimas
   * preguntas y las familias en las que el jugador ya ha dicho "no lo sé"
   * (si no sabe la época, probablemente tampoco sepa la década).
   */
  private familyFactor(family: Family, context: { recent: Family[]; unknownByFamily: Map<Family, number> }): number {
    const same = context.recent.filter((f) => f === family).length;
    let factor = same >= 2 ? 0.55 : context.recent[0] === family ? 0.75 : 1;
    const unknowns = context.unknownByFamily.get(family) ?? 0;
    if (unknowns) factor *= Math.max(0.3, 0.6 ** unknowns);
    return factor;
  }

  // ------------------------------------------------------------- decisión

  step(input: GameInput): Decision {
    const cfg = MODE_CONFIG[input.mode];
    const posterior = this.posterior(input);
    const asked = input.answers.length;
    const guessed = input.guesses.length;
    const ranking = posterior.alive ? Engine.topK(posterior.post, 5) : [];
    const progress: Progress = {
      asked,
      guesses: guessed,
      effectiveCandidates: posterior.alive ? Engine.effectiveCandidates(posterior.post) : 0,
      topConfidence: ranking.length ? posterior.post[ranking[0]] : 0,
      poolSize: posterior.pool.length,
      maxQuestions: cfg.maxQuestions,
      maxGuesses: cfg.maxGuesses,
    };
    if (guessed >= cfg.maxGuesses || !posterior.alive) return this.giveUp(posterior, ranking, progress);

    const top = ranking[0];
    const conf = posterior.post[top];
    const second = ranking.length > 1 ? posterior.post[ranking[1]] : 0;
    const lastGuessAt = guessed ? Math.max(...input.guesses.map((g) => g.at)) : Number.NEGATIVE_INFINITY;
    const justGuessed = guessed > 0 && lastGuessAt >= asked;
    const guess = () => this.makeGuess(input, posterior, top, progress);

    if (asked >= cfg.maxQuestions) return guess();
    if (!justGuessed && asked >= cfg.minQuestions) {
      if (conf >= cfg.guessThreshold) return guess();
      if (conf >= cfg.ratioMinConfidence && conf >= cfg.ratioThreshold * second) return guess();
      const dueForced = asked >= cfg.forcedGuessAfter && (guessed === 0 || asked - lastGuessAt >= cfg.forcedGuessEvery);
      if (dueForced && conf >= cfg.forcedGuessMinConfidence) return guess();
    }
    const best = this.selectQuestion(input, posterior);
    if (!best || best.score < cfg.minInfoGain) return guess();
    return { type: 'question', question: this.publicQuestion(best.resolved), progress };
  }

  /** Estrategia de elección de pregunta (las líneas base del benchmark la sustituyen). */
  protected selectQuestion(input: GameInput, posterior: Posterior): ScoredQuestion | undefined {
    if (input.seed === undefined) return this.rankQuestions(input, posterior, 1)[0];
    const ranked = this.rankQuestions(input, posterior, 4);
    const near = ranked.filter((r) => r.score >= ranked[0].score * NEAR_TIE);
    return near[mix(input.seed, input.answers.length) % near.length];
  }

  private makeGuess(input: GameInput, posterior: Posterior, top: number, progress: Progress): Decision {
    const song = posterior.pool[top];
    return {
      type: 'guess',
      song: this.songView(song),
      confidence: posterior.post[top],
      clues: this.clues(input, song),
      progress,
    };
  }

  private giveUp(posterior: Posterior, ranking: number[], progress: Progress): Decision {
    return {
      type: 'give_up',
      progress,
      candidates: ranking.slice(0, 3).map((k) => ({ song: this.songView(posterior.pool[k]), confidence: posterior.post[k] })),
    };
  }

  /** Respuestas que más apoyan la canción frente a una canción típica del modo ("lo deduje porque…"). */
  clues(input: GameInput, song: number, max = 3): Clue[] {
    const meanYes = this.catalog.modes[input.mode].meanYes;
    const scored: Array<{ clue: Clue; ratio: number }> = [];
    for (const ans of input.answers) {
      if (ans.a === 'unknown') continue;
      const r = this.resolve(ans.q);
      if (!r || !this.isKnown(r, song)) continue;
      const p = fromCode(this.code(r, song));
      const typical = r.kind === 'static' ? meanYes[r.q.index] : fromCode(r.kind === 'artist' ? ARTIST_OTHER : WORD_OUT);
      const ratio = answerLikelihood(ans.a, p) / answerLikelihood(ans.a, typical);
      if (ratio >= 2) scored.push({ clue: { question: this.questionText(r), answer: ans.a }, ratio });
    }
    return scored.sort((a, b) => b.ratio - a.ratio).slice(0, max).map((s) => s.clue);
  }

  // ------------------------------------------------------------ canciones

  songView(i: number): SongView {
    const s = this.catalog.songs[i];
    const artists = s.artists.map((a) => this.catalog.artists[a]);
    const links = [];
    if (s.sources.sp) links.push({ label: 'Spotify', url: `https://open.spotify.com/track/${s.sources.sp}` });
    links.push({
      label: 'YouTube',
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${s.title} ${artists[0] ?? s.credit}`)}`,
    });
    if (s.sources.bb) links.push({ label: 'Billboard', url: `https://www.billboard.com/charts/hot-100/${s.sources.bb[2]}/` });
    return {
      id: s.id,
      title: s.title,
      credit: s.credit,
      artists,
      year: s.year,
      ...(s.work ? { work: s.work } : {}),
      popularity: s.popularity,
      sources: describeSources(s.sources),
      links,
    };
  }

  songIndex(id: string): number | undefined {
    return this.catalog.idIndex.get(id);
  }

  /** Búsqueda de catálogo por título y artista (para "¿en qué canción pensabas?"). */
  search(query: string, limit = 8): SongView[] {
    const tokens = normalizeSearch(query).split(' ').filter(Boolean);
    if (!tokens.length) return [];
    const hits: Array<{ i: number; score: number }> = [];
    const songs = this.catalog.songs;
    for (let i = 0; i < songs.length; i++) {
      const text = songs[i].search;
      if (!tokens.every((t) => text.includes(t))) continue;
      const titleStart = normalizeSearch(songs[i].title).startsWith(tokens[0]) ? 0.3 : 0;
      hits.push({ i, score: songs[i].popularity + titleStart });
    }
    return hits
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((h) => this.songView(h.i));
  }

  // ----------------------------------------------------------- aprendizaje

  /**
   * Recalcula P(sí) de una celda (canción, pregunta) combinando el dato de la
   * fuente con las respuestas acumuladas de jugadores que confirmaron esa canción.
   * Un dato fiable de la fuente cuesta más de mover que una tasa base.
   */
  applyLearning(songId: string, questionId: string, counts: AnswerCounts): boolean {
    const s = this.catalog.idIndex.get(songId);
    const qi = this.catalog.questionIndex.get(questionId);
    if (s === undefined || qi === undefined) return false;
    const q = this.catalog.questions[qi];
    const pData = fromCode(q.dataCodes[s]);
    const k = q.known[s] ? 4 + 8 * Math.abs(2 * pData - 1) : 1.5;
    let evidence = 0;
    let n = 0;
    for (const a of ANSWERS) {
      const weight = LEARNING_WEIGHT[a];
      if (weight === null) continue;
      evidence += weight * (counts[a] ?? 0);
      n += counts[a] ?? 0;
    }
    q.codes[s] = toCode((k * pData + evidence) / (k + n));
    return true;
  }

  /** Actualiza la tasa de "no lo sé" de una pregunta con lo observado. */
  setUnknownStats(questionId: string, asked: number, unknown: number): void {
    const qi = this.catalog.questionIndex.get(questionId);
    if (qi === undefined) return;
    const prior = this.catalog.questions[qi].def.dk;
    this.unknownRate[qi] = (unknown + 20 * prior) / (asked + 20);
  }

  /** Respuestas del jugador que contradicen los datos de la canción confirmada. */
  compareWithData(songId: string, answers: AnswerRecord[]): DataMismatch[] {
    const s = this.catalog.idIndex.get(songId);
    if (s === undefined) return [];
    const out: DataMismatch[] = [];
    for (const ans of answers) {
      const r = this.resolve(ans.q);
      if (!r || r.kind !== 'static' || !r.q.known[s]) continue;
      const p = fromCode(r.q.dataCodes[s]);
      const saidYes = ans.a === 'yes' || ans.a === 'probably';
      const saidNo = ans.a === 'no' || ans.a === 'probably_not';
      if ((saidYes && p < 0.25) || (saidNo && p > 0.75)) {
        out.push({ questionId: ans.q, question: r.q.def.text, answer: ans.a, dataSaysYes: p > 0.5 });
      }
    }
    return out;
  }

  /** Preguntas que conviene hacer sobre una canción ya confirmada para rellenar huecos de datos. */
  learningQuestions(songId: string, alreadyAnswered: Iterable<string>, max = 3): PublicQuestion[] {
    const s = this.catalog.idIndex.get(songId);
    if (s === undefined) return [];
    const answered = new Set(alreadyAnswered);
    const out: PublicQuestion[] = [];
    for (const id of LEARNING_PRIORITY) {
      if (out.length >= max) break;
      const r = this.resolve(id);
      if (!r || r.kind !== 'static' || answered.has(id)) continue;
      const confident = r.q.known[s] && Math.abs(fromCode(r.q.dataCodes[s]) - 0.5) > 0.3;
      if (!confident) out.push(this.publicQuestion(r));
    }
    return out;
  }
}

/** Margen para considerar dos preguntas "casi igual de buenas". */
const NEAR_TIE = 0.96;

/** Hash entero reproducible de (semilla, turno). */
function mix(seed: number, turn: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(turn + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/** ¿La respuesta a una pregunta de época ya está determinada por el intervalo factible? */
function eraDetermined([a, b]: [number, number], [lo, hi]: [number, number]): boolean {
  return (a <= lo && b >= hi) || b <= lo || a >= hi;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}/${y}`;
}

export function describeSources(s: CompiledCatalog['songs'][number]['sources']): string[] {
  const out: string[] = [];
  if (s.bb) {
    const [peak, weeks, first] = s.bb;
    out.push(`Billboard Hot 100: puesto máximo ${peak}, ${weeks} ${weeks === 1 ? 'semana' : 'semanas'} en lista (entró el ${formatDate(first)})`);
  }
  if (s.n1) out.push(`Número 1 en EE. UU. el ${formatDate(s.n1)} · anotada en «Uncharted Territory» (C. Dalla Riva)`);
  if (s.ev) {
    const [year, code, rank, winner] = s.ev;
    const country = COUNTRY_BY_CODE.get(code)?.name ?? code;
    out.push(`Eurovisión ${year} · ${country} · ${winner ? 'ganadora' : rank !== null ? `puesto ${rank} en la final` : 'no llegó a la final'}`);
  }
  if (s.pl) out.push('Playlists de Spotify por género (TidyTuesday 2020)');
  else if (s.sp) out.push('Rasgos de audio de Spotify (TidyTuesday 2021)');
  return out;
}

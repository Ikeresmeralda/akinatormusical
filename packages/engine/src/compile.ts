import { factToYes, fromCode, toCode } from './answers';
import type { RawCatalog, RawSources, SourceInfo } from './catalog';
import { QUESTIONS, type QuestionDef, type SongFacts } from './questions';
import { MODES, type Mode } from './types';

export interface CompiledSong {
  id: string;
  title: string;
  credit: string;
  /** Índices de artista; el primero es el principal. */
  artists: number[];
  year: number | null;
  duration: number | null;
  popularity: number;
  sources: RawSources;
  work?: string;
  /** Texto normalizado para búsqueda. */
  search: string;
}

export interface CompiledQuestion {
  index: number;
  def: QuestionDef;
  /** Código uint8 de P(el jugador dice "sí") por canción: datos + aprendizaje. */
  codes: Uint8Array;
  /** Solo datos (sin aprendizaje), para recalcular celdas. */
  dataCodes: Uint8Array;
  /** 1 si la fuente aporta el dato; 0 si se usa la tasa base. */
  known: Uint8Array;
  /** P(sí) usada para canciones sin datos. */
  baseYes: number;
  /** Fracción de canciones con dato. */
  coverage: number;
}

export interface ModePrior {
  /** Índices de canción del catálogo de este modo. */
  pool: Int32Array;
  /** log prior alineado con `pool`. */
  logPrior: Float64Array;
  /** P(sí) media de cada pregunta bajo el prior (para explicar pistas). */
  meanYes: Float64Array;
}

export interface CompiledCatalog {
  builtAt: string;
  /** Palabras significativas del título de cada canción (ids de `words`). */
  titleWords: Int32Array[];
  words: string[];
  /** Forma legible de cada palabra (con tildes), para el texto de la pregunta. */
  wordDisplay: string[];
  wordIndex: Map<string, number>;
  sources: SourceInfo[];
  songs: CompiledSong[];
  idIndex: Map<string, number>;
  artists: string[];
  artistKeys: string[];
  /** Canciones en las que aparece cada artista. */
  artistSongs: number[][];
  questions: CompiledQuestion[];
  questionIndex: Map<string, number>;
  modes: Record<Mode, ModePrior>;
}

/** Macrogéneros que definen los grupos de canciones parecidas para imputar datos ausentes. */
const MACRO_GENRES = ['pop', 'rock', 'hiphop', 'rnb', 'electronic', 'latin', 'country', 'folk', 'jazz'];

/** Popularidad mínima para el catálogo del modo normal (y reto). */
export const NORMAL_MIN_POPULARITY = 0.5;

const PRIOR: Record<Mode, (pop: number) => number> = {
  // La gente piensa sobre todo en grandes éxitos: un número 1 es ~13 veces más
  // probable que un éxito menor de los que cierran el catálogo normal.
  normal: (p) => (p + 0.05) ** 3,
  challenge: (p) => (p + 0.05) ** 3,
  // Modo difícil: catálogo completo y prior casi plano.
  hard: (p) => (p + 0.25) ** 0.7,
};

/** Palabras vacías que no sirven para preguntas del tipo «¿El título contiene la palabra X?». */
const STOPWORDS = new Set(
  (
    'the and you your for with that this are but not all can dont from what when who why how its out get got just ' +
    'like let into over its was were has have had will would she her him his they them our ours yours mine than then ' +
    'que los las del con por una uno unos unas mis tus sus mas pero como para sin hay esta este eso esa ese muy ' +
    'love amor part feat version remix pt'
  ).split(' '),
);

function titleTokens(title: string): string[] {
  const bare = title.replace(/[([][^)\]]*[)\]]/g, ' ');
  return [...new Set(normalizeSearch(bare).split(' '))].filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compileCatalog(raw: RawCatalog, questions: QuestionDef[] = QUESTIONS): CompiledCatalog {
  const N = raw.songs.length;

  // --- Columnas de hechos (−1 = ausente) y de rasgos numéricos (NaN = ausente)
  const factCols = new Map<string, Int8Array>();
  const familyCols = new Map<string, Uint8Array>();
  raw.factKeys.forEach((key) => {
    factCols.set(key, new Int8Array(N).fill(-1));
    const family = key.split(':')[0];
    if (!familyCols.has(family)) familyCols.set(family, new Uint8Array(N));
  });
  const numCols = new Map<string, Float32Array>(raw.numKeys.map((k) => [k, new Float32Array(N).fill(Number.NaN)]));
  const factByIndex = raw.factKeys.map((k) => factCols.get(k)!);
  const familyByIndex = raw.factKeys.map((k) => familyCols.get(k.split(':')[0])!);
  const numByIndex = raw.numKeys.map((k) => numCols.get(k)!);

  const songs: CompiledSong[] = new Array(N);
  const idIndex = new Map<string, number>();
  const wordIndex = new Map<string, number>();
  const words: string[] = [];
  const wordDisplay: string[] = [];
  const titleWords: Int32Array[] = new Array(N);
  const artistSongs: number[][] = raw.artists.map(() => []);
  for (let i = 0; i < N; i++) {
    const s = raw.songs[i];
    for (let j = 0; j < s.f.length; j += 2) {
      factByIndex[s.f[j]][i] = s.f[j + 1];
      familyByIndex[s.f[j]][i] = 1;
    }
    for (let j = 0; j < s.n.length; j += 2) numByIndex[s.n[j]][i] = s.n[j + 1];
    songs[i] = {
      id: s.id,
      title: s.t,
      credit: s.c,
      artists: s.a,
      year: s.y,
      duration: s.d,
      popularity: s.p,
      sources: s.s,
      work: s.w,
      search: normalizeSearch(`${s.t} ${s.c}`),
    };
    idIndex.set(s.id, i);
    for (const a of s.a) artistSongs[a].push(i);
    const originals = new Map<string, string>();
    for (const w of s.t.replace(/[([][^)\]]*[)\]]/g, ' ').split(/[^\p{L}\p{N}]+/u)) {
      const key = normalizeSearch(w);
      if (key && !originals.has(key)) originals.set(key, w.toLowerCase());
    }
    titleWords[i] = Int32Array.from(
      titleTokens(s.t).map((t) => {
        if (!wordIndex.has(t)) {
          wordIndex.set(t, words.length);
          words.push(t);
          wordDisplay.push(originals.get(t) ?? t);
        }
        return wordIndex.get(t)!;
      }),
    );
  }

  // --- Acceso a los datos de la canción i para los predicados de las preguntas
  let cur = 0;
  const view: SongFacts = {
    fact(key) {
      const v = factCols.get(key)?.[cur];
      return v === undefined || v < 0 ? undefined : v / 100;
    },
    hasFamily(family) {
      return familyCols.get(family)?.[cur] === 1;
    },
    num(key) {
      const v = numCols.get(key)?.[cur];
      return v === undefined || Number.isNaN(v) ? undefined : v;
    },
    get year() {
      return raw.songs[cur].y;
    },
    get yearQuality() {
      return raw.songs[cur].yq;
    },
    get duration() {
      return raw.songs[cur].d;
    },
    get popularity() {
      return raw.songs[cur].p;
    },
    get title() {
      return raw.songs[cur].t;
    },
    get artist() {
      const a = raw.songs[cur].a[0];
      return a === undefined ? raw.songs[cur].c : raw.artists[a];
    },
  };

  // --- Priors por modo (se usan también para ponderar las tasas base)
  const priorWeight = (mode: Mode, i: number) => PRIOR[mode](songs[i].popularity);
  const inPool = (mode: Mode, i: number) => mode === 'hard' || songs[i].popularity >= NORMAL_MIN_POPULARITY;

  // --- Grupos de canciones parecidas (macrogénero × década) para imputar datos ausentes
  const clusterOf = new Int32Array(N);
  const macroCols = MACRO_GENRES.map((g) => factCols.get(`g:${g}`));
  for (let i = 0; i < N; i++) {
    let best = -1;
    let bestV = 0;
    macroCols.forEach((col, g) => {
      const v = col?.[i] ?? -1;
      if (v > bestV) {
        bestV = v;
        best = g;
      }
    });
    const year = songs[i].year ?? 1990;
    const decade = Math.min(7, Math.max(0, Math.floor((year - 1950) / 10)));
    clusterOf[i] = (best + 1) * 8 + decade;
  }
  const nClusters = (MACRO_GENRES.length + 1) * 8;

  // --- Matriz canción × pregunta
  const compiled: CompiledQuestion[] = questions.map((def, index) => {
    const raw = new Float64Array(N);
    const known = new Uint8Array(N);
    let wSum = 0;
    let ySum = 0;
    let knownCount = 0;
    const cw = new Float64Array(nClusters);
    const cy = new Float64Array(nClusters);
    for (let i = 0; i < N; i++) {
      cur = i;
      const p = def.p(view);
      if (p === null || Number.isNaN(p)) continue;
      const yes = factToYes(Math.min(1, Math.max(0, p)));
      raw[i] = yes;
      known[i] = 1;
      knownCount++;
      const w = priorWeight('normal', i) * (inPool('normal', i) ? 1 : 0.25);
      wSum += w;
      ySum += w * yes;
      cw[clusterOf[i]] += w;
      cy[clusterOf[i]] += w * yes;
    }
    const baseYes = wSum > 0 ? ySum / wSum : factToYes(def.fallbackRate ?? 0.05);
    // Tasa base por grupo, encogida hacia la global (equivale a ~25 canciones de peso medio)
    const shrink = wSum > 0 ? (25 * wSum) / Math.max(1, knownCount) : 1;
    const clusterCode = new Uint8Array(nClusters);
    for (let c = 0; c < nClusters; c++) clusterCode[c] = toCode((cy[c] + shrink * baseYes) / (cw[c] + shrink));
    const dataCodes = new Uint8Array(N);
    for (let i = 0; i < N; i++) dataCodes[i] = known[i] ? toCode(raw[i]) : clusterCode[clusterOf[i]];
    return { index, def, codes: dataCodes.slice(), dataCodes, known, baseYes, coverage: knownCount / N };
  });

  const modes = {} as Record<Mode, ModePrior>;
  for (const mode of MODES) {
    const pool: number[] = [];
    for (let i = 0; i < N; i++) if (inPool(mode, i)) pool.push(i);
    const logPrior = new Float64Array(pool.length);
    let total = 0;
    pool.forEach((i, k) => {
      const w = priorWeight(mode, i);
      logPrior[k] = Math.log(w);
      total += w;
    });
    const logTotal = Math.log(total);
    for (let k = 0; k < pool.length; k++) logPrior[k] -= logTotal;
    const weights = logPrior.map((l) => Math.exp(l));
    const meanYes = new Float64Array(compiled.length);
    for (const q of compiled) {
      let m = 0;
      const codes = q.codes;
      for (let k = 0; k < pool.length; k++) m += weights[k] * codes[pool[k]];
      meanYes[q.index] = fromCode(m);
    }
    modes[mode] = { pool: Int32Array.from(pool), logPrior, meanYes };
  }

  return {
    builtAt: raw.builtAt,
    titleWords,
    words,
    wordDisplay,
    wordIndex,
    sources: raw.sources,
    songs,
    idIndex,
    artists: raw.artists,
    artistKeys: raw.artists.map(normalizeSearch),
    artistSongs,
    questions: compiled,
    questionIndex: new Map(compiled.map((q) => [q.def.id, q.index])),
    modes,
  };
}

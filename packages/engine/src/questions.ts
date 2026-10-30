import { COUNTRIES, GENRES, LANGUAGES, REGIONS, THEMES } from './taxonomy';
import type { Family } from './types';

/** Acceso de solo lectura a los datos de una canción durante la compilación. */
export interface SongFacts {
  fact(key: string): number | undefined;
  /** ¿Hay algún hecho cuya clave empiece por `family:`? (la familia es conocida) */
  hasFamily(family: string): boolean;
  num(key: string): number | undefined;
  readonly year: number | null;
  readonly yearQuality: 0 | 1;
  readonly duration: number | null;
  readonly popularity: number;
  readonly title: string;
  /** Nombre del artista principal. */
  readonly artist: string;
}

export interface QuestionDef {
  id: string;
  text: string;
  family: Family;
  /** Grupo exclusivo: un "sí" rotundo a una pregunta del grupo descarta las demás. */
  group?: string;
  /** Si esta pregunta recibió un "no" rotundo, no tiene sentido hacer la actual. */
  parent?: string;
  /** Intervalo de años [desde, hasta) que significa "sí" (preguntas de época). */
  era?: [number, number];
  /** Tasa a priori de "no lo sé". */
  dk: number;
  /** Preferencia relativa al elegir (1 = neutra). */
  weight?: number;
  /** Tasa base para canciones sin datos cuando nadie tiene datos (preguntas que solo se aprenden). */
  fallbackRate?: number;
  /** Probabilidad de que la respuesta verdadera sea "sí", o null si no hay datos. */
  p: (s: SongFacts) => number | null;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Aproximación de la función de distribución normal estándar (Abramowitz-Stegun). */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - tail : tail;
}

/**
 * P(el jugador cree que el año está en [from, to)). El jugador recuerda el año
 * con cierta imprecisión: ±0,8 años si el dato es de una lista, ±2 si sale de
 * la fecha de un álbum.
 */
function eraP(s: SongFacts, from: number, to: number): number | null {
  if (s.year === null) return null;
  const sigma = s.yearQuality === 1 ? 0.8 : 2;
  const mid = s.year + 0.5;
  return normalCdf((to - mid) / sigma) - normalCdf((from - mid) / sigma);
}

/** Hecho categórico: si la familia es conocida pero falta el valor, es improbable. */
function categorical(key: string, family: string, absent = 0.03) {
  return (s: SongFacts) => s.fact(key) ?? (s.hasFamily(family) ? absent : null);
}

const fact = (key: string) => (s: SongFacts) => s.fact(key) ?? null;

function eraQ(id: string, text: string, from: number, to: number, dk: number, group?: string): QuestionDef {
  return { id, text, family: 'era', era: [from, to], dk, group, p: (s) => eraP(s, from, to) };
}

const NEG = -10000;
const POS = 10000;

export const QUESTIONS: QuestionDef[] = [
  // ------------------------------------------------------------ Época
  eraQ('era_lt1970', '¿Se publicó antes de 1970?', NEG, 1970, 0.08),
  eraQ('era_lt1980', '¿Es anterior a 1980?', NEG, 1980, 0.08),
  eraQ('era_lt1990', '¿Es anterior a 1990?', NEG, 1990, 0.07),
  eraQ('era_lt2000', '¿Es anterior al año 2000?', NEG, 2000, 0.05),
  eraQ('era_lt2010', '¿Se publicó antes de 2010?', NEG, 2010, 0.06),
  eraQ('era_ge2015', '¿Es de 2015 o posterior?', 2015, POS, 0.07),
  eraQ('era_ge2020', '¿Salió en 2020 o después?', 2020, POS, 0.07),
  eraQ('era_ge2023', '¿Es muy reciente, de 2023 en adelante?', 2023, POS, 0.08),
  eraQ('dec_1950', '¿Es de los años 50?', 1950, 1960, 0.1, 'decade'),
  eraQ('dec_1960', '¿Es de los años 60?', 1960, 1970, 0.09, 'decade'),
  eraQ('dec_1970', '¿Es de los años 70?', 1970, 1980, 0.09, 'decade'),
  eraQ('dec_1980', '¿Es de los años 80?', 1980, 1990, 0.08, 'decade'),
  eraQ('dec_1990', '¿Es de los años 90?', 1990, 2000, 0.08, 'decade'),
  eraQ('dec_2000', '¿Es de la década de 2000 (entre 2000 y 2009)?', 2000, 2010, 0.08, 'decade'),
  eraQ('dec_2010', '¿Es de la década de 2010 (entre 2010 y 2019)?', 2010, 2020, 0.08, 'decade'),
  // Medias décadas: solo se plantean cuando la década ya está clara (lógica de intervalos).
  eraQ('half_1960', '¿Es de la primera mitad de los 60 (1960-1964)?', 1960, 1965, 0.2),
  eraQ('half_1970', '¿Es de la primera mitad de los 70 (1970-1974)?', 1970, 1975, 0.2),
  eraQ('half_1980', '¿Es de la primera mitad de los 80 (1980-1984)?', 1980, 1985, 0.2),
  eraQ('half_1990', '¿Es de la primera mitad de los 90 (1990-1994)?', 1990, 1995, 0.2),
  eraQ('half_2000', '¿Es de entre 2000 y 2004?', 2000, 2005, 0.18),
  eraQ('half_2010', '¿Es de entre 2010 y 2014?', 2010, 2015, 0.15),
  eraQ('half_2020', '¿Es de 2020, 2021 o 2022?', 2020, 2023, 0.12),

  // ------------------------------------------------------------ Idioma
  ...LANGUAGES.map(
    (l): QuestionDef => ({ id: `lang_${l.key}`, text: l.question, family: 'language', group: 'language', dk: l.dk, p: fact(`lang:${l.key}`) }),
  ),

  // ------------------------------------------------------------ Voz e intérprete
  {
    id: 'voice_female',
    text: '¿La voz principal es de una mujer?',
    family: 'voice',
    group: 'voice',
    dk: 0.04,
    p: (s) => (s.hasFamily('voice') ? (s.fact('voice:female') ?? 0) + 0.75 * (s.fact('voice:mixed') ?? 0) : null),
  },
  {
    id: 'voice_male',
    text: '¿La voz principal es de un hombre?',
    family: 'voice',
    group: 'voice',
    dk: 0.04,
    p: (s) => (s.hasFamily('voice') ? (s.fact('voice:male') ?? 0) + 0.75 * (s.fact('voice:mixed') ?? 0) : null),
  },
  { id: 'instrumental', text: '¿Es una pieza instrumental, sin letra cantada?', family: 'voice', group: 'voice', dk: 0.03, p: fact('voice:instr') },
  { id: 'str_group', text: '¿La interpreta un grupo o una banda?', family: 'artist', group: 'structure', dk: 0.05, p: fact('str:group') },
  { id: 'str_duo', text: '¿La interpreta un dúo?', family: 'artist', group: 'structure', dk: 0.07, p: fact('str:duo') },
  { id: 'str_solo', text: '¿La interpreta un artista en solitario?', family: 'artist', group: 'structure', dk: 0.05, p: fact('str:solo') },
  { id: 'collab', text: '¿Es una colaboración entre varios artistas (feat., «con»…)?', family: 'artist', dk: 0.08, p: fact('collab') },
  {
    id: 'artist_oneword',
    text: '¿El nombre del artista o grupo es una sola palabra, como «Madonna» o «Queen»?',
    family: 'artist',
    dk: 0.04,
    p: (s) => (artistWords(s.artist).length === 1 ? 0.95 : 0.03),
  },
  {
    id: 'artist_the',
    text: '¿El nombre del grupo o artista empieza por «The» (The Beatles, The Weeknd…)?',
    family: 'artist',
    dk: 0.03,
    p: (s) => (/^the\s/i.test(s.artist.trim()) ? 0.96 : 0.02),
  },
  { id: 'talent', text: '¿El artista se dio a conocer en un concurso de talentos de la tele (OT, Factor X, American Idol…)?', family: 'artist', dk: 0.15, p: fact('talent') },

  // ------------------------------------------------------------ Origen
  ...REGIONS.map(
    (r): QuestionDef => ({ id: `reg_${r.key}`, text: r.question, family: 'origin', dk: r.dk ?? 0.1, p: categorical(`reg:${r.key}`, 'ctry') }),
  ),
  ...COUNTRIES.filter((c) => c.question).map(
    (c): QuestionDef => ({
      id: `ctry_${c.code}`,
      text: c.question!,
      family: 'origin',
      group: 'country',
      parent: c.regions.includes('hispanic') ? 'reg_hispanic' : c.regions.includes('asia') ? 'reg_asia' : c.regions.includes('europe') ? 'reg_europe' : undefined,
      dk: c.dk ?? 0.12,
      p: categorical(`ctry:${c.code}`, 'ctry'),
    }),
  ),

  // ------------------------------------------------------------ Género
  ...GENRES.map(
    (g): QuestionDef => ({
      id: `g_${g.key}`,
      text: g.question,
      family: 'genre',
      parent: g.parent ? `g_${g.parent}` : undefined,
      dk: g.dk ?? 0.08,
      p: categorical(`g:${g.key}`, 'g', 0.04),
    }),
  ),
  { id: 'rap', text: '¿Tiene partes rapeadas?', family: 'sound', dk: 0.04, p: fact('rap') },

  // ------------------------------------------------------------ Ritmo y sonido
  {
    id: 'fast',
    text: '¿Es una canción rápida y enérgica?',
    family: 'sound',
    dk: 0.05,
    p: (s) => {
      const en = s.num('en');
      const bpm = s.num('bpm');
      if (en === undefined) return null;
      return sigmoid((en - 62) / 9 + (bpm === undefined ? 0 : (bpm - 118) / 30));
    },
  },
  {
    id: 'slow',
    text: '¿Es una canción lenta o tranquila?',
    family: 'sound',
    dk: 0.05,
    p: (s) => {
      const en = s.num('en');
      const bpm = s.num('bpm');
      if (en === undefined) return null;
      return sigmoid((42 - en) / 9 + (bpm === undefined ? 0 : (100 - bpm) / 30));
    },
  },
  { id: 'danceable', text: '¿Es muy bailable?', family: 'sound', dk: 0.05, p: (s) => numSigmoid(s.num('da'), 68, 7) },
  { id: 'happy', text: '¿Suena alegre y optimista?', family: 'sound', dk: 0.07, p: (s) => numSigmoid(s.num('va'), 62, 9) },
  { id: 'sad_sound', text: '¿Suena triste o melancólica?', family: 'sound', dk: 0.07, p: (s) => clampMid(numSigmoid(s.num('va'), 32, -8)) },
  { id: 'acoustic', text: '¿Es principalmente acústica (guitarra o piano, poca producción electrónica)?', family: 'sound', dk: 0.1, p: (s) => numSigmoid(s.num('ac'), 60, 10) },
  { id: 'long', text: '¿Dura más de cinco minutos?', family: 'sound', dk: 0.3, p: (s) => (s.duration === null ? null : sigmoid((s.duration - 300) / 15)) },
  { id: 'short', text: '¿Dura menos de tres minutos?', family: 'sound', dk: 0.3, p: (s) => (s.duration === null ? null : sigmoid((180 - s.duration) / 12)) },
  { id: 'inst_guitar', text: '¿La guitarra es la protagonista del arreglo?', family: 'sound', dk: 0.15, p: fact('inst:guitar') },
  { id: 'inst_piano', text: '¿El piano o los teclados son protagonistas?', family: 'sound', dk: 0.15, p: fact('inst:piano') },
  { id: 'inst_sax', text: '¿Suena un saxofón?', family: 'sound', dk: 0.2, p: fact('inst:sax') },
  { id: 'inst_strings', text: '¿Lleva violines o una sección de cuerdas?', family: 'sound', dk: 0.2, p: fact('inst:strings') },
  { id: 'inst_horns', text: '¿Tiene trompetas u otros vientos?', family: 'sound', dk: 0.2, p: fact('inst:horns') },
  { id: 'inst_whistle', text: '¿Alguien silba en la canción?', family: 'sound', dk: 0.12, p: fact('inst:whistle') },
  { id: 'inst_harmonica', text: '¿Suena una armónica?', family: 'sound', dk: 0.2, p: fact('inst:harmonica') },
  { id: 'inst_handclaps', text: '¿Tiene palmas o chasquidos de dedos marcando el ritmo?', family: 'sound', dk: 0.2, p: fact('inst:handclaps') },

  // ------------------------------------------------------------ Letra
  ...THEMES.map((t): QuestionDef => ({ id: `theme_${t.key}`, text: t.question, family: 'lyrics', dk: t.dk, p: fact(`theme:${t.key}`) })),
  { id: 'explicit', text: '¿Contiene palabrotas o está marcada como contenido explícito?', family: 'lyrics', dk: 0.1, p: fact('explicit') },
  { id: 'xmas', text: '¿Es una canción navideña?', family: 'lyrics', dk: 0.02, p: fact('xmas') },

  // ------------------------------------------------------------ Cine, series y redes
  { id: 'film', text: '¿Aparece en una película o se compuso para una?', family: 'media', dk: 0.12, p: fact('media:film') },
  { id: 'tv', text: '¿Está ligada a una serie o a un programa de televisión?', family: 'media', dk: 0.12, p: fact('media:tv') },
  { id: 'stage', text: '¿Es de un musical o de Broadway?', family: 'media', dk: 0.1, p: fact('media:stage') },
  { id: 'game', text: '¿Es de un videojuego?', family: 'media', dk: 0.05, fallbackRate: 0.02, p: fact('media:game') },
  { id: 'viral', text: '¿Se hizo viral en TikTok u otras redes sociales?', family: 'media', dk: 0.15, fallbackRate: 0.1, p: fact('viral') },

  // ------------------------------------------------------------ Éxito
  { id: 'hit', text: '¿Es un gran éxito que conoce casi todo el mundo?', family: 'charts', dk: 0.12, p: (s) => sigmoid((s.popularity - 0.72) / 0.08) },
  { id: 'chart_no1', text: '¿Llegó al número 1 de la lista Billboard de Estados Unidos?', family: 'charts', dk: 0.35, p: fact('chart:no1') },
  { id: 'chart_top10', text: '¿Fue un top 10 en Estados Unidos?', family: 'charts', dk: 0.4, p: fact('chart:top10') },
  { id: 'ev_entry', text: '¿Participó en Eurovisión?', family: 'trivia', dk: 0.04, p: fact('ev:entry') },
  { id: 'ev_winner', text: '¿Ganó Eurovisión?', family: 'trivia', parent: 'ev_entry', dk: 0.05, p: fact('ev:winner') },

  // ------------------------------------------------------------ Título
  // Útiles para distinguir entre las últimas candidatas, pero raras al principio: peso algo menor.
  { id: 'title_oneword', text: '¿El título tiene una sola palabra?', family: 'title', dk: 0.03, weight: 0.8, p: fact('title:oneword') },
  { id: 'title_number', text: '¿El título incluye un número?', family: 'title', dk: 0.03, weight: 0.8, p: fact('title:number') },
  { id: 'title_love', text: '¿El título contiene la palabra «love» o «amor»?', family: 'title', dk: 0.03, weight: 0.8, p: fact('title:love') },
  {
    id: 'title_you',
    text: '¿El título incluye «you», «tú» o «te»?',
    family: 'title',
    dk: 0.04,
    weight: 0.8,
    p: (s) => (/\b(you|your|you're|u|tu|tú|te|ti)\b/i.test(bareTitle(s.title)) ? 0.95 : 0.03),
  },
  {
    id: 'title_long',
    text: '¿El título es largo, de cinco palabras o más?',
    family: 'title',
    dk: 0.05,
    weight: 0.8,
    p: (s) => (bareTitle(s.title).split(/\s+/).filter(Boolean).length >= 5 ? 0.95 : 0.03),
  },

  // ------------------------------------------------------------ Curiosidades
  { id: 'dance_move', text: '¿Tiene un baile o una coreografía famosa asociada?', family: 'trivia', dk: 0.1, p: fact('dance') },
  { id: 'cover', text: '¿Es una versión de una canción que ya existía?', family: 'trivia', dk: 0.25, p: fact('cover') },
  { id: 'sample', text: '¿Usa un fragmento (sample) de otra canción?', family: 'trivia', dk: 0.35, p: fact('sample') },
];

function artistWords(name: string): string[] {
  return name.split(/[\s-]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

function bareTitle(title: string): string {
  return title.replace(/[([][^)\]]*[)\]]/g, ' ').trim();
}

function numSigmoid(v: number | undefined, center: number, scale: number): number | null {
  return v === undefined ? null : sigmoid((v - center) / scale);
}

/** Rasgos de audio poco fiables para un concepto subjetivo: nunca se dan por seguros. */
function clampMid(p: number | null): number | null {
  return p === null ? null : 0.1 + 0.8 * p;
}

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Preguntas de aprendizaje tras la partida, por orden de utilidad. */
export const LEARNING_PRIORITY = [
  'voice_female',
  'lang_es',
  'viral',
  'film',
  'tv',
  'game',
  'str_group',
  'explicit',
  'theme_love',
  'theme_heartbreak',
  'theme_party',
  'dance_move',
  'g_latin',
  'g_reggaeton',
  'reg_latam',
  'ctry_ES',
  'fast',
  'danceable',
];

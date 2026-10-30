import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { CATALOG_VERSION, COUNTRY_BY_CODE, type RawCatalog, type RawSong } from '@am/engine';
import { ArtistRegistry, hasFeaturing } from './credits';
import { downloadSources } from './download';
import { analyzeGenres, mapCuratedGenres, type GenreSignals } from './genres';
import { countryCode, parseCountryList, regionsOf } from './geo';
import { titleLanguage } from './language';
import { CATALOG_DIR, CATALOG_FILE, COVERAGE_FILE } from './paths';
import {
  isDerivativeTitle,
  readBillboardHistory,
  readEurovision,
  readNumberOnes,
  readRapRankings,
  readRollingStone,
  readSpotifySongs,
  readTTAudioFeatures,
  readTTBillboard,
  type AudioFeatures,
  type EurovisionEntry,
  type Gender,
  type NumberOne,
} from './readers';
import { SOURCES } from './sources';
import { readWikidataDump, type WikidataArtist, type WikidataSong } from './sources/wikidata';
import { altTitleKeys, displayTitle, normArtist, normTitle, songId, workFromTitle, yearOf } from './text';

// ------------------------------------------------------------------ modelo

interface SongRec {
  title: string;
  credit: string;
  artists: string[];
  artistKeys: string[];
  chart?: { peak: number; weeks: number; first: string };
  spotifyId?: string;
  spotifyPop?: number;
  explicit?: boolean;
  durationSec?: number;
  albums: string[];
  albumYear?: number;
  artistGenres: string[];
  playlistGenres: string[];
  features: AudioFeatures[];
  no1?: NumberOne;
  ev?: EurovisionEntry;
  rapGender?: Gender;
  wd?: WikidataSong;
  fromPlaylists: boolean;
}

type Structure = 'solo' | 'duo' | 'group';

interface ArtistAgg {
  names: Map<string, number>;
  genres: Set<string>;
  gender: Map<Gender, number>;
  structure: Map<Structure, number>;
  countries: Map<string, number>;
}

type Facts = Map<string, number>;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const bump = <K>(m: Map<K, number>, k: K, w: number) => m.set(k, (m.get(k) ?? 0) + w);

// ------------------------------------------------------------ construcción

export function buildCatalog(): { catalog: RawCatalog; coverage: Record<string, unknown> } {
  console.log('Leyendo fuentes…');
  const ttCharts = readTTBillboard();
  const ttAudio = readTTAudioFeatures();
  const history = readBillboardHistory();
  const numberOnes = readNumberOnes();
  const playlists = readSpotifySongs();
  const eurovision = readEurovision();
  const rollingStone = readRollingStone();
  const rap = readRapRankings();
  // Opcional: solo si se ha ejecutado `npm run data:wikidata` con acceso a Internet
  const wikidata = readWikidataDump();
  if (wikidata) console.log(`Wikidata: ${wikidata.songs.length} canciones, ${wikidata.artists.length} intérpretes (${wikidata.fetchedAt})`);

  // 1) Registro de artistas independientes (necesario para dividir créditos con seguridad)
  const registry = new ArtistRegistry();
  for (const s of ttCharts.values()) registry.observeCredit(s.credit);
  for (const s of history) registry.observeCredit(s.credit);
  for (const n of numberOnes) registry.observeCredit(n.credit);
  for (const t of playlists) registry.observeArtist(t.artist);
  for (const e of eurovision) registry.observeArtist(e.artist);
  for (const a of rollingStone) registry.observeArtist(a.name);
  for (const r of rap) registry.observeCredit(r.credit);
  for (const a of wikidata?.artists ?? []) registry.observeArtist(a.name);

  // 2) Índice de canciones por título normalizado (y por claves alternativas)
  const byTitle = new Map<string, SongRec[]>();
  const byAltTitle = new Map<string, SongRec[]>();
  const all: SongRec[] = [];
  const index = (map: Map<string, SongRec[]>, key: string, rec: SongRec) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(rec);
  };
  const create = (title: string, credit: string, fromPlaylists = false): SongRec => {
    const artists = registry.split(credit);
    const rec: SongRec = {
      title,
      credit,
      artists,
      artistKeys: artists.map(normArtist),
      albums: [],
      artistGenres: [],
      playlistGenres: [],
      features: [],
      fromPlaylists,
    };
    index(byTitle, normTitle(title), rec);
    for (const k of altTitleKeys(title)) index(byAltTitle, k, rec);
    all.push(rec);
    return rec;
  };
  const find = (title: string, credit: string): SongRec | undefined => {
    const keys = new Set([normArtist(credit), ...registry.split(credit).map(normArtist)]);
    const sameArtist = (s: SongRec) => s.artistKeys.some((k) => keys.has(k)) || keys.has(normArtist(s.credit));
    const exact = byTitle.get(normTitle(title))?.find(sameArtist);
    if (exact) return exact;
    for (const k of [normTitle(title), ...altTitleKeys(title)]) {
      const hit = (byTitle.get(k) ?? []).concat(byAltTitle.get(k) ?? []).find(sameArtist);
      if (hit) return hit;
    }
    return undefined;
  };

  // 3) Billboard 1958-2021 + rasgos de audio
  for (const s of ttCharts.values()) {
    const rec = find(s.title, s.credit) ?? create(s.title, s.credit);
    mergeChart(rec, s);
    const audio = ttAudio.get(s.songId);
    if (audio) {
      rec.artistGenres.push(...audio.genres);
      if (audio.spotifyId) rec.spotifyId ??= audio.spotifyId;
      if (audio.popularity !== null) rec.spotifyPop = Math.max(rec.spotifyPop ?? 0, audio.popularity);
      if (audio.explicit !== null) rec.explicit = (rec.explicit ?? false) || audio.explicit;
      if (audio.durationSec) rec.durationSec ??= audio.durationSec;
      if (audio.album) rec.albums.push(audio.album);
      const albumYear = yearOf(audio.albumDate);
      if (albumYear) rec.albumYear = Math.min(rec.albumYear ?? 9999, albumYear);
      if (audio.tempo !== null) rec.features.push(audio);
    }
  }
  // 4) Archivo completo (añade 2021 → hoy y actualiza picos y semanas)
  for (const s of history) mergeChart(find(s.title, s.credit) ?? create(s.title, s.credit), s);

  // 5) Números 1 anotados
  let unmatchedNo1 = 0;
  for (const n of numberOnes) {
    let rec = find(n.title, n.credit);
    const year = yearOf(n.date)!;
    if (!rec) {
      // Mismo título y número 1 en la misma época aunque el crédito difiera ("The 4 Seasons").
      rec = (byTitle.get(normTitle(n.title)) ?? []).find(
        (s) => s.chart && s.chart.peak === 1 && Math.abs((yearOf(s.chart.first) ?? 0) - year) <= 1,
      );
    }
    if (!rec) {
      // Grafías distintas del mismo número 1 ("Big Hunk o' Love" / "A Big Hunk O' Love"):
      // mismo artista, número 1 en la misma época y títulos con la mayoría de palabras en común.
      const artistKeys = new Set(registry.split(n.credit).map(normArtist));
      const words = new Set(normTitle(n.title).split(' '));
      rec = all.find((s) => {
        if (!s.chart || s.chart.peak !== 1 || Math.abs((yearOf(s.chart.first) ?? 0) - year) > 1) return false;
        if (!s.artistKeys.some((k) => artistKeys.has(k))) return false;
        const other = new Set(normTitle(s.title).split(' '));
        const common = [...words].filter((w) => other.has(w)).length;
        return common / new Set([...words, ...other]).size >= 0.5;
      });
    }
    if (!rec) {
      unmatchedNo1++;
      rec = create(n.title, n.credit);
    }
    rec.no1 = n;
  }

  // 6) Playlists de Spotify (aporta sobre todo música latina, EDM y canciones de 2010-2019)
  let skippedDerivative = 0;
  for (const t of playlists) {
    if (isDerivativeTitle(t.title)) {
      skippedDerivative++;
      continue;
    }
    const rec = find(t.title, t.artist) ?? create(displayTitle(t.title), t.artist, true);
    rec.fromPlaylists ||= true;
    rec.playlistGenres.push(...t.genres);
    rec.spotifyId ??= t.spotifyId;
    rec.spotifyPop = Math.max(rec.spotifyPop ?? 0, t.popularity);
    rec.durationSec ??= t.durationSec ?? undefined;
    if (t.album) rec.albums.push(t.album);
    const albumYear = yearOf(t.releaseDate);
    if (albumYear) rec.albumYear = Math.min(rec.albumYear ?? 9999, albumYear);
    if (t.tempo !== null) rec.features.push(t);
  }

  // 7) Eurovisión
  for (const e of eurovision) {
    const rec = find(e.song, e.artist) ?? create(e.song, e.artist);
    if (!rec.ev || (e.finalRank ?? 99) < (rec.ev.finalRank ?? 99)) rec.ev = e;
  }

  // 8) Encuesta de hip hop: género de la voz a nivel de canción
  for (const r of rap) {
    const rec = find(r.title, r.credit);
    if (rec && r.gender) rec.rapGender = r.gender;
  }

  // 9) Wikidata: enriquece las canciones existentes y añade las que faltan (p. ej. música española)
  for (const w of wikidata?.songs ?? []) {
    if (!w.performerNames.length) continue;
    const credit = w.performerNames.join(' & ');
    const rec = find(w.title, credit) ?? create(w.title, credit);
    rec.wd = w;
    if (w.spotify) rec.spotifyId ??= w.spotify;
  }

  // 10) Agregados por artista
  const wdArtists = new Map((wikidata?.artists ?? []).map((a) => [normArtist(a.name), a]));
  const artists = aggregateArtists(all, rollingStone, rap, registry, wdArtists);

  // 11) Derivar hechos y serializar
  console.log('Derivando hechos…');
  const factIndex = new Map<string, number>();
  const factKeys: string[] = [];
  const numKeys = ['bpm', 'en', 'da', 'va', 'ac', 'in', 'sp'];
  const artistIndex = new Map<string, number>();
  const artistNames: string[] = [];
  const songs: RawSong[] = [];
  const ids = new Set<string>();
  const coverage = new Map<string, number>();

  for (const rec of all) {
    const year = songYear(rec);
    if (year.y === null) continue;
    const facts = deriveFacts(rec, year.y, artists);
    const nums = deriveNumbers(rec);
    const f: number[] = [];
    for (const [k, v] of facts) {
      if (!factIndex.has(k)) {
        factIndex.set(k, factKeys.length);
        factKeys.push(k);
      }
      f.push(factIndex.get(k)!, Math.round(clamp(v) * 100));
      bump(coverage, k.split(':')[0], 0);
    }
    for (const family of new Set([...facts.keys()].map((k) => k.split(':')[0]))) bump(coverage, family, 1);
    const n: number[] = [];
    numKeys.forEach((k, i) => {
      const v = nums[k];
      if (v !== undefined) {
        n.push(i, Math.round(v));
        bump(coverage, `#${k}`, 1);
      }
    });
    const a = rec.artists.map((name) => {
      const key = normArtist(name);
      if (!artistIndex.has(key)) {
        artistIndex.set(key, artistNames.length);
        artistNames.push(displayName(artists.get(key)) ?? name);
      }
      return artistIndex.get(key)!;
    });
    let id = songId(rec.title, rec.artists[0] ?? rec.credit);
    for (let i = 2; ids.has(id); i++) id = songId(`${rec.title} ${i}`, rec.artists[0] ?? rec.credit);
    ids.add(id);
    songs.push({
      id,
      t: displayTitle(rec.title) || rec.title,
      c: rec.credit,
      a,
      y: year.y,
      yq: year.quality,
      d: rec.durationSec ?? rec.no1?.lengthSec ?? null,
      p: Math.round(popularity(rec) * 1000) / 1000,
      f,
      n,
      s: sourcesOf(rec),
      ...workOf(rec),
    });
  }

  const catalog: RawCatalog = {
    version: CATALOG_VERSION,
    builtAt: new Date().toISOString(),
    sources: Object.values(SOURCES).map(({ id, name, url, license }) => ({ id, name, url, license })),
    factKeys,
    numKeys,
    artists: artistNames,
    songs,
  };
  const total = songs.length;
  const coverageReport = {
    builtAt: catalog.builtAt,
    songs: total,
    artists: artistNames.length,
    unmatchedNumberOnes: unmatchedNo1,
    skippedDerivativeTracks: skippedDerivative,
    byOrigin: {
      billboard: songs.filter((s) => s.s.bb).length,
      spotifyPlaylists: songs.filter((s) => s.s.pl).length,
      spotifyId: songs.filter((s) => s.s.sp).length,
      numberOnes: songs.filter((s) => s.s.n1).length,
      eurovision: songs.filter((s) => s.s.ev).length,
      wikidata: songs.filter((s) => s.s.wd).length,
    },
    /** % de canciones con al menos un hecho de cada familia (o con el rasgo numérico, si empieza por #). */
    familyCoverage: Object.fromEntries(
      [...coverage.entries()]
        .sort((x, y) => y[1] - x[1])
        .map(([k, c]) => [k, Math.round((1000 * c) / total) / 10]),
    ),
  };
  return { catalog, coverage: coverageReport };
}

// ----------------------------------------------------------------- fusión

function mergeChart(rec: SongRec, s: { first: string; peak: number; weeks: number }): void {
  if (!rec.chart) rec.chart = { first: s.first, peak: s.peak, weeks: s.weeks };
  else {
    if (s.first < rec.chart.first) rec.chart.first = s.first;
    rec.chart.peak = Math.min(rec.chart.peak, s.peak);
    rec.chart.weeks = Math.max(rec.chart.weeks, s.weeks);
  }
}

/**
 * Año de lanzamiento. La primera semana en lista es fiable salvo en canciones
 * que entraron tarde (villancicos, re-entradas): si el álbum original es
 * anterior, manda el álbum. Un recopilatorio nunca es anterior a la canción,
 * así que quedarse con el mínimo es seguro.
 */
function songYear(rec: SongRec): { y: number | null; quality: 0 | 1 } {
  const curated = [yearOf(rec.chart?.first), yearOf(rec.no1?.date), rec.ev?.year ?? null, yearOf(rec.wd?.date)].filter(
    (y): y is number => y !== null,
  );
  const album = rec.albumYear && rec.albumYear >= 1940 ? rec.albumYear : null;
  if (curated.length) {
    const y = Math.min(...curated);
    return { y: album && album < y ? album : y, quality: 1 };
  }
  return { y: album, quality: 0 };
}

function popularity(rec: SongRec): number {
  let bb = 0;
  if (rec.chart) {
    const { peak, weeks } = rec.chart;
    bb = 0.55 * ((101 - peak) / 100) ** 1.5 + 0.45 * Math.min(1, Math.log1p(weeks) / Math.log1p(40)) + (peak === 1 ? 0.08 : 0);
  }
  const sp = rec.spotifyPop !== undefined ? (rec.spotifyPop / 100) ** 1.3 : 0;
  let ev = 0;
  if (rec.ev) {
    const r = rec.ev.finalRank;
    ev = rec.ev.winner ? 0.5 : r !== null && r <= 3 ? 0.36 : r !== null && r <= 10 ? 0.26 : r !== null ? 0.16 : 0.07;
  }
  // Wikidata: nº de Wikipedias con artículo (60+ = éxito mundial); el artículo en español pesa un poco más
  const wd = rec.wd ? 0.2 + 0.65 * Math.min(1, Math.log1p(rec.wd.sitelinks) / Math.log1p(60)) + (rec.wd.eswiki ? 0.05 : 0) : 0;
  const nSources = [rec.chart, rec.fromPlaylists || undefined, rec.no1, rec.ev, rec.wd].filter(Boolean).length;
  return clamp(Math.max(bb, 0.95 * sp, ev, wd) + 0.04 * (nSources - 1));
}

function workOf(rec: SongRec): { w?: string } {
  const w = workFromTitle(rec.title) ?? rec.no1?.work ?? rec.wd?.work?.name ?? null;
  return w ? { w } : {};
}

function sourcesOf(rec: SongRec): RawSong['s'] {
  const s: RawSong['s'] = {};
  if (rec.chart) s.bb = [rec.chart.peak, rec.chart.weeks, rec.chart.first];
  if (rec.spotifyId) s.sp = rec.spotifyId;
  if (rec.ev) {
    const code = countryCode(rec.ev.country) ?? rec.ev.country;
    s.ev = [rec.ev.year, code, rec.ev.finalRank, rec.ev.winner ? 1 : 0];
  }
  if (rec.no1) s.n1 = rec.no1.date;
  if (rec.fromPlaylists) s.pl = 1;
  if (rec.wd) s.wd = rec.wd.qid;
  return s;
}

// ------------------------------------------------------------- artistas

function aggregateArtists(
  songs: SongRec[],
  rollingStone: ReturnType<typeof readRollingStone>,
  rap: ReturnType<typeof readRapRankings>,
  registry: ArtistRegistry,
  wdArtists: Map<string, WikidataArtist>,
): Map<string, ArtistAgg> {
  const aggs = new Map<string, ArtistAgg>();
  const get = (name: string): ArtistAgg => {
    const key = normArtist(name);
    let a = aggs.get(key);
    if (!a) {
      a = { names: new Map(), genres: new Set(), gender: new Map(), structure: new Map(), countries: new Map() };
      aggs.set(key, a);
    }
    bump(a.names, name, 1);
    return a;
  };

  for (const rec of songs) {
    rec.artists.forEach((name) => get(name));
    const primary = rec.artists[0];
    if (!primary) continue;
    const agg = get(primary);
    rec.artistGenres.forEach((g) => agg.genres.add(g));
    const n = rec.no1;
    if (n) {
      const solo = rec.artists.length === 1 && !hasFeaturing(n.credit);
      if (n.structure !== null) {
        const base = Math.floor(n.structure);
        const st: Structure = base === 0 ? 'group' : base === 2 ? 'duo' : 'solo';
        bump(agg.structure, st, solo ? 3 : 2);
      }
      if (solo && n.artistMale !== null) {
        const g: Gender | null = n.artistMale === 0 ? 'female' : n.artistMale === 1 ? 'male' : n.artistMale === 2 ? 'mixed' : null;
        if (g) bump(agg.gender, g, 3);
      }
      if (n.origin) {
        for (const [code, w] of parseCountryList(n.origin)) bump(agg.countries, code, (solo ? 3 : 1) * w);
      }
    }
    if (rec.ev) {
      const code = countryCode(rec.ev.country);
      if (code) bump(agg.countries, code, 1.5);
    }
  }
  for (const a of rollingStone) {
    const agg = get(a.name);
    if (a.gender) bump(agg.gender, a.gender, 2);
    if (a.members !== null) bump(agg.structure, a.members <= 1 ? 'solo' : a.members === 2 ? 'duo' : 'group', 2);
  }
  for (const r of rap) {
    const parts = registry.split(r.credit);
    if (parts.length === 1 && r.gender) bump(get(parts[0]).gender, r.gender, 2);
  }
  // Wikidata describe al artista directamente (género, tipo, nacionalidad): evidencia fuerte
  for (const [key, agg] of aggs) {
    const w = wdArtists.get(key);
    if (!w) continue;
    if (w.gender && w.kind !== 'group' && w.kind !== 'duo') bump(agg.gender, w.gender, 3);
    else if (w.gender) bump(agg.gender, w.gender, 2);
    if (w.kind) bump(agg.structure, w.kind === 'person' ? 'solo' : w.kind, 3);
    for (const code of w.countries) bump(agg.countries, code, 3 / w.countries.length);
  }
  for (const agg of aggs.values()) {
    if (!agg.genres.size) continue;
    const sig = analyzeGenres([...agg.genres]);
    if (sig.femaleGroup) {
      bump(agg.gender, 'female', 1.5);
      bump(agg.structure, 'group', 1.5);
    }
    if (sig.maleGroup) {
      bump(agg.gender, 'male', 1.5);
      bump(agg.structure, 'group', 1.5);
    }
    if (sig.femaleVoice) bump(agg.gender, 'female', 1);
    if (sig.group) bump(agg.structure, 'group', 1);
    for (const [code, w] of sig.countries) bump(agg.countries, code, w);
  }
  return aggs;
}

function displayName(agg: ArtistAgg | undefined): string | undefined {
  if (!agg) return undefined;
  return [...agg.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Distribución dominante con confianza creciente con la cantidad de evidencia. */
function decide<K>(m: Map<K, number>, minTotal = 0.6): { value: K; share: number; conf: number } | null {
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  if (total < minTotal) return null;
  const [value, w] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = w / total;
  return { value, share, conf: clamp(0.55 + 0.4 * share * Math.min(1, total / 2), 0, 0.96) };
}

// ---------------------------------------------------------- hechos de canción

const TOPIC_THEMES: Record<string, string[]> = {
  love: ['Love', 'Longing for Love', 'Faithfulness', 'Appreciation', 'Getting Back Together', 'Marriage', 'Forbidden Love'],
  heartbreak: ['Lost Love', 'Bad Relationships', 'Infidelity', 'Endings/Goodbyes', 'Regret', 'Revenge'],
  party: ['Dancing', 'Partying', 'Playing Music', 'Summer'],
  sex: ['Lust/Sex', 'Nudity', 'Masturbation', 'Prostitution'],
  empower: ['Empowerment', 'Self-Acceptance', 'Resilience', 'Survival', 'Respect', 'Positivity', 'Hope', 'Redemption'],
  brag: ['Bragging', 'Badassery', 'Fame', 'Materialism', 'Jewelry'],
  social: ['Racism', 'Poverty', 'Homelessness', 'War', 'Coexistance', 'Dystopia', 'Police', 'Hypocrisy', 'Violence'],
  sad: ['Sadness', 'Lonesomeness', 'Pain', 'Death', 'Doubt', 'Insomnia', 'Lost Innocence', 'Failure'],
};

const CHRISTMAS = /christmas|navidad|xmas|santa claus|santa baby|jingle bell|rudolph|sleigh ride|let it snow|silent night|noche de paz|mistletoe|frosty the snowman|winter wonderland|little drummer boy|o holy night|feliz navidad|holly jolly|rockin' around|feliz navidad|white christmas|blue christmas|last christmas|happy holiday|holiday/i;
const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fifteen|sixteen|seventeen|nineteen|twenty|thirty|forty|fifty|hundred|thousand|million|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|cien|mil|first|second|third|primero|primera)\b|\d/i;
const LOVE_WORD = /\b(love|loves|lover|lovers|loving|lovin'?|amor|amore|amour|liebe|enamorad[oa])\b/i;
const FILM_ALBUM = /soundtrack|motion picture|music from (and inspired by )?the (motion picture|film|movie)|original score|banda sonora|\bo\.?s\.?t\b|from the (disney|pixar)|music from the film/i;
const TV_ALBUM = /television|\btv\b|the series|music from the netflix|original series|season \d|glee/i;
const STAGE_ALBUM = /broadway|original cast|cast recording|the musical|original london cast/i;

function deriveFacts(rec: SongRec, year: number, artists: Map<string, ArtistAgg>): Facts {
  const facts: Facts = new Map();
  const set = (k: string, v: number) => facts.set(k, clamp(v));
  const title = displayTitle(rec.title) || rec.title;
  const primary = artists.get(rec.artistKeys[0] ?? '');
  const artistSig: GenreSignals = analyzeGenres(rec.artistGenres.length ? rec.artistGenres : [...(primary?.genres ?? [])]);
  const playlistSig = analyzeGenres(rec.playlistGenres);
  const n = rec.no1;

  // --- Géneros: media ponderada entre fuentes (una etiqueta que solo aparece en
  // una fuente débil y falta en las fuertes queda diluida), con suelo para la
  // anotación curada a mano.
  const genreSources: Array<{ labels: Map<string, number>; weight: number }> = [];
  const curated = n ? mapCuratedGenres(n.genres) : null;
  if (curated?.size) genreSources.push({ labels: curated, weight: 1 });
  if (playlistSig.labels.size) genreSources.push({ labels: playlistSig.labels, weight: 0.7 });
  if (artistSig.labels.size) genreSources.push({ labels: artistSig.labels, weight: rec.artistGenres.length ? 0.8 : 0.5 });
  if (rec.wd?.genres.length) genreSources.push({ labels: analyzeGenres(rec.wd.genres).labels, weight: 0.9 });
  const genres = new Map<string, number>();
  const totalWeight = genreSources.reduce((s, g) => s + g.weight, 0);
  for (const label of new Set(genreSources.flatMap((g) => [...g.labels.keys()]))) {
    const avg = genreSources.reduce((s, g) => s + g.weight * (g.labels.get(label) ?? 0), 0) / totalWeight;
    const handLabelled = curated?.get(label) ?? 0;
    const v = Math.max(avg, handLabelled >= 0.85 ? 0.8 * handLabelled : 0);
    if (v >= 0.12) genres.set(label, v);
  }
  for (const [k, v] of genres) set(`g:${k}`, v);

  // --- Voz
  const feats = rec.features;
  const avg = (key: keyof AudioFeatures) => {
    const vals = feats.map((f) => f[key]).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };
  const instrumentalness = avg('instrumentalness');
  const speechiness = avg('speechiness');
  let instr = 0;
  if (n?.instrumental) instr = 0.95;
  else if (instrumentalness !== null && speechiness !== null && instrumentalness >= 0.7 && speechiness < 0.1) instr = 0.8;
  else if (instrumentalness !== null && instrumentalness >= 0.5) instr = 0.45;
  const voice = deriveVoice(rec, artists);
  if (voice || instr >= 0.45 || n) {
    const base = voice ?? { male: 0, female: 0, mixed: 0 };
    const vocalShare = 1 - instr;
    set('voice:instr', n && !n.instrumental && instr < 0.45 ? 0.03 : instr);
    set('voice:male', base.male * vocalShare);
    set('voice:female', base.female * vocalShare);
    set('voice:mixed', base.mixed * vocalShare);
  }

  // --- Estructura del artista y colaboraciones
  const st = deriveStructure(rec, primary);
  if (st) for (const [k, v] of Object.entries(st)) set(`str:${k}`, v);
  set('collab', rec.artists.length >= 2 || n?.multipleLeads ? 0.92 : 0.06);

  // --- País y región del artista principal
  const countries = primary ? decideCountries(primary.countries) : null;
  if (countries) {
    for (const [code, v] of countries) set(`ctry:${code}`, v);
    for (const [region, v] of regionsOf(countries)) set(`reg:${region}`, v);
  }

  // --- Idioma
  const lang = deriveLanguage(rec, title, year, artistSig, playlistSig, countries, instr);
  set('lang:en', lang.en);
  set('lang:es', lang.es);
  set('lang:other', lang.other);

  // --- Letra
  if (rec.explicit !== undefined || n) set('explicit', rec.explicit || n?.explicit ? 0.95 : 0.05);
  if (n) {
    for (const [theme, topics] of Object.entries(TOPIC_THEMES)) {
      set(`theme:${theme}`, n.topics.some((t) => topics.includes(t)) ? 0.9 : 0.07);
    }
    set('theme:story', n.narrative ? 0.85 : 0.12);
  }
  // La "speechiness" de Spotify es una señal débil (voces susurradas también puntúan alto).
  const rapEvidence = Math.max(
    (genres.get('hiphop') ?? 0) * 0.95,
    speechiness !== null ? 0.65 * sigmoid((speechiness - 0.3) / 0.05) : 0,
    n?.rapVerse ? 0.85 : 0,
  );
  if (genres.size || speechiness !== null || n) set('rap', rapEvidence || 0.04);

  // --- Cine, series y musicales
  const albums = rec.albums.join(' | ');
  const fromWork = workFromTitle(rec.title) !== null;
  let film = n ? (n.film === 'written' ? 0.95 : n.film === 'featured' ? 0.8 : 0.04) : undefined;
  if (FILM_ALBUM.test(albums) && !TV_ALBUM.test(albums)) film = Math.max(film ?? 0, 0.85);
  else if (fromWork) film = Math.max(film ?? 0, 0.75);
  else if (artistSig.soundtrack) film = Math.max(film ?? 0, 0.6);
  const wdMedia = rec.wd?.work?.media ?? null;
  if (wdMedia === 'film') film = Math.max(film ?? 0, 0.92);
  if (film !== undefined) set('media:film', film);
  if (wdMedia === 'game') set('media:game', 0.92);
  let tv = n ? (n.tv === 'written' ? 0.95 : n.tv === 'featured' ? 0.75 : 0.03) : undefined;
  if (wdMedia === 'tv') tv = Math.max(tv ?? 0, 0.92);
  if (TV_ALBUM.test(albums) || artistSig.tv) tv = Math.max(tv ?? 0, 0.88);
  if (tv !== undefined) set('media:tv', tv);
  let stage = n ? (n.stage === 'written' ? 0.95 : n.stage === 'featured' ? 0.75 : 0.03) : undefined;
  if (STAGE_ALBUM.test(albums)) stage = Math.max(stage ?? 0, 0.85);
  else if (artistSig.stage) stage = Math.max(stage ?? 0, 0.6);
  if (stage !== undefined) set('media:stage', stage);

  // --- Navidad (el título es una señal muy fiable)
  let xmas = 0.05;
  if (CHRISTMAS.test(title) || n?.topics.includes('Christmas')) xmas = 0.95;
  else if (/christmas|navidad|holiday/i.test(albums)) xmas = 0.85;
  else if (artistSig.christmas || playlistSig.christmas) xmas = 0.5;
  set('xmas', xmas);

  // --- Listas y certámenes
  set('chart:no1', rec.chart ? (rec.chart.peak === 1 ? 0.97 : 0.02) : 0.05);
  set('chart:top10', rec.chart ? (rec.chart.peak <= 10 ? 0.95 : 0.04) : 0.06);
  if (rec.ev || n?.eurovision) set('ev:entry', 0.97);
  else if (year <= 2022) set('ev:entry', 0.02);
  if (rec.ev) set('ev:winner', rec.ev.winner ? 0.97 : 0.03);
  else if (year <= 2022) set('ev:winner', 0.01);

  // --- Curiosidades (solo donde hay anotación)
  if (n?.talent || artistSig.talent) set('talent', n?.talent ? 0.95 : 0.85);
  else if (n) set('talent', 0.04);
  if (n) {
    set('dance', n.dance ? 0.9 : 0.06);
    set('cover', n.cover ? 0.9 : 0.08);
    set('sample', n.sample ? 0.85 : 0.1);
    for (const [inst, has] of Object.entries(n.instruments)) set(`inst:${inst}`, has ? 0.9 : 0.08);
  }
  if (artistSig.viral && year >= 2012) set('viral', 0.55);

  // --- Título (deterministas)
  const words = title.replace(/[([][^)\]]*[)\]]/g, '').trim().split(/\s+/).filter(Boolean);
  set('title:oneword', words.length === 1 ? 0.97 : 0.03);
  set('title:number', NUMBER_WORDS.test(title) ? 0.95 : 0.04);
  set('title:love', LOVE_WORD.test(title) ? 0.97 : 0.03);
  return facts;
}

function genderOfArtist(agg: ArtistAgg | undefined): { g: Gender; conf: number } | null {
  if (!agg) return null;
  const d = decide(agg.gender, 1);
  return d && d.share >= 0.6 ? { g: d.value, conf: d.conf } : null;
}

function deriveVoice(rec: SongRec, artists: Map<string, ArtistAgg>): Record<Gender, number> | null {
  const out: Record<Gender, number> = { male: 0, female: 0, mixed: 0 };
  const n = rec.no1;
  const songLevel: Gender | null =
    n && n.artistMale !== null && n.artistMale <= 2
      ? n.artistMale === 0
        ? 'female'
        : n.artistMale === 1
          ? 'male'
          : 'mixed'
      : (rec.rapGender ?? null);
  if (songLevel) {
    out[songLevel] = 0.95;
    return out;
  }
  const lead = genderOfArtist(artists.get(rec.artistKeys[0] ?? ''));
  if (!lead) return null;
  const others = rec.artistKeys.slice(1).map((k) => genderOfArtist(artists.get(k))).filter(Boolean) as Array<{ g: Gender }>;
  const differs = others.some((o) => o.g !== lead.g);
  if (differs) {
    out.mixed = 0.45 * lead.conf;
    out[lead.g] += 0.5 * lead.conf;
  } else out[lead.g] = lead.conf;
  return out;
}

function deriveStructure(rec: SongRec, primary: ArtistAgg | undefined): Record<Structure, number> | null {
  const n = rec.no1;
  if (n?.structure !== null && n?.structure !== undefined) {
    const base = Math.floor(n.structure);
    const st: Structure = base === 0 ? 'group' : base === 2 ? 'duo' : 'solo';
    return { solo: st === 'solo' ? 0.95 : 0.03, duo: st === 'duo' ? 0.95 : 0.03, group: st === 'group' ? 0.95 : 0.03 };
  }
  const d = primary ? decide(primary.structure, 1) : null;
  if (!d || d.share < 0.6) return null;
  const low = (1 - d.conf) / 2;
  return { solo: d.value === 'solo' ? d.conf : low, duo: d.value === 'duo' ? d.conf : low, group: d.value === 'group' ? d.conf : low };
}

function decideCountries(m: Map<string, number>): Map<string, number> | null {
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  if (total < 0.6) return null;
  const out = new Map<string, number>();
  const conf = clamp(0.7 + 0.25 * Math.min(1, total / 3), 0, 0.95);
  for (const [code, w] of m) {
    const share = w / total;
    if (share >= 0.1 && COUNTRY_BY_CODE.has(code)) out.set(code, share * conf);
  }
  return out.size ? out : null;
}

/** Países cuyos artistas suelen cantar en su idioma (no en inglés) cuando no hay otras pistas. */
const NON_ENGLISH = new Set(['FR', 'DE', 'IT', 'BR', 'KR', 'JP', 'CN', 'TW', 'HK', 'PT', 'RU', 'UA', 'TR', 'GR', 'IN', 'TH', 'RS', 'HR', 'YU', 'PL', 'RO']);
/** Países de habla inglesa, o cuyos artistas de éxito internacional cantan casi siempre en inglés. */
const ENGLISH = new Set(['US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'JM', 'BB', 'BS', 'TT', 'SE', 'NO', 'DK', 'FI', 'IS', 'NL']);

/**
 * Idioma de la letra como distribución de probabilidad. Es un modelo de
 * puntuaciones explícito (no aprendido) que combina: idioma del título,
 * géneros con idioma implícito (reguetón, K-pop...), país del artista,
 * anotación de los números 1 y la regla de idioma de Eurovisión. Cuando las
 * señales se contradicen el resultado queda intermedio, y el motor lo trata
 * como incertidumbre en vez de como un hecho.
 */
function deriveLanguage(
  rec: SongRec,
  title: string,
  year: number,
  artistSig: GenreSignals,
  playlistSig: GenreSignals,
  countries: Map<string, number> | null,
  instr: number,
): { en: number; es: number; other: number } {
  if (instr >= 0.8) return { en: 0.03, es: 0.02, other: 0.03 };
  const tl = titleLanguage(title);
  let en = 2;
  let es = 0;
  let other = 0;
  if (rec.chart && !rec.fromPlaylists && !rec.ev) en += 0.8;
  es += 1.4 * tl.es;
  en += 1.2 * tl.en;
  other += tl.other;
  // Un título inequívoco es la mejor pista para artistas que cantan en dos idiomas (Shakira, Enrique Iglesias).
  if (tl.en >= 1 && tl.es === 0) en += 4.5;
  if (tl.es >= 1 && tl.en === 0) es += 4.5;
  // Las señales "es un artista latino" (géneros, playlists, país) están muy correladas:
  // se toma la más fuerte y solo una fracción del resto, en vez de sumarlas como si fueran independientes.
  const nArtist = Math.max(1, rec.artistGenres.length || artistSig.genreCount);
  const nPlaylist = Math.max(1, rec.playlistGenres.length);
  const latinPlaylists = rec.playlistGenres.filter((g) => /latin|reggaeton|tropical/.test(g)).length;
  let hispanic = 0;
  let nonEnglish = 0;
  let english = 0;
  for (const [code, w] of countries ?? []) {
    if (COUNTRY_BY_CODE.get(code)?.regions.includes('hispanic')) hispanic += w;
    else if (NON_ENGLISH.has(code)) nonEnglish += w;
    else if (ENGLISH.has(code)) english += w;
  }
  es += correlated([
    4 * Math.min(1, artistSig.language.es / nArtist),
    3.5 * Math.min(1, (2 * latinPlaylists) / nPlaylist),
    3 * hispanic,
  ]);
  other += correlated([
    4 * Math.min(1, artistSig.language.other / nArtist),
    3 * Math.min(1, playlistSig.language.other / nPlaylist),
    2 * nonEnglish,
  ]);
  en += 2.5 * english;
  const n = rec.no1;
  if (n && !n.instrumental) {
    if (!n.foreignLanguage) en += 4;
    else {
      // "Alguna frase en otro idioma": la mayoría de estos números 1 son en inglés.
      en -= 0.5;
      if (tl.es > 0 || artistSig.language.es > 0) es += 0.8;
      else other += 0.8;
    }
  }
  // Wikidata indica el idioma de la obra (P407): es la señal más directa
  for (const l of rec.wd?.languages ?? []) {
    if (l === 'en') en += 6;
    else if (l === 'es') es += 6;
    else other += 6;
  }
  if (rec.ev) {
    const code = countryCode(rec.ev.country);
    const national = year <= 1972 || (year >= 1977 && year <= 1998);
    if (national) {
      if (code === 'ES') es += 4;
      else if (code === 'GB' || code === 'IE' || code === 'MT') en += 3;
      else other += 4;
    } else if (year >= 1999) en += 1.5;
  }
  const z = Math.max(en, es, other);
  const e = [Math.exp(en - z), Math.exp(es - z), Math.exp(other - z)];
  const sum = e[0] + e[1] + e[2];
  // Los números 1 con "alguna parte en otro idioma" suelen ser bilingües: nunca seguro al 100 %.
  const cap = n?.foreignLanguage ? 0.8 : 0.97;
  return { en: clamp(e[0] / sum, 0.02, 0.97), es: clamp(e[1] / sum, 0.02, cap), other: clamp(e[2] / sum, 0.02, cap) };
}

/** Combina pruebas correladas: la mayor cuenta entera y el resto solo al 30 %. */
function correlated(values: number[]): number {
  const sorted = [...values].sort((a, b) => b - a);
  return sorted[0] + 0.3 * sorted.slice(1).reduce((s, v) => s + v, 0);
}

function deriveNumbers(rec: SongRec): Record<string, number | undefined> {
  const feats = rec.features;
  const avg = (key: keyof AudioFeatures, scale = 1) => {
    const vals = feats.map((f) => f[key]).filter((v): v is number => v !== null && v > 0);
    return vals.length ? (scale * vals.reduce((s, v) => s + v, 0)) / vals.length : undefined;
  };
  const n = rec.no1;
  return {
    bpm: avg('tempo') ?? n?.bpm ?? undefined,
    en: avg('energy', 100) ?? n?.energy ?? undefined,
    da: avg('danceability', 100) ?? n?.danceability ?? undefined,
    va: avg('valence', 100) ?? n?.happiness ?? undefined,
    ac: avg('acousticness', 100) ?? n?.acousticness ?? undefined,
    in: feats.length ? (avg('instrumentalness', 100) ?? 0) : undefined,
    sp: avg('speechiness', 100),
  };
}

// ------------------------------------------------------------------ CLI

async function main() {
  if (!process.argv.includes('--offline')) await downloadSources();
  const t0 = Date.now();
  const { catalog, coverage } = buildCatalog();
  mkdirSync(CATALOG_DIR, { recursive: true });
  const json = JSON.stringify(catalog);
  writeFileSync(CATALOG_FILE, gzipSync(json, { level: 9 }));
  writeFileSync(COVERAGE_FILE, `${JSON.stringify(coverage, null, 2)}\n`);
  console.log(
    `✓ ${catalog.songs.length} canciones, ${catalog.artists.length} artistas, ${catalog.factKeys.length} claves de hecho ` +
      `(${(json.length / 1e6).toFixed(1)} MB JSON) en ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  console.log(JSON.stringify(coverage, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

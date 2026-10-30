import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { rawPath } from './paths';
import { SOURCES } from './sources';
import { normArtist, normTitle, num, present, usDateToIso } from './text';

type Row = Record<string, string>;

function readCsv(file: string): Row[] {
  return parse(readFileSync(rawPath(file)), {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as Row[];
}

/** Lista de Python serializada ("['dance pop', \"children's music\"]") → array. */
function parsePyList(value: string | undefined): string[] {
  if (!present(value)) return [];
  const out: string[] = [];
  for (const m of value.matchAll(/'([^']*)'|"([^"]*)"/g)) out.push(m[1] ?? m[2]);
  return out.filter(Boolean);
}

// ---------------------------------------------------------------- Billboard

export interface ChartSong {
  title: string;
  credit: string;
  /** Primera semana en la lista (ISO). */
  first: string;
  peak: number;
  weeks: number;
}

interface MhChart {
  date: string;
  data: Array<{ song: string; artist: string; this_week: number; peak_position: number | null; weeks_on_chart: number | null }>;
}

/** Archivo completo del Hot 100 (1958 → hoy), agregado por canción. */
export function readBillboardHistory(): ChartSong[] {
  const charts = JSON.parse(readFileSync(rawPath(SOURCES.billboardCharts.file), 'utf8')) as MhChart[];
  const songs = new Map<string, ChartSong>();
  for (const chart of charts) {
    for (const e of chart.data) {
      const key = `${normTitle(e.song)}|${normArtist(e.artist)}`;
      let s = songs.get(key);
      if (!s) {
        s = { title: e.song, credit: e.artist, first: chart.date, peak: 101, weeks: 0 };
        songs.set(key, s);
      }
      if (chart.date < s.first) s.first = chart.date;
      s.peak = Math.min(s.peak, e.peak_position ?? e.this_week, e.this_week);
      s.weeks = Math.max(s.weeks, e.weeks_on_chart ?? 0);
    }
  }
  return [...songs.values()];
}

export interface TTChartSong extends ChartSong {
  songId: string;
  firstChartUrl: string;
}

/** Hot 100 1958-2021 de TidyTuesday (enlaza con los rasgos de audio por song_id). */
export function readTTBillboard(): Map<string, TTChartSong> {
  const out = new Map<string, TTChartSong>();
  for (const r of readCsv(SOURCES.ttBillboard.file)) {
    const date = usDateToIso(r.week_id);
    let s = out.get(r.song_id);
    if (!s) {
      s = { songId: r.song_id, title: r.song, credit: r.performer, first: date, firstChartUrl: r.url, peak: 101, weeks: 0 };
      out.set(r.song_id, s);
    }
    if (date < s.first) {
      s.first = date;
      s.firstChartUrl = r.url;
    }
    s.peak = Math.min(s.peak, Number(r.peak_position) || 101, Number(r.week_position) || 101);
    s.weeks = Math.max(s.weeks, Number(r.weeks_on_chart) || 0);
  }
  return out;
}

// ------------------------------------------------------------------ Spotify

export interface AudioFeatures {
  /** Bailabilidad, energía, valencia, acústica, instrumentalidad, habla, directo: 0-1. */
  danceability: number | null;
  energy: number | null;
  valence: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  speechiness: number | null;
  liveness: number | null;
  tempo: number | null;
}

export interface TTAudio extends AudioFeatures {
  songId: string;
  genres: string[];
  spotifyId: string | null;
  durationSec: number | null;
  explicit: boolean | null;
  album: string | null;
  albumDate: string | null;
  popularity: number | null;
}

/**
 * El campo de álbum es a veces el nombre y a veces el objeto de la API de
 * Spotify serializado como dict de Python (con mercados, imágenes...).
 */
function parseAlbum(value: string | undefined): { name: string | null; date: string | null } {
  if (!present(value)) return { name: null, date: null };
  if (!value.trimStart().startsWith('{')) return { name: value, date: null };
  const names = [...value.matchAll(/'name':\s*(?:'([^']*)'|"([^"]*)")/g)].map((m) => m[1] ?? m[2]);
  const date = /'release_date':\s*'([^']*)'/.exec(value)?.[1] ?? null;
  return { name: names.at(-1) ?? null, date };
}

function features(r: Row): AudioFeatures {
  return {
    danceability: num(r.danceability),
    energy: num(r.energy),
    valence: num(r.valence),
    acousticness: num(r.acousticness),
    instrumentalness: num(r.instrumentalness),
    speechiness: num(r.speechiness),
    liveness: num(r.liveness),
    tempo: num(r.tempo),
  };
}

export function readTTAudioFeatures(): Map<string, TTAudio> {
  const out = new Map<string, TTAudio>();
  for (const r of readCsv(SOURCES.ttAudioFeatures.file)) {
    const ms = num(r.spotify_track_duration_ms);
    const album = parseAlbum(r.spotify_track_album);
    out.set(r.song_id, {
      songId: r.song_id,
      genres: parsePyList(r.spotify_genre),
      spotifyId: present(r.spotify_track_id) ? r.spotify_track_id : null,
      durationSec: ms === null ? null : Math.round(ms / 1000),
      explicit: present(r.spotify_track_explicit) ? r.spotify_track_explicit.toUpperCase() === 'TRUE' : null,
      album: album.name,
      albumDate: album.date,
      popularity: num(r.spotify_track_popularity),
      ...features(r),
    });
  }
  return out;
}

export interface PlaylistTrack extends AudioFeatures {
  spotifyId: string;
  title: string;
  artist: string;
  popularity: number;
  album: string;
  releaseDate: string;
  genres: string[];
  durationSec: number | null;
}

/** Remezclas, directos y versiones que no deben convertirse en canciones nuevas. */
const DERIVATIVE = /\b(remix|rmx|re-?mix|mashup|bootleg|karaoke|8[- ]bit|slowed|sped up|nightcore|vip mix|club mix|dub mix|instrumental version|tribute)\b|[-(]\s*(live|ao vivo|en vivo|en directo)\b/i;

export function isDerivativeTitle(title: string): boolean {
  return DERIVATIVE.test(title);
}

export function readSpotifySongs(): PlaylistTrack[] {
  const byId = new Map<string, PlaylistTrack>();
  for (const r of readCsv(SOURCES.ttSpotifySongs.file)) {
    let t = byId.get(r.track_id);
    if (!t) {
      const ms = num(r.duration_ms);
      t = {
        spotifyId: r.track_id,
        title: r.track_name,
        artist: r.track_artist,
        popularity: num(r.track_popularity) ?? 0,
        album: r.track_album_name,
        releaseDate: r.track_album_release_date,
        genres: [],
        durationSec: ms === null ? null : Math.round(ms / 1000),
        ...features(r),
      };
      byId.set(r.track_id, t);
    }
    // Se conservan las repeticiones: una canción presente en muchas playlists de un género pesa más en él.
    for (const g of [r.playlist_genre, r.playlist_subgenre]) if (present(g)) t.genres.push(g);
  }
  return [...byId.values()].filter((t) => present(t.title) && present(t.artist));
}

// ------------------------------------------------- Números 1 (Uncharted Territory)

export interface NumberOne {
  title: string;
  credit: string;
  date: string;
  structure: number | null;
  multipleLeads: boolean;
  talent: string | null;
  origin: string | null;
  artistMale: number | null;
  bpm: number | null;
  energy: number | null;
  danceability: number | null;
  happiness: number | null;
  acousticness: number | null;
  lengthSec: number | null;
  instrumental: boolean;
  live: boolean;
  cover: boolean;
  sample: boolean;
  topics: string[];
  narrative: boolean;
  explicit: boolean;
  foreignLanguage: boolean;
  film: 'written' | 'featured' | null;
  tv: 'written' | 'featured' | null;
  stage: 'written' | 'featured' | null;
  /** Película o serie en la que aparecía, según la anotación. */
  work: string | null;
  dance: boolean;
  eurovision: boolean;
  genres: Array<{ values: string; weight: number }>;
  instruments: Record<string, boolean>;
  rapVerse: boolean;
  falsetto: boolean;
}

const flag = (v: string | undefined) => v === '1';

export function readNumberOnes(): NumberOne[] {
  return readCsv(SOURCES.ttNumberOnes.file).map((r) => ({
    title: r.song,
    credit: r.artist,
    date: r.date.slice(0, 10),
    structure: num(r.artist_structure),
    multipleLeads: flag(r.multiple_lead_vocalists),
    talent: present(r.talent_contestant) ? r.talent_contestant : null,
    origin: present(r.artist_place_of_origin) ? r.artist_place_of_origin : null,
    artistMale: num(r.artist_male),
    bpm: num(r.bpm),
    energy: num(r.energy),
    danceability: num(r.danceability),
    happiness: num(r.happiness),
    acousticness: num(r.acousticness),
    lengthSec: num(r.length_sec),
    instrumental: flag(r.instrumental),
    live: flag(r.live),
    cover: flag(r.cover),
    sample: flag(r.sample),
    topics: present(r.lyrical_topic) ? r.lyrical_topic.split(';').map((t) => t.trim()) : [],
    narrative: flag(r.lyrical_narrative),
    explicit: flag(r.explicit),
    foreignLanguage: flag(r.foreign_language),
    film: flag(r.written_for_a_film) ? 'written' : present(r.featured_in_a_then_contemporary_film) ? 'featured' : null,
    tv: flag(r.written_for_a_t_v_show) ? 'written' : present(r.featured_in_a_then_contemporary_t_v_show) ? 'featured' : null,
    stage: flag(r.written_for_a_play) ? 'written' : present(r.featured_in_a_then_contemporary_play) ? 'featured' : null,
    work: [r.featured_in_a_then_contemporary_film, r.featured_in_a_then_contemporary_t_v_show].find(present) ?? null,
    dance: flag(r.associated_with_dance),
    eurovision: flag(r.eurovision_entry),
    genres: [
      { values: r.cdr_genre, weight: 0.92 },
      { values: r.cdr_style, weight: 0.85 },
      { values: r.discogs_genre, weight: 0.6 },
      { values: r.discogs_style, weight: 0.65 },
    ].filter((g) => present(g.values)),
    instruments: {
      guitar: flag(r.guitar_based),
      piano: flag(r.piano_keyboard_based),
      sax: flag(r.saxophone),
      strings: flag(r.orchestral_strings),
      horns: flag(r.horns_winds),
      whistle: flag(r.human_whistling),
      harmonica: flag(r.harmonica),
      handclaps: flag(r.handclaps_snaps),
    },
    rapVerse: flag(r.rap_verse_in_a_non_rap_song),
    falsetto: flag(r.falsetto_vocal),
  }));
}

// --------------------------------------------------------------- Eurovisión

export interface EurovisionEntry {
  year: number;
  artist: string;
  song: string;
  country: string;
  /** Puesto en la final (null si no llegó). */
  finalRank: number | null;
  winner: boolean;
  url: string;
}

export function readEurovision(): EurovisionEntry[] {
  const byKey = new Map<string, EurovisionEntry>();
  for (const r of readCsv(SOURCES.ttEurovision.file)) {
    const year = Number(r.year);
    const key = `${year}|${normTitle(r.song)}|${normArtist(r.artist)}`;
    let e = byKey.get(key);
    if (!e) {
      e = { year, artist: r.artist, song: r.song, country: r.artist_country, finalRank: null, winner: false, url: r.artist_url || r.event_url };
      byKey.set(key, e);
    }
    const isFinal = r.section === 'final' || r.section === 'grand-final';
    const rank = num(r.rank);
    if (isFinal && rank !== null) e.finalRank = e.finalRank === null ? rank : Math.min(e.finalRank, rank);
    if (r.winner === 'TRUE') e.winner = true;
  }
  return [...byKey.values()].filter((e) => present(e.song) && present(e.artist));
}

// ------------------------------------------------- Anotaciones de artistas

export type Gender = 'male' | 'female' | 'mixed';

export interface ArtistAnnotation {
  name: string;
  gender: Gender | null;
  members: number | null;
  source: 'rollingstone' | 'rap';
}

export interface RapSong {
  title: string;
  credit: string;
  year: number;
  gender: Gender | null;
}

function parseGender(v: string | undefined): Gender | null {
  const g = (v ?? '').toLowerCase().trim();
  if (g === 'male') return 'male';
  if (g === 'female') return 'female';
  if (g === 'mixed' || g === 'male/female' || g === 'female/male') return 'mixed';
  return null;
}

export function readRollingStone(): ArtistAnnotation[] {
  return readCsv(SOURCES.ttRollingStone.file)
    .filter((r) => present(r.clean_name))
    .map((r) => ({ name: r.clean_name, gender: parseGender(r.artist_gender), members: num(r.artist_member_count), source: 'rollingstone' as const }));
}

export function readRapRankings(): RapSong[] {
  return readCsv(SOURCES.ttRap.file).map((r) => ({
    title: r.title,
    credit: r.artist,
    year: Number(r.year),
    gender: parseGender(r.gender),
  }));
}

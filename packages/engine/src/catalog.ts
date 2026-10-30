import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

/**
 * Formato del catálogo que produce el pipeline (`data/catalog/catalog.json.gz`).
 *
 * Es compacto a propósito: los hechos de cada canción se guardan como pares
 * `[índiceDeHecho, valor 0..100]` sobre un diccionario común, y los rasgos
 * numéricos como `[índiceNumérico, valor]`.
 */
export const CATALOG_VERSION = 1;

export interface SourceInfo {
  id: string;
  name: string;
  url: string;
  license: string;
}

export interface RawCatalog {
  version: number;
  builtAt: string;
  sources: SourceInfo[];
  /** Diccionario de claves de hecho (`lang:es`, `g:rock`, `voice:female`...). */
  factKeys: string[];
  /** Diccionario de rasgos numéricos (`bpm`, `en` energía 0-100...). */
  numKeys: string[];
  artists: string[];
  songs: RawSong[];
}

export interface RawSong {
  /** Identificador estable: hash del título y artista normalizados. */
  id: string;
  /** Título. */
  t: string;
  /** Crédito tal y como aparece en la fuente ("X Featuring Y"). */
  c: string;
  /** Índices de artistas (el primero es el principal). */
  a: number[];
  y: number | null;
  /** Calidad del año: 1 = fecha de lista o curada, 0 = fecha de álbum (menos fiable). */
  yq: 0 | 1;
  /** Duración en segundos. */
  d: number | null;
  /** Popularidad 0..1. */
  p: number;
  /** Hechos: pares [índice en factKeys, probabilidad × 100]. */
  f: number[];
  /** Rasgos numéricos: pares [índice en numKeys, valor]. */
  n: number[];
  /** Procedencia verificable. */
  s: RawSources;
  /** Película, serie o musical de la que procede, si la fuente lo indica. */
  w?: string;
}

export interface RawSources {
  /** Billboard Hot 100: [pico, semanas, primera semana YYYY-MM-DD]. */
  bb?: [number, number, string];
  /** ID de pista de Spotify. */
  sp?: string;
  /** Eurovisión: [año, país representado, puesto en la final o null, ganadora 0/1]. */
  ev?: [number, string, number | null, 0 | 1];
  /** Fecha en la que llegó al número 1 (dataset Uncharted Territory). */
  n1?: string;
  /** Aparece en las playlists de Spotify del dataset TidyTuesday 2020. */
  pl?: 1;
}

export function parseCatalog(json: string): RawCatalog {
  const catalog = JSON.parse(json) as RawCatalog;
  if (catalog.version !== CATALOG_VERSION) {
    throw new Error(`Versión de catálogo ${catalog.version} no soportada (esperada ${CATALOG_VERSION}).`);
  }
  return catalog;
}

export function loadCatalogFile(path: string): RawCatalog {
  const buf = readFileSync(path);
  const text = path.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return parseCatalog(text);
}

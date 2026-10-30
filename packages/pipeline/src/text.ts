import { createHash } from 'node:crypto';

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

const KEEP_CHARS = /[^a-z0-9぀-ヿ㐀-鿿가-힯Ѐ-ӿͰ-Ͽ]+/g;

/** Sufijos de versión que no cambian la identidad de la canción. */
const VERSION_WORDS =
  'remaster|remastered|edit|version|mono|stereo|single|explicit|clean|bonus|deluxe|re-recorded|anniversary|extended|original mix|radio';

/**
 * Clave normalizada de un título para cruzar fuentes:
 * "Shape of You (feat. X) - Remastered 2011" → "shape of you".
 */
export function normTitle(title: string): string {
  let t = title.toLowerCase();
  t = t.replace(/[([](?:feat\.?|ft\.?|featuring|with|con)\s[^)\]]*[)\]]/g, ' ');
  t = t.replace(new RegExp(`\\s+-\\s+.*(?:${VERSION_WORDS}|live|acoustic|demo|from).*$`), '');
  t = t.replace(new RegExp(`[([][^)\\]]*(?:${VERSION_WORDS}|taylor'?s version|\\bmix\\b)[^)\\]]*[)\\]]`, 'g'), ' ');
  t = stripAccents(t).replace(/&/g, ' and ').replace(/['’`´]/g, '');
  return t.replace(KEEP_CHARS, ' ').trim().replace(/\s+/g, ' ');
}

const ARTIST_FIXES: Record<string, string> = { 'p!nk': 'pink' };

/** Clave normalizada de un nombre de artista ("The Beatles" → "beatles"). */
export function normArtist(name: string): string {
  let a = name.toLowerCase().trim();
  a = ARTIST_FIXES[a] ?? a;
  a = stripAccents(a).replace(/\$/g, 's').replace(/&/g, ' and ').replace(/['’`´.]/g, '');
  a = a.replace(KEEP_CHARS, ' ').trim().replace(/\s+/g, ' ');
  return a.replace(/^the /, '');
}

const FROM_WORK = /\s*\((?:love\s+)?(?:theme\s+)?from\s*["“”']+\s*([^"“”']+?)\s*["“”']+\s*\)/i;

/** Obra de la que procede la canción según la propia lista: 'X (From "Top Gun")' → "Top Gun". */
export function workFromTitle(title: string): string | null {
  return FROM_WORK.exec(title)?.[1]?.trim() ?? null;
}

/**
 * Claves alternativas de un título para cruzar fuentes cuando no coinciden
 * literalmente: sin paréntesis ("Bodak Yellow (Money Moves)" → "bodak yellow")
 * y cada cara de un doble single ("Come Together/Something").
 */
export function altTitleKeys(title: string): string[] {
  const bare = title.replace(/[([][^)\]]*[)\]]/g, ' ');
  const keys = new Set([normTitle(bare), ...bare.split('/').map((p) => normTitle(p))]);
  keys.delete('');
  keys.delete(normTitle(title));
  return [...keys];
}

/** Título "limpio" para mostrar y para heurísticas: sin (feat. …), (From "…") ni sufijos de versión. */
export function displayTitle(title: string): string {
  return title
    .replace(new RegExp(FROM_WORK.source, 'gi'), '')
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, '')
    .replace(new RegExp(`\\s+-\\s+.*(?:${VERSION_WORDS}).*$`, 'i'), '')
    .replace(new RegExp(`\\s*[([][^)\\]]*(?:remaster|remastered|mono|stereo|bonus|deluxe)[^)\\]]*[)\\]]`, 'gi'), '')
    .trim();
}

export function songId(title: string, primaryArtist: string): string {
  return createHash('sha1').update(`${normTitle(title)}|${normArtist(primaryArtist)}`).digest('hex').slice(0, 12);
}

/** "7/17/1965" → "1965-07-17". */
export function usDateToIso(d: string): string {
  const [m, day, y] = d.split('/');
  return `${y}-${m.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

export function yearOf(isoish: string | undefined | null): number | null {
  if (!isoish) return null;
  const y = Number.parseInt(isoish.slice(0, 4), 10);
  return Number.isFinite(y) && y > 1800 && y < 2100 ? y : null;
}

export function num(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === 'NA' || v === 'None') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function present(v: string | undefined): v is string {
  return v !== undefined && v !== '' && v !== 'NA' && v !== 'None';
}

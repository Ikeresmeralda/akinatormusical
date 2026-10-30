/**
 * Conector de Wikidata (datos CC0). Descarga canciones con artículo en
 * Wikipedia (≥ 3 idiomas, o cualquiera con artículo en la Wikipedia en
 * español) y los datos de sus intérpretes: tipo (solista, dúo, grupo),
 * género, país, géneros musicales, idioma de la canción, ID de Spotify y la
 * película, serie o videojuego del que es tema principal.
 *
 *   npm run data:wikidata      → data/raw/wikidata.json
 *   npm run data:build         → lo fusiona con el resto de fuentes
 *
 * IMPORTANTE: el entorno donde se desarrolló este proyecto bloquea
 * wikidata.org por política de red, así que este conector no se ha podido
 * ejecutar contra el servicio real. El análisis de las respuestas está cubierto
 * por tests con respuestas SPARQL de ejemplo; revisa la primera ejecución.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rawPath } from '../paths';

const ENDPOINT = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'AkinatorMusical-pipeline/0.1 (+https://github.com/Ikeresmeralda/akinatormusical)';
export const WIKIDATA_FILE = 'wikidata.json';

export type WdLanguage = 'en' | 'es' | 'other';
export type WdMedia = 'film' | 'tv' | 'game';

export interface WikidataSong {
  qid: string;
  title: string;
  date: string | null;
  performers: string[];
  performerNames: string[];
  languages: WdLanguage[];
  /** Etiquetas de género en inglés ("pop music", "reggaeton"…). */
  genres: string[];
  spotify: string | null;
  sitelinks: number;
  eswiki: boolean;
  /** Obra de la que es tema principal (P942) y su tipo. */
  work: { name: string; media: WdMedia | null } | null;
}

export interface WikidataArtist {
  qid: string;
  name: string;
  kind: 'person' | 'duo' | 'group' | null;
  gender: 'male' | 'female' | null;
  /** Códigos ISO 3166-1 alfa-2. */
  countries: string[];
}

export interface WikidataDump {
  fetchedAt: string;
  songs: WikidataSong[];
  artists: WikidataArtist[];
}

// ------------------------------------------------------------------ consultas

const LANGUAGE: Record<string, WdLanguage> = { Q1860: 'en', Q1321: 'es' };
const MEDIA: Record<string, WdMedia> = {
  Q11424: 'film',
  Q24869: 'film', // largometraje
  Q202866: 'film', // película de animación
  Q5398426: 'tv',
  Q581714: 'tv', // serie de animación
  Q1366112: 'tv', // serie dramática
  Q7889: 'game',
};
const PERSON = 'Q5';
const DUO = 'Q9212979';
const GROUP_TYPES = new Set(['Q215380', 'Q5741069', 'Q641066', 'Q216337', 'Q2088357', 'Q281643', 'Q56816954']);
const GIRL_GROUP = 'Q641066';
const BOY_BAND = 'Q216337';
const GENDER: Record<string, 'male' | 'female'> = { Q6581097: 'male', Q6581072: 'female', Q2449503: 'male', Q1052281: 'female' };

/** Canciones y sencillos publicados en [from, to) con artículo en varias Wikipedias o en la española. */
export function songsQuery(from: number, to: number): string {
  return `SELECT ?song ?title ?date ?performer ?performerName ?lang ?genreLabel ?spotify ?sitelinks ?eswiki ?work ?workName ?workType WHERE {
  VALUES ?type { wd:Q7366 wd:Q134556 wd:Q105543609 }
  ?song wdt:P31 ?type ;
        wdt:P175 ?performer ;
        wdt:P577 ?date ;
        wikibase:sitelinks ?sitelinks .
  FILTER(YEAR(?date) >= ${from} && YEAR(?date) < ${to})
  OPTIONAL { ?esArticle schema:about ?song ; schema:isPartOf <https://es.wikipedia.org/> . }
  BIND(BOUND(?esArticle) AS ?eswiki)
  FILTER(?sitelinks >= 3 || ?eswiki)
  OPTIONAL { ?song wdt:P407 ?lang . }
  OPTIONAL { ?song wdt:P136 ?genre . ?genre rdfs:label ?genreLabel . FILTER(LANG(?genreLabel) = "en") }
  OPTIONAL { ?song wdt:P2207 ?spotify . }
  OPTIONAL { ?work wdt:P942 ?song . OPTIONAL { ?work wdt:P31 ?workType . } }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,es".
    ?song rdfs:label ?title .
    ?performer rdfs:label ?performerName .
    ?work rdfs:label ?workName .
  }
}`;
}

export function artistsQuery(qids: string[]): string {
  return `SELECT ?a ?name ?type ?gender ?iso WHERE {
  VALUES ?a { ${qids.map((q) => `wd:${q}`).join(' ')} }
  OPTIONAL { ?a wdt:P31 ?type . }
  OPTIONAL { ?a wdt:P21 ?gender . }
  OPTIONAL {
    { ?a wdt:P27 ?c . } UNION { ?a wdt:P495 ?c . } UNION { ?a wdt:P740/wdt:P17 ?c . }
    ?c wdt:P297 ?iso .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,es". ?a rdfs:label ?name . }
}`;
}

// ---------------------------------------------------------------- análisis

interface Binding {
  [variable: string]: { type: string; value: string } | undefined;
}

export interface SparqlResponse {
  results: { bindings: Binding[] };
}

const entity = (b: Binding, v: string) => b[v]?.value.replace('http://www.wikidata.org/entity/', '') ?? null;
const literal = (b: Binding, v: string) => b[v]?.value ?? null;

function pushUnique<T>(list: T[], value: T | null): void {
  if (value !== null && !list.includes(value)) list.push(value);
}

/** Agrupa las filas (una por combinación de valores) en una canción por QID. */
export function parseSongs(response: SparqlResponse): WikidataSong[] {
  const songs = new Map<string, WikidataSong>();
  for (const b of response.results.bindings) {
    const qid = entity(b, 'song');
    if (!qid) continue;
    let s = songs.get(qid);
    if (!s) {
      s = {
        qid,
        title: literal(b, 'title') ?? qid,
        date: literal(b, 'date')?.slice(0, 10) ?? null,
        performers: [],
        performerNames: [],
        languages: [],
        genres: [],
        spotify: null,
        sitelinks: Number(literal(b, 'sitelinks') ?? 0),
        eswiki: literal(b, 'eswiki') === 'true',
        work: null,
      };
      songs.set(qid, s);
    }
    const date = literal(b, 'date')?.slice(0, 10) ?? null;
    if (date && (!s.date || date < s.date)) s.date = date;
    const performer = entity(b, 'performer');
    if (performer && !s.performers.includes(performer)) {
      s.performers.push(performer);
      s.performerNames.push(literal(b, 'performerName') ?? performer);
    }
    const lang = entity(b, 'lang');
    if (lang) pushUnique(s.languages, LANGUAGE[lang] ?? 'other');
    pushUnique(s.genres, literal(b, 'genreLabel'));
    s.spotify ??= literal(b, 'spotify');
    const workName = literal(b, 'workName');
    if (workName) {
      const media = MEDIA[entity(b, 'workType') ?? ''] ?? null;
      if (!s.work || (!s.work.media && media)) s.work = { name: workName, media };
    }
  }
  // Una etiqueta que es el propio QID significa que no hay título legible
  return [...songs.values()].filter((s) => !/^Q\d+$/.test(s.title));
}

export function parseArtists(response: SparqlResponse): WikidataArtist[] {
  const artists = new Map<string, WikidataArtist & { types: Set<string> }>();
  for (const b of response.results.bindings) {
    const qid = entity(b, 'a');
    if (!qid) continue;
    let a = artists.get(qid);
    if (!a) {
      a = { qid, name: literal(b, 'name') ?? qid, kind: null, gender: null, countries: [], types: new Set() };
      artists.set(qid, a);
    }
    const type = entity(b, 'type');
    if (type) a.types.add(type);
    const gender = GENDER[entity(b, 'gender') ?? ''];
    if (gender) a.gender ??= gender;
    pushUnique(a.countries, literal(b, 'iso')?.toUpperCase() ?? null);
  }
  return [...artists.values()].map(({ types, ...a }) => {
    let kind: WikidataArtist['kind'] = null;
    if (types.has(PERSON)) kind = 'person';
    else if (types.has(DUO)) kind = 'duo';
    else if ([...types].some((t) => GROUP_TYPES.has(t))) kind = 'group';
    let gender = a.gender;
    if (!gender && types.has(GIRL_GROUP)) gender = 'female';
    if (!gender && types.has(BOY_BAND)) gender = 'male';
    return { ...a, kind, gender };
  });
}

// ---------------------------------------------------------------- descarga

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sparql(query: string, attempt = 0): Promise<SparqlResponse> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'application/sparql-results+json',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ query }).toString(),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 2000 * 2 ** attempt;
    await sleep(wait);
    return sparql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikidata respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as SparqlResponse;
}

/** Rangos de años: quinquenios hasta 1999 y años sueltos después (más canciones por año). */
export function yearRanges(until = new Date().getFullYear() + 1): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (let y = 1950; y < 2000; y += 5) ranges.push([y, y + 5]);
  for (let y = 2000; y < until; y++) ranges.push([y, y + 1]);
  return ranges;
}

export async function fetchWikidata(): Promise<WikidataDump> {
  const songs = new Map<string, WikidataSong>();
  for (const [from, to] of yearRanges()) {
    process.stdout.write(`↓ Wikidata ${from}-${to - 1} … `);
    const parsed = parseSongs(await sparql(songsQuery(from, to)));
    for (const s of parsed) songs.set(s.qid, s);
    console.log(`${parsed.length} canciones`);
    await sleep(1500);
  }
  const performerIds = [...new Set([...songs.values()].flatMap((s) => s.performers))];
  const artists: WikidataArtist[] = [];
  for (let i = 0; i < performerIds.length; i += 150) {
    artists.push(...parseArtists(await sparql(artistsQuery(performerIds.slice(i, i + 150)))));
    process.stdout.write(`\r↓ intérpretes ${Math.min(i + 150, performerIds.length)}/${performerIds.length}`);
    await sleep(1000);
  }
  console.log('');
  return { fetchedAt: new Date().toISOString(), songs: [...songs.values()], artists };
}

export function readWikidataDump(): WikidataDump | null {
  const path = rawPath(WIKIDATA_FILE);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as WikidataDump) : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchWikidata()
    .then((dump) => {
      writeFileSync(rawPath(WIKIDATA_FILE), JSON.stringify(dump));
      console.log(`✓ ${dump.songs.length} canciones y ${dump.artists.length} intérpretes → data/raw/${WIKIDATA_FILE}`);
      console.log('Ahora ejecuta `npm run data:build -- --offline` para incorporarlos al catálogo.');
    })
    .catch((err) => {
      console.error(`✗ ${(err as Error).message}`);
      console.error('¿Hay acceso a query.wikidata.org desde esta máquina?');
      process.exit(1);
    });
}

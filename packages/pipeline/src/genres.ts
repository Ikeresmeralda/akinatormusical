/**
 * Traducción de las ~1.100 etiquetas de género de Spotify (y de los estilos de
 * Discogs / Uncharted Territory) a la taxonomía del juego, más señales
 * laterales verificables que esas etiquetas contienen (país, idioma,
 * concursos de talentos, bandas sonoras, grupos femeninos...).
 */

type Rule = [RegExp, string[]];

const LABEL_RULES: Rule[] = [
  // --- Música latina (lo específico primero) ---
  [/reggaeton|reguet|trap latino|latin trap|trap boricua|urbano latino|dembow|perreo/, ['latin', 'reggaeton']],
  [/\btropical\b(?! house)|bachata|salsa|merengue|cumbia|vallenato|champeta|mambo|boogaloo|cuban rumba|timba/, ['latin', 'tropical']],
  [/regional mexican|\bbanda\b|norteno|grupera|ranchera|mariachi|corrido|duranguense|tejano|musica potosina/, ['latin', 'regmex']],
  [/latin pop|latin arena pop|latin viral pop|pop latino|spanish pop|mexican pop|colombian pop|puerto rican pop|panamanian pop|ecuadorian pop|argentine pop|chilean pop|venezuelan pop|cancion melodica|bolero|romantico|latin ballad|balada/, ['latin', 'latinpop', 'pop']],
  [/latin hip hop|rap latina|latin rap|mexican hip hop|chicano rap/, ['latin', 'hiphop']],
  [/rock en espanol|latin rock|rock nacional|argentine rock|mexican rock|spanish new wave|spanish invasion/, ['latin', 'rock']],
  [/^latin$|\blatin\b|latino/, ['latin']],
  [/bossa nova|samba|sertanejo|brazilian|\bmpb\b|forro|pagode/, ['latin']],
  // --- Pop asiático ---
  [/k-pop|korean|k-rap|k-hop/, ['pop', 'kpop']],
  [/j-pop|j-rock|japanese|city pop|shibuya-kei|enka|c-pop|mandopop|cantopop|chinese|taiwan|thai pop|\bopm\b|pinoy|bollywood|filmi|desi|punjabi/, ['pop']],
  // --- Electrónica ---
  [/tropical house|\bedm\b|big room|electro house|progressive house|complextro|brostep|dubstep|future house|slap house|bass house|melbourne bounce|moombahton|dutch house|tribal house|trance|hardstyle|hands up|bass trap|electronic trap|cedm/, ['electronic', 'edm']],
  [/house|techno|electronica|electronic|\belectro\b|electroclash|eurodance|hi-nrg|drum and bass|\bdnb\b|breakbeat|big beat|trip hop|downtempo|chillwave|chillstep|uk garage|uk funky|bassline|new beat|italo dance|bubblegum dance|happy hardcore|gabba|\bfreestyle\b|electropop|electropowerpop|indietronica/, ['electronic']],
  [/synthpop|synth-pop|new romantic|new wave/, ['pop', 'newwave']],
  [/disco/, ['disco']],
  // --- Hip hop ---
  [/hip hop|hip-hop|\brap\b|\btrap\b|drill|crunk|grime|g funk|hyphy|\bbounce\b|boom bap|gangster|plugg|turntablism|bmore|miami bass|traprun/, ['hiphop']],
  [/\btrap\b|melodic rap|emo rap|traprun/, ['trap']],
  // --- R&B / soul / funk ---
  [/r&b|\bsoul\b|motown|quiet storm|new jack|urban contemporary|rhythm and blues|doo-wop|minneapolis sound|vocal harmony group|classic girl group|\bfunk\b|go-go|p funk/, ['rnb']],
  [/doo-wop|vocal harmony group/, ['doowop']],
  [/motown|classic soul|northern soul|chicago soul|memphis soul|philly soul|southern soul|classic girl group/, ['motown']],
  [/\bfunk\b|p funk|minneapolis sound|go-go/, ['funk']],
  // --- Rock y derivados ---
  [/rock(?! steady)|grunge|punk|metal|british invasion|merseybeat|surf music|garage|psychedelic|britpop|madchester|jangle pop|shoegaze|\bemo\b|post-punk|protopunk|power pop|freakbeat|beatlesque|mod revival|krautrock|zolo|permanent wave|\bnwobhm\b/, ['rock']],
  [/hard rock|glam metal|sleaze rock|stoner rock|rap rock|nu metal|rap metal|glam rock|arena rock/, ['hardrock']],
  [/soft rock|yacht rock|mellow gold|adult contemporary/, ['softrock']],
  [/rock-and-roll|rock and roll|rock n roll|rockabilly|psychobilly/, ['rocknroll']],
  [/psychedelic|acid rock|freakbeat/, ['psychedelic']],
  [/grunge/, ['grunge']],
  [/metal|\bnwobhm\b/, ['metal']],
  [/punk|\bemo\b|screamo|post-hardcore/, ['punk']],
  [/indie|alternative rock|modern rock|permanent wave|alt z|chamber pop|dream pop|lo-fi|bedroom pop/, ['indie']],
  // --- Pop ---
  [/pop|boy band|girl group|\bidol\b|talent show|bubblegum/, ['pop']],
  [/boy band|post-teen pop|teen pop|bubblegum pop|\bidol\b|girl group|talent show/, ['teenpop']],
  [/dance pop|pop dance|dance-pop/, ['dancepop']],
  // --- Otros grandes géneros ---
  [/country|nashville sound|redneck|honky|bakersfield|outlaw|cowboy|western swing|bluegrass|red dirt|truck-driving|cowpunk/, ['country']],
  [/folk|singer-songwriter|cantautor|americana|stomp and holler|lilith|ectofolk|celtic|trova|nueva cancion|bluegrass|old-time/, ['folk']],
  [/jazz|swing|big band|bebop|hard bop|lounge|adult standards|easy listening|torch song|space age pop|exotica|dixieland|bossa nova|boogie-woogie|stride|vintage swoon|light music/, ['jazz']],
  [/blues/, ['blues']],
  [/reggae(?!ton)|dancehall|\bska\b|rock steady|\bdub\b|lovers rock|riddim|ragga\b|soca/, ['reggae']],
  [/christian|gospel|worship|\bccm\b|praise/, ['christian']],
  [/classical|orchestra|opera|operatic|choral|choir|neoclassical|neo-classical|classical tenor|wind ensemble|wind quintet|\bcello\b/, ['classical']],
  [/novelty|comic|comedy|parody|children's|kids|cartoon|nursery|bambini|halloween|wrestling/, ['novelty']],
];

/** Etiquetas de país que Spotify asigna según el origen del artista. */
const COUNTRY_RULES: Array<[RegExp, string, number]> = [
  [/canadian|toronto|vancouver|montreal|quebec|alberta|ottawa|manitoba/, 'CA', 1],
  [/\buk\b|british|english|scottish|welsh|merseybeat|britpop|madchester|\bnwobhm\b|manchester|sheffield|leeds|oxford indie|kent indie|derby indie|birmingham metal|freakbeat|\bc86\b|grime|brit funk/, 'GB', 1],
  [/irish|dublin|celtic rock/, 'IE', 1],
  [/australian|aussie|sydney|melbourne/, 'AU', 1],
  [/\bnz\b|kiwi/, 'NZ', 1],
  [/swedish|gothenburg/, 'SE', 1],
  [/norwegian|oslo/, 'NO', 1],
  [/danish|dansktop/, 'DK', 1],
  [/finnish/, 'FI', 1],
  [/icelandic/, 'IS', 1],
  [/dutch|nederpop|nederhop|levenslied/, 'NL', 1],
  [/belgian/, 'BE', 1],
  [/german|neue deutsche|hamburg|munich|dusseldorf/, 'DE', 1],
  [/austropop/, 'AT', 1],
  [/swiss/, 'CH', 1],
  [/french|chanson|ye ye|rap conscient/, 'FR', 1],
  [/italian|italo/, 'IT', 1],
  [/spanish pop|spanish new wave|spanish invasion/, 'ES', 1],
  [/puerto rican|boricua/, 'PR', 1],
  [/colombian|reggaeton colombiano|vallenato|champeta/, 'CO', 1],
  [/mexican|regional mexican|\bbanda\b|norteno|grupera|ranchera|mariachi|duranguense|corrido|musica potosina/, 'MX', 1],
  [/argentine|rock nacional|folklore argentino/, 'AR', 1],
  [/chilean/, 'CL', 1],
  [/cuban/, 'CU', 1],
  [/dominican/, 'DO', 1],
  [/panamanian/, 'PA', 1],
  [/venezuelan/, 'VE', 1],
  [/ecuadorian/, 'EC', 1],
  [/brazilian|sertanejo|samba|bossa nova|\bmpb\b/, 'BR', 1],
  [/barbadian/, 'BB', 1],
  [/bahamian/, 'BS', 1],
  [/jamaican|dancehall|roots reggae|rock steady/, 'JM', 0.8],
  [/soca|trinidad/, 'TT', 0.8],
  [/haitian|kreyol/, 'HT', 1],
  [/k-pop|korean|k-rap|k-hop/, 'KR', 1],
  [/j-pop|japanese|j-rock|enka|shibuya-kei/, 'JP', 1],
  [/c-pop|mandopop|chinese/, 'CN', 1],
  [/taiwan/, 'TW', 1],
  [/cantopop/, 'HK', 1],
  [/bollywood|filmi|desi|punjabi|indian|bhangra/, 'IN', 1],
  [/pinoy|\bopm\b/, 'PH', 1],
  [/thai pop/, 'TH', 1],
  [/singaporean/, 'SG', 1],
  [/nigerian|naija|afrobeats/, 'NG', 0.9],
  [/ghanaian|azonto/, 'GH', 1],
  [/south african|kwaito|xhosa/, 'ZA', 1],
  [/ethiopian/, 'ET', 1],
  [/israeli/, 'IL', 1],
  [/romanian/, 'RO', 1],
  [/croatian/, 'HR', 1],
  [/yugoslav|sevdah|turbo folk/, 'RS', 0.8],
  [/russian/, 'RU', 1],
  // EE. UU.: escenas y ciudades explícitas (peso completo) y estilos muy estadounidenses (peso menor)
  [/\batl\b|atlanta|chicago|detroit|houston|memphis|miami|\bnyc\b|brooklyn|bronx|queens|harlem|philly|pittsburgh|new orleans|baton rouge|\bdfw\b|texas|oklahoma|arkansas|nashville|louisiana|west coast|east coast|\bcali\b|la indie|la pop|hyphy|\bdmv\b|\bnc hip hop|north carolina|florida|ohio|minneapolis|minnesota|seattle|boston|alabama|kentucky|tennessee|new jersey|new england|socal|san diego|sacramento|portland|washington|michigan|maine|utah|albuquerque|baltimore|bmore|buffalo|milwaukee|dayton|el paso|austin|san marcos|\bokc\b|lancaster pa|charlottesville|ann arbor|athens indie|dirty south|chicano/, 'US', 1],
  [/motown|philly soul|brill building|doo-wop|yacht rock|heartland rock|outlaw country|redneck|bakersfield|contemporary country|country road|country dawn|new jack swing|quiet storm|urban contemporary|southern soul|southern hip hop|gangster rap|crunk|g funk|bounce|new orleans/, 'US', 0.6],
];

const LANGUAGE_RULES: Array<[RegExp, 'es' | 'other']> = [
  [/reggaeton|reguet|trap latino|latin|bachata|salsa|merengue|cumbia|vallenato|champeta|regional mexican|\bbanda\b|norteno|grupera|ranchera|mariachi|corrido|duranguense|spanish|mexican pop|colombian pop|puerto rican pop|bolero|romantico|rock en espanol|rock nacional|cancion melodica|dembow|trova|nueva cancion|boricua/, 'es'],
  [/k-pop|korean|k-rap|k-hop|j-pop|japanese|enka|c-pop|mandopop|cantopop|chinese|taiwan|bollywood|filmi|desi|punjabi|french pop|chanson|ye ye|italian pop|classic italian|german pop|schlager|neue deutsche|sertanejo|samba|bossa nova|\bmpb\b|brazilian|turbo folk|sevdah|dansktop|levenslied|thai pop|\bopm\b|russian|rap conscient|french hip hop/, 'other'],
];

export interface GenreSignals {
  /** Peso relativo de cada etiqueta de la taxonomía (0..1). */
  labels: Map<string, number>;
  /** Número de etiquetas de origen analizadas. */
  genreCount: number;
  countries: Map<string, number>;
  language: { es: number; other: number };
  talent: boolean;
  viral: boolean;
  christmas: boolean;
  soundtrack: boolean;
  tv: boolean;
  stage: boolean;
  femaleGroup: boolean;
  maleGroup: boolean;
  femaleVoice: boolean;
  group: boolean;
}

export function emptySignals(): GenreSignals {
  return {
    labels: new Map(),
    genreCount: 0,
    countries: new Map(),
    language: { es: 0, other: 0 },
    talent: false,
    viral: false,
    christmas: false,
    soundtrack: false,
    tv: false,
    stage: false,
    femaleGroup: false,
    maleGroup: false,
    femaleVoice: false,
    group: false,
  };
}

/**
 * Agrega una lista de etiquetas de género. El peso de cada etiqueta de la
 * taxonomía es proporcional a cuántas etiquetas de origen la respaldan
 * (normalizado al máximo): el género dominante pesa ~0,95 y una etiqueta
 * minoritaria queda baja, porque el jugador probablemente diría que no.
 */
export function analyzeGenres(rawGenres: string[]): GenreSignals {
  const signals = emptySignals();
  const counts = new Map<string, number>();
  for (const raw of rawGenres) {
    const g = raw.toLowerCase().trim();
    if (!g) continue;
    signals.genreCount++;
    const labels = new Set<string>();
    for (const [re, ls] of LABEL_RULES) if (re.test(g)) ls.forEach((l) => labels.add(l));
    for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
    for (const [re, code, w] of COUNTRY_RULES) {
      if (re.test(g)) signals.countries.set(code, Math.max(signals.countries.get(code) ?? 0, w));
    }
    for (const [re, lang] of LANGUAGE_RULES) {
      if (re.test(g)) signals.language[lang] += 1;
    }
    if (/talent show|glee club/.test(g)) signals.talent = true;
    if (/viral pop|social media pop|viral rap|viral trap|meme rap|latin viral pop/.test(g)) signals.viral = true;
    if (/christmas/.test(g)) signals.christmas = true;
    if (/soundtrack|movie tunes|disney|scorecore|\banime\b/.test(g)) signals.soundtrack = true;
    if (/glee club/.test(g)) signals.tv = true;
    if (/show tunes|broadway|cabaret|west end|hollywood/.test(g)) signals.stage = true;
    if (/girl group|k-pop girl group/.test(g)) signals.femaleGroup = true;
    if (/boy band|k-pop boy group/.test(g)) signals.maleGroup = true;
    if (/lilith|trap queen|diva house/.test(g)) signals.femaleVoice = true;
    if (/girl group|boy band|vocal harmony group|a cappella|barbershop|k-pop boy group|k-pop girl group|jam band/.test(g)) {
      signals.group = true;
    }
  }
  const max = Math.max(0, ...counts.values());
  for (const [label, c] of counts) signals.labels.set(label, 0.15 + 0.8 * (c / max));
  return signals;
}

/**
 * Estilos curados (Uncharted Territory y Discogs) → etiquetas. Cada campo
 * tiene su propio peso: el género asignado a mano pesa más que los estilos
 * de Discogs, que describen el lanzamiento (con sus remezclas) y no la canción.
 */
export function mapCuratedGenres(fields: Array<{ values: string; weight: number }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const { values, weight } of fields) {
    const signals = analyzeGenres(values.split(/[;,]/).map((v) => curatedAlias(v.trim())).filter(Boolean));
    for (const label of signals.labels.keys()) out.set(label, Math.max(out.get(label) ?? 0, weight));
  }
  return out;
}

function curatedAlias(v: string): string {
  const lower = v.toLowerCase();
  const aliases: Record<string, string> = {
    'funk/soul': 'soul funk',
    'electronic/dance': 'electronic dance pop',
    'folk/country': 'folk country',
    'hip hop': 'hip hop',
    'rock & roll': 'rock-and-roll',
    vocal: '',
    'contemporary r&b': 'r&b',
    'synth-pop': 'synthpop',
    'pop rap': 'pop rap',
    ballad: '',
    'power ballad': 'rock',
    'non-music': '',
    stage: 'show tunes',
    'children\'s': 'children\'s music',
    'stage & screen': 'show tunes soundtrack',
    latin: 'latin',
    march: 'classical',
    polka: 'novelty',
  };
  return aliases[lower] ?? lower;
}

/**
 * Vocabulario compartido entre el pipeline de datos y el motor:
 * etiquetas de género, países y regiones. Las claves aparecen en los hechos
 * del catálogo (`g:rock`, `ctry:ES`, `reg:latam`...).
 */

export interface GenreDef {
  key: string;
  /** Pregunta tal y como se muestra al jugador. */
  question: string;
  /** Nombre corto para explicaciones ("reguetón", "rock"...). */
  label: string;
  parent?: string;
  /** Probabilidad a priori de que el jugador conteste "no lo sé". */
  dk?: number;
}

export const GENRES: GenreDef[] = [
  { key: 'pop', label: 'pop', question: '¿Dirías que es una canción pop?', dk: 0.06 },
  { key: 'rock', label: 'rock', question: '¿Es una canción de rock?', dk: 0.05 },
  { key: 'hiphop', label: 'hip hop / rap', question: '¿Es hip hop o rap?', dk: 0.04 },
  { key: 'rnb', label: 'R&B / soul', question: '¿Es R&B, soul o funk?', dk: 0.1 },
  { key: 'electronic', label: 'electrónica', question: '¿Es música electrónica o dance?', dk: 0.07 },
  { key: 'latin', label: 'música latina', question: '¿Es música latina (reguetón, pop latino, salsa, bachata…)?', dk: 0.03 },
  { key: 'country', label: 'country', question: '¿Es country?', dk: 0.06 },
  { key: 'folk', label: 'folk / cantautor', question: '¿Es folk o música de cantautor?', dk: 0.12 },
  { key: 'jazz', label: 'jazz / swing', question: '¿Es jazz, swing o un clásico de crooner?', dk: 0.1 },
  { key: 'blues', label: 'blues', question: '¿Es blues?', dk: 0.12 },
  { key: 'metal', label: 'metal', question: '¿Es heavy metal o algún tipo de metal?', dk: 0.05 },
  { key: 'punk', label: 'punk', question: '¿Es punk o pop punk?', dk: 0.08 },
  { key: 'reggae', label: 'reggae', question: '¿Es reggae, ska o dancehall?', dk: 0.07 },
  { key: 'disco', label: 'disco', question: '¿Es música disco?', dk: 0.08 },
  { key: 'christian', label: 'gospel / cristiana', question: '¿Es gospel o música cristiana?', dk: 0.1 },
  { key: 'classical', label: 'clásica / orquestal', question: '¿Es música clásica u orquestal?', dk: 0.06 },
  { key: 'novelty', label: 'humor / infantil', question: '¿Es una canción humorística, infantil o de broma?', dk: 0.06 },
  { key: 'reggaeton', parent: 'latin', label: 'reguetón', question: '¿Es reguetón?', dk: 0.04 },
  { key: 'trap', parent: 'hiphop', label: 'trap', question: '¿Es trap?', dk: 0.12 },
  { key: 'kpop', parent: 'pop', label: 'K-pop', question: '¿Es K-pop?', dk: 0.03 },
  { key: 'latinpop', parent: 'latin', label: 'pop latino', question: '¿Es pop latino o balada latina?', dk: 0.08 },
  { key: 'tropical', parent: 'latin', label: 'ritmos tropicales', question: '¿Es salsa, bachata, merengue o cumbia?', dk: 0.07 },
  { key: 'regmex', parent: 'latin', label: 'regional mexicano', question: '¿Es música regional mexicana (rancheras, corridos, banda…)?', dk: 0.07 },
  { key: 'rocknroll', parent: 'rock', label: 'rock and roll', question: '¿Es rock and roll de los primeros tiempos (años 50 y 60)?', dk: 0.08 },
  { key: 'doowop', parent: 'rnb', label: 'doo-wop', question: '¿Es doo-wop (armonías vocales de los 50)?', dk: 0.2 },
  { key: 'motown', parent: 'rnb', label: 'Motown / soul clásico', question: '¿Es Motown o soul clásico de los años 60?', dk: 0.15 },
  { key: 'funk', parent: 'rnb', label: 'funk', question: '¿Es funk?', dk: 0.12 },
  { key: 'softrock', parent: 'rock', label: 'soft rock', question: '¿Es soft rock o rock melódico suave?', dk: 0.14 },
  { key: 'hardrock', parent: 'rock', label: 'hard rock', question: '¿Es hard rock?', dk: 0.1 },
  { key: 'indie', parent: 'rock', label: 'indie / alternativo', question: '¿Es indie o rock alternativo?', dk: 0.12 },
  { key: 'grunge', parent: 'rock', label: 'grunge', question: '¿Es grunge o post-grunge?', dk: 0.12 },
  { key: 'psychedelic', parent: 'rock', label: 'psicodelia', question: '¿Es rock psicodélico?', dk: 0.15 },
  { key: 'newwave', parent: 'pop', label: 'new wave / synth-pop', question: '¿Es new wave o synth-pop ochentero?', dk: 0.12 },
  { key: 'edm', parent: 'electronic', label: 'EDM / house', question: '¿Es EDM, house o electro de festival?', dk: 0.08 },
  { key: 'teenpop', parent: 'pop', label: 'pop adolescente', question: '¿Es pop adolescente, de boy band o de girl group?', dk: 0.1 },
  { key: 'dancepop', parent: 'pop', label: 'dance-pop', question: '¿Es dance-pop (pop pensado para bailar)?', dk: 0.12 },
];

export const GENRE_KEYS = GENRES.map((g) => g.key);

export interface RegionDef {
  key: string;
  label: string;
  question: string;
  dk?: number;
}

export const REGIONS: RegionDef[] = [
  { key: 'latam', label: 'Latinoamérica', question: '¿El artista es latinoamericano (incluido Puerto Rico)?', dk: 0.06 },
  { key: 'hispanic', label: 'países hispanohablantes', question: '¿El artista es de un país de habla hispana?', dk: 0.06 },
  { key: 'europe', label: 'Europa', question: '¿El artista es europeo?', dk: 0.1 },
  { key: 'nordic', label: 'países nórdicos', question: '¿El artista es de un país nórdico (Suecia, Noruega, Dinamarca…)?', dk: 0.2 },
  { key: 'oceania', label: 'Australia / Nueva Zelanda', question: '¿El artista es de Australia o Nueva Zelanda?', dk: 0.2 },
  { key: 'asia', label: 'Asia', question: '¿El artista es asiático?', dk: 0.08 },
  { key: 'africa', label: 'África', question: '¿El artista es africano?', dk: 0.12 },
  { key: 'caribbean', label: 'Caribe anglófono', question: '¿El artista es de Jamaica, Barbados u otra isla del Caribe anglófono?', dk: 0.2 },
];

export interface CountryDef {
  code: string;
  name: string;
  regions: string[];
  /** Si tiene pregunta propia en el catálogo. */
  question?: string;
  dk?: number;
}

const LATAM_ES = ['latam', 'hispanic'];
const EU = ['europe'];
const NORDIC = ['europe', 'nordic'];

export const COUNTRIES: CountryDef[] = [
  { code: 'US', name: 'Estados Unidos', regions: [], question: '¿El artista es de Estados Unidos?', dk: 0.12 },
  { code: 'GB', name: 'Reino Unido', regions: EU, question: '¿El artista es británico?', dk: 0.15 },
  { code: 'CA', name: 'Canadá', regions: [], question: '¿El artista es canadiense?', dk: 0.2 },
  { code: 'ES', name: 'España', regions: ['europe', 'hispanic'], question: '¿El artista es español?', dk: 0.04 },
  { code: 'MX', name: 'México', regions: LATAM_ES, question: '¿El artista es mexicano?', dk: 0.1 },
  { code: 'CO', name: 'Colombia', regions: LATAM_ES, question: '¿El artista es colombiano?', dk: 0.1 },
  { code: 'PR', name: 'Puerto Rico', regions: LATAM_ES, question: '¿El artista es de Puerto Rico?', dk: 0.12 },
  { code: 'AR', name: 'Argentina', regions: LATAM_ES, question: '¿El artista es argentino?', dk: 0.1 },
  { code: 'KR', name: 'Corea del Sur', regions: ['asia'], question: '¿El artista es surcoreano?', dk: 0.05 },
  { code: 'IE', name: 'Irlanda', regions: EU, question: '¿El artista es irlandés?', dk: 0.2 },
  { code: 'AU', name: 'Australia', regions: ['oceania'] },
  { code: 'NZ', name: 'Nueva Zelanda', regions: ['oceania'] },
  { code: 'SE', name: 'Suecia', regions: NORDIC },
  { code: 'NO', name: 'Noruega', regions: NORDIC },
  { code: 'DK', name: 'Dinamarca', regions: NORDIC },
  { code: 'FI', name: 'Finlandia', regions: NORDIC },
  { code: 'IS', name: 'Islandia', regions: NORDIC },
  { code: 'FR', name: 'Francia', regions: EU },
  { code: 'DE', name: 'Alemania', regions: EU },
  { code: 'IT', name: 'Italia', regions: EU },
  { code: 'NL', name: 'Países Bajos', regions: EU },
  { code: 'BE', name: 'Bélgica', regions: EU },
  { code: 'AT', name: 'Austria', regions: EU },
  { code: 'CH', name: 'Suiza', regions: EU },
  { code: 'PT', name: 'Portugal', regions: EU },
  { code: 'GR', name: 'Grecia', regions: EU },
  { code: 'LU', name: 'Luxemburgo', regions: EU },
  { code: 'MC', name: 'Mónaco', regions: EU },
  { code: 'MT', name: 'Malta', regions: EU },
  { code: 'CY', name: 'Chipre', regions: EU },
  { code: 'SM', name: 'San Marino', regions: EU },
  { code: 'AD', name: 'Andorra', regions: EU },
  { code: 'PL', name: 'Polonia', regions: EU },
  { code: 'CZ', name: 'Chequia', regions: EU },
  { code: 'SK', name: 'Eslovaquia', regions: EU },
  { code: 'HU', name: 'Hungría', regions: EU },
  { code: 'RO', name: 'Rumanía', regions: EU },
  { code: 'BG', name: 'Bulgaria', regions: EU },
  { code: 'HR', name: 'Croacia', regions: EU },
  { code: 'SI', name: 'Eslovenia', regions: EU },
  { code: 'RS', name: 'Serbia', regions: EU },
  { code: 'BA', name: 'Bosnia y Herzegovina', regions: EU },
  { code: 'ME', name: 'Montenegro', regions: EU },
  { code: 'MK', name: 'Macedonia del Norte', regions: EU },
  { code: 'AL', name: 'Albania', regions: EU },
  { code: 'YU', name: 'Yugoslavia', regions: EU },
  { code: 'UA', name: 'Ucrania', regions: EU },
  { code: 'RU', name: 'Rusia', regions: EU },
  { code: 'BY', name: 'Bielorrusia', regions: EU },
  { code: 'MD', name: 'Moldavia', regions: EU },
  { code: 'LT', name: 'Lituania', regions: EU },
  { code: 'LV', name: 'Letonia', regions: EU },
  { code: 'EE', name: 'Estonia', regions: EU },
  { code: 'TR', name: 'Turquía', regions: EU },
  { code: 'AM', name: 'Armenia', regions: EU },
  { code: 'GE', name: 'Georgia', regions: EU },
  { code: 'AZ', name: 'Azerbaiyán', regions: EU },
  { code: 'IL', name: 'Israel', regions: ['asia'] },
  { code: 'CL', name: 'Chile', regions: LATAM_ES },
  { code: 'VE', name: 'Venezuela', regions: LATAM_ES },
  { code: 'DO', name: 'República Dominicana', regions: LATAM_ES },
  { code: 'CU', name: 'Cuba', regions: LATAM_ES },
  { code: 'PA', name: 'Panamá', regions: LATAM_ES },
  { code: 'EC', name: 'Ecuador', regions: LATAM_ES },
  { code: 'PE', name: 'Perú', regions: LATAM_ES },
  { code: 'UY', name: 'Uruguay', regions: LATAM_ES },
  { code: 'GT', name: 'Guatemala', regions: LATAM_ES },
  { code: 'HN', name: 'Honduras', regions: LATAM_ES },
  { code: 'SV', name: 'El Salvador', regions: LATAM_ES },
  { code: 'NI', name: 'Nicaragua', regions: LATAM_ES },
  { code: 'CR', name: 'Costa Rica', regions: LATAM_ES },
  { code: 'BO', name: 'Bolivia', regions: LATAM_ES },
  { code: 'PY', name: 'Paraguay', regions: LATAM_ES },
  { code: 'BR', name: 'Brasil', regions: ['latam'] },
  { code: 'JM', name: 'Jamaica', regions: ['caribbean'] },
  { code: 'BB', name: 'Barbados', regions: ['caribbean'] },
  { code: 'BS', name: 'Bahamas', regions: ['caribbean'] },
  { code: 'TT', name: 'Trinidad y Tobago', regions: ['caribbean'] },
  { code: 'HT', name: 'Haití', regions: ['caribbean'] },
  { code: 'VI', name: 'Islas Vírgenes', regions: ['caribbean'] },
  { code: 'JP', name: 'Japón', regions: ['asia'] },
  { code: 'CN', name: 'China', regions: ['asia'] },
  { code: 'TW', name: 'Taiwán', regions: ['asia'] },
  { code: 'HK', name: 'Hong Kong', regions: ['asia'] },
  { code: 'IN', name: 'India', regions: ['asia'] },
  { code: 'PH', name: 'Filipinas', regions: ['asia'] },
  { code: 'TH', name: 'Tailandia', regions: ['asia'] },
  { code: 'SG', name: 'Singapur', regions: ['asia'] },
  { code: 'ID', name: 'Indonesia', regions: ['asia'] },
  { code: 'NG', name: 'Nigeria', regions: ['africa'] },
  { code: 'ZA', name: 'Sudáfrica', regions: ['africa'] },
  { code: 'GH', name: 'Ghana', regions: ['africa'] },
  { code: 'SN', name: 'Senegal', regions: ['africa'] },
  { code: 'CM', name: 'Camerún', regions: ['africa'] },
  { code: 'CD', name: 'R. D. del Congo', regions: ['africa'] },
  { code: 'ET', name: 'Etiopía', regions: ['africa'] },
  { code: 'MA', name: 'Marruecos', regions: ['africa'] },
  { code: 'CV', name: 'Cabo Verde', regions: ['africa'] },
];

export const COUNTRY_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const LANGUAGES = [
  { key: 'en', label: 'inglés', question: '¿La canción está cantada en inglés?', dk: 0.02 },
  { key: 'es', label: 'español', question: '¿La canción está cantada en español?', dk: 0.02 },
  { key: 'other', label: 'otro idioma', question: '¿Está cantada en un idioma que no es ni inglés ni español?', dk: 0.04 },
] as const;

/** Temáticas de letra derivadas de anotaciones verificables. */
export const THEMES = [
  { key: 'love', label: 'amor', question: '¿La letra habla de amor o de estar enamorado?', dk: 0.1 },
  { key: 'heartbreak', label: 'desamor', question: '¿Habla de un desamor, una ruptura o un amor perdido?', dk: 0.12 },
  { key: 'party', label: 'fiesta', question: '¿La letra trata sobre bailar o irse de fiesta?', dk: 0.1 },
  { key: 'sex', label: 'letra sensual', question: '¿La letra es sensual o subida de tono?', dk: 0.15 },
  { key: 'empower', label: 'superación', question: '¿Habla de superación, autoestima o salir adelante?', dk: 0.15 },
  { key: 'brag', label: 'chulería', question: '¿La letra presume de dinero, éxito o actitud?', dk: 0.15 },
  { key: 'social', label: 'mensaje social', question: '¿Tiene un mensaje social o político?', dk: 0.12 },
  { key: 'sad', label: 'letra triste', question: '¿La letra es triste o melancólica?', dk: 0.12 },
  { key: 'story', label: 'historia', question: '¿La letra cuenta una historia con principio y final?', dk: 0.25 },
] as const;

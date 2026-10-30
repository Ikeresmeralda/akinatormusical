import { stripAccents } from './text';

/**
 * Detector ligero del idioma de un TÍTULO. Es solo una de las señales que se
 * combinan para estimar el idioma de la canción (un título en español no
 * garantiza una letra en español: "Livin' la Vida Loca"), por eso devuelve
 * puntuaciones y no una etiqueta.
 */
const ES_WORDS = new Set(
  (
    'el la los las del que mi tu te me se por con para sin como mas amor corazon quiero eres soy yo ella ' +
    'noche vida todo nada ti bailar baila bailando besos beso loco loca chica chico mujer hombre dime dame pa mami ' +
    'papi despacito otra vez contigo sola siempre nunca ya aqui hoy manana cielo luna fuego agua mar mundo sueno ' +
    'suenos bonita bonito gente fiesta feliz navidad adios gracias hola senor senorita corazones nadie una unos ' +
    'cuando donde porque pero solo tengo tienes quieres puedo vamos mira hasta ojos calle tiempo dios vuelve ' +
    'volver vuelvo perdon bebe nena sabor caliente gasolina musica cancion canta cantar lento rico deja dejame ' +
    'quiereme besame llorar lagrimas olvidar recuerdo verano playa tequila mentiras celos'
  ).split(' '),
);
const EN_WORDS = new Set(
  (
    'the you me my i im your it is on in of to and dont cant baby girl boy night heart love be all we are this ' +
    'that what with for up down out get got just like want need know dance over time feel go one way man ' +
    'woman day world back let little never ever more no yeah oh hey sweet home tonight again so do can will ' +
    'when who why where how song rock roll blue good bad without yesterday everybody somebody nothing forever'
  ).split(' '),
);
const PT_WORDS = new Set('voce nao meu minha coracao eu sou ele ela tudo amo saudade obrigado muito'.split(' '));
const FR_WORDS = new Set('je moi toi le les des est et mon ma mes sur une cest pas qui oui amour toujours'.split(' '));
const IT_WORDS = new Set('il che di per sono amore mio mia ti amo ciao bella questo notte sole cuore'.split(' '));
const DE_WORDS = new Set('ich du und der die das nicht ist ein eine liebe mein dich mich wir sind'.split(' '));

export interface TitleLanguage {
  en: number;
  es: number;
  other: number;
  /** Escritura no latina (coreano, japonés, cirílico...) detectada. */
  script: boolean;
}

export function titleLanguage(title: string): TitleLanguage {
  const raw = title.replace(/[([][^)\]]*[)\]]/g, ' ');
  const script = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿͰ-Ͽ]/.test(raw);
  const lower = raw.toLowerCase();
  let es = 0;
  let en = 0;
  let other = script ? 3 : 0;
  if (/[ñ¿¡]/.test(lower)) es += 2;
  if (/[áíóú]/.test(lower)) es += 1;
  if (/[ãõç]|ção/.test(lower)) other += 2;
  if (/[èêàâùûëïîœ]/.test(lower)) other += 1;
  if (/[äöüß]/.test(lower)) other += 1;
  const words = stripAccents(lower).replace(/[’']/g, '').split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    if (ES_WORDS.has(w)) es += 1;
    if (EN_WORDS.has(w)) en += 1;
    if (PT_WORDS.has(w) || FR_WORDS.has(w) || IT_WORDS.has(w) || DE_WORDS.has(w)) other += 0.8;
  }
  return { en, es, other, script };
}

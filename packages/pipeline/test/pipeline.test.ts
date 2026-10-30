import { describe, expect, it } from 'vitest';
import { ArtistRegistry, hasFeaturing } from '../src/credits';
import { analyzeGenres } from '../src/genres';
import { countryCode, parseCountryList, regionsOf } from '../src/geo';
import { titleLanguage } from '../src/language';
import { isDerivativeTitle } from '../src/readers';
import { altTitleKeys, displayTitle, normArtist, normTitle, workFromTitle } from '../src/text';

describe('normalización de títulos y artistas', () => {
  it('ignora invitados, remasterizaciones y signos', () => {
    expect(normTitle('Shape of You (feat. Someone) - Remastered 2011')).toBe('shape of you');
    expect(normTitle("Don't Stop Me Now")).toBe(normTitle('Dont Stop Me Now'));
    expect(normTitle('Macarena (Bayside Boys Mix)')).toBe('macarena');
    expect(normTitle('Love Story (Taylor’s Version)')).toBe('love story');
  });

  it('normaliza artistas con artículo, tildes y símbolos', () => {
    expect(normArtist('The Beatles')).toBe('beatles');
    expect(normArtist('Beyoncé')).toBe('beyonce');
    expect(normArtist('Ke$ha')).toBe('kesha');
    expect(normArtist('P!nk')).toBe('pink');
  });

  it('extrae la obra de origen y genera claves alternativas', () => {
    expect(workFromTitle('Gangsta\'s Paradise (From "Dangerous Minds")')).toBe('Dangerous Minds');
    expect(displayTitle('Gangsta\'s Paradise (From "Dangerous Minds")')).toBe("Gangsta's Paradise");
    expect(altTitleKeys('Come Together/Something')).toEqual(expect.arrayContaining(['come together', 'something']));
    expect(altTitleKeys('Bodak Yellow (Money Moves)')).toContain('bodak yellow');
  });

  it('descarta remezclas y directos como canciones nuevas', () => {
    expect(isDerivativeTitle('Memories - Dillon Francis Remix')).toBe(true);
    expect(isDerivativeTitle('Saudade em Gotas - Ao Vivo')).toBe(true);
    expect(isDerivativeTitle('Shape of You')).toBe(false);
  });
});

describe('división de créditos', () => {
  const registry = new ArtistRegistry();
  for (const credit of ['Lady Gaga', 'Bruno Mars', 'Future', 'Metro Boomin', 'Kendrick Lamar', 'Simon & Garfunkel', 'Lil Nas X']) {
    registry.observeCredit(credit);
  }

  it('divide colaboraciones entre artistas conocidos', () => {
    expect(registry.split('Lady Gaga & Bruno Mars')).toEqual(['Lady Gaga', 'Bruno Mars']);
    expect(registry.split('Future, Metro Boomin & Kendrick Lamar')).toEqual(['Future', 'Metro Boomin', 'Kendrick Lamar']);
    expect(registry.split('Lil Nas X Featuring Billy Ray Cyrus')).toEqual(['Lil Nas X', 'Billy Ray Cyrus']);
  });

  it('no rompe nombres de grupo con «&» ni artistas con X mayúscula', () => {
    expect(registry.split('Simon & Garfunkel')).toEqual(['Simon & Garfunkel']);
    expect(registry.split('Earth, Wind & Fire')).toEqual(['Earth, Wind & Fire']);
    expect(hasFeaturing('Lil Nas X & Jack Harlow')).toBe(false);
    expect(hasFeaturing('Kygo x Whitney Houston')).toBe(true);
  });
});

describe('señales de idioma y género', () => {
  it('reconoce títulos en español e inglés', () => {
    expect(titleLanguage('Despacito').es).toBeGreaterThan(0);
    expect(titleLanguage("Hips Don't Lie").en).toBeGreaterThan(0);
    expect(titleLanguage('강남스타일').script).toBe(true);
  });

  it('traduce géneros de Spotify a la taxonomía con señales de país e idioma', () => {
    const s = analyzeGenres(['reggaeton', 'trap latino', 'puerto rican pop']);
    expect(s.labels.get('reggaeton')).toBeGreaterThan(0.5);
    expect(s.labels.get('latin')).toBeGreaterThan(0.9);
    expect(s.countries.get('PR')).toBe(1);
    expect(s.language.es).toBeGreaterThan(0);
    expect(analyzeGenres(['reggaeton']).labels.has('reggae')).toBe(false);
    expect(analyzeGenres(['tropical house']).labels.has('tropical')).toBe(false);
  });

  it('el género dominante pesa más que una etiqueta minoritaria', () => {
    const s = analyzeGenres(['dance pop', 'pop', 'post-teen pop', 'r&b']);
    expect(s.labels.get('pop')!).toBeGreaterThan(s.labels.get('rnb')!);
  });
});

describe('países', () => {
  it('convierte nombres y reparte peso entre varios países', () => {
    expect(countryCode('United Kingdom')).toBe('GB');
    const split = parseCountryList('Puerto Rico;Canada');
    expect(split.get('PR')).toBeCloseTo(0.5);
    expect(regionsOf(new Map([['ES', 1]])).get('hispanic')).toBe(1);
  });
});

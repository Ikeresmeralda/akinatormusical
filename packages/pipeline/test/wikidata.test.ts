import { describe, expect, it } from 'vitest';
import { artistsQuery, parseArtists, parseSongs, songsQuery, yearRanges, type SparqlResponse } from '../src/sources/wikidata';

const uri = (q: string) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${q}` });
const lit = (v: string) => ({ type: 'literal', value: v });

describe('conector de Wikidata', () => {
  it('construye consultas acotadas por años y por lotes de intérpretes', () => {
    const q = songsQuery(1980, 1985);
    expect(q).toContain('YEAR(?date) >= 1980 && YEAR(?date) < 1985');
    expect(q).toContain('wdt:P175');
    expect(q).toContain('<https://es.wikipedia.org/>');
    expect(artistsQuery(['Q1', 'Q2'])).toContain('VALUES ?a { wd:Q1 wd:Q2 }');
    const ranges = yearRanges(2003);
    expect(ranges[0]).toEqual([1950, 1955]);
    expect(ranges.at(-1)).toEqual([2002, 2003]);
  });

  it('agrupa las filas de una canción (varios intérpretes, idiomas y géneros)', () => {
    const response: SparqlResponse = {
      results: {
        bindings: [
          {
            song: uri('Q1'),
            title: lit('Hijo de la luna'),
            date: lit('1986-09-01T00:00:00Z'),
            performer: uri('Q100'),
            performerName: lit('Mecano'),
            lang: uri('Q1321'),
            genreLabel: lit('pop music'),
            sitelinks: lit('12'),
            eswiki: lit('true'),
          },
          { song: uri('Q1'), title: lit('Hijo de la luna'), date: lit('1986-09-01T00:00:00Z'), performer: uri('Q100'), performerName: lit('Mecano'), genreLabel: lit('synth-pop'), sitelinks: lit('12') },
          {
            song: uri('Q2'),
            title: lit('Gonna Fly Now'),
            date: lit('1977-01-01T00:00:00Z'),
            performer: uri('Q200'),
            performerName: lit('Bill Conti'),
            sitelinks: lit('8'),
            eswiki: lit('false'),
            workName: lit('Rocky'),
            workType: uri('Q11424'),
          },
          { song: uri('Q3'), title: lit('Q3'), performer: uri('Q300'), sitelinks: lit('3') },
        ],
      },
    };
    const songs = parseSongs(response);
    expect(songs).toHaveLength(2);
    const hijo = songs.find((s) => s.qid === 'Q1')!;
    expect(hijo).toMatchObject({ title: 'Hijo de la luna', date: '1986-09-01', performerNames: ['Mecano'], languages: ['es'], eswiki: true, sitelinks: 12 });
    expect(hijo.genres).toEqual(['pop music', 'synth-pop']);
    expect(songs.find((s) => s.qid === 'Q2')!.work).toEqual({ name: 'Rocky', media: 'film' });
  });

  it('clasifica intérpretes: persona, dúo, grupo, género y países', () => {
    const response: SparqlResponse = {
      results: {
        bindings: [
          { a: uri('Q10'), name: lit('Rosalía'), type: uri('Q5'), gender: uri('Q6581072'), iso: lit('ES') },
          { a: uri('Q11'), name: lit('Las Ketchup'), type: uri('Q641066'), iso: lit('ES') },
          { a: uri('Q12'), name: lit('Simon & Garfunkel'), type: uri('Q9212979'), iso: lit('US') },
          { a: uri('Q12'), name: lit('Simon & Garfunkel'), type: uri('Q215380'), iso: lit('US') },
        ],
      },
    };
    const artists = parseArtists(response);
    expect(artists.find((a) => a.qid === 'Q10')).toMatchObject({ kind: 'person', gender: 'female', countries: ['ES'] });
    expect(artists.find((a) => a.qid === 'Q11')).toMatchObject({ kind: 'group', gender: 'female' });
    expect(artists.find((a) => a.qid === 'Q12')).toMatchObject({ kind: 'duo', gender: null, countries: ['US'] });
  });
});

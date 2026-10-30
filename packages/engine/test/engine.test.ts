import { describe, expect, it } from 'vitest';
import {
  CATALOG_VERSION,
  Engine,
  answerEntropy,
  compileCatalog,
  fromCode,
  type AnswerRecord,
  type RawCatalog,
  type RawSong,
} from '../src/index';

/** Catálogo sintético mínimo para tests deterministas. */
function makeCatalog(): RawCatalog {
  const factKeys = ['lang:en', 'lang:es', 'lang:other', 'voice:male', 'voice:female', 'voice:mixed', 'voice:instr', 'g:rock', 'g:pop', 'g:latin'];
  const fk = (k: string) => factKeys.indexOf(k);
  const song = (id: string, t: string, artist: number, y: number, p: number, facts: Record<string, number>): RawSong => ({
    id,
    t,
    c: ['Queen', 'Shakira', 'Mecano', 'Adele', 'Bad Bunny'][artist],
    a: [artist],
    y,
    yq: 1,
    d: 200,
    p,
    f: Object.entries(facts).flatMap(([k, v]) => [fk(k), v]),
    n: [],
    s: {},
  });
  const en = { 'lang:en': 97, 'lang:es': 2, 'lang:other': 2 };
  const es = { 'lang:en': 2, 'lang:es': 97, 'lang:other': 2 };
  const male = { 'voice:male': 95, 'voice:female': 0, 'voice:mixed': 0, 'voice:instr': 3 };
  const female = { 'voice:male': 0, 'voice:female': 95, 'voice:mixed': 0, 'voice:instr': 3 };
  return {
    version: CATALOG_VERSION,
    builtAt: '2026-01-01T00:00:00Z',
    sources: [],
    factKeys,
    numKeys: [],
    artists: ['Queen', 'Shakira', 'Mecano', 'Adele', 'Bad Bunny'],
    songs: [
      song('s1', 'Bohemian Rhapsody', 0, 1975, 1, { ...en, ...male, 'g:rock': 95 }),
      song('s2', 'Hips Don’t Lie', 1, 2006, 1, { ...en, ...female, 'g:pop': 90, 'g:latin': 80 }),
      song('s3', 'Hijo de la Luna', 2, 1986, 0.9, { ...es, ...female, 'g:pop': 90 }),
      song('s4', 'Rolling in the Deep', 3, 2010, 1, { ...en, ...female, 'g:pop': 80 }),
      song('s5', 'Dákiti', 4, 2020, 0.95, { ...es, ...male, 'g:latin': 95 }),
      song('s6', 'We Will Rock You', 0, 1977, 0.95, { ...en, ...male, 'g:rock': 95 }),
      song('s7', 'Cruz de Navajas', 2, 1986, 0.8, { ...es, ...female, 'g:pop': 85 }),
      song('s8', 'Hello', 3, 2015, 1, { ...en, ...female, 'g:pop': 85 }),
    ],
  };
}

const engine = () => new Engine(compileCatalog(makeCatalog()));
const input = (answers: AnswerRecord[] = [], guesses: Array<{ id: string; at: number }> = []) => ({
  mode: 'hard' as const,
  answers,
  guesses,
});

function probabilityOf(e: Engine, answers: AnswerRecord[], songId: string): number {
  const post = e.posterior(input(answers));
  const idx = e.songIndex(songId)!;
  return post.post[Array.from(post.pool).indexOf(idx)];
}

describe('modelo de respuesta', () => {
  it('la entropía de la respuesta es máxima con incertidumbre total', () => {
    expect(answerEntropy(0.5)).toBeGreaterThan(answerEntropy(0.9));
    expect(answerEntropy(0.5)).toBeGreaterThan(answerEntropy(0.1));
  });

  it('«No lo sé» no altera el posterior', () => {
    const e = engine();
    const before = probabilityOf(e, [], 's3');
    const after = probabilityOf(e, [{ q: 'lang_es', a: 'unknown' }], 's3');
    expect(after).toBeCloseTo(before, 10);
  });

  it('un «sí» concentra la probabilidad sin eliminar del todo al resto', () => {
    const e = engine();
    const answers: AnswerRecord[] = [{ q: 'lang_es', a: 'yes' }];
    const spanish = ['s3', 's5', 's7'].reduce((s, id) => s + probabilityOf(e, answers, id), 0);
    expect(spanish).toBeGreaterThan(0.85);
    expect(probabilityOf(e, answers, 's1')).toBeGreaterThan(0);
  });

  it('«probablemente sí» desplaza menos que «sí»', () => {
    const e = engine();
    const sure = probabilityOf(e, [{ q: 'lang_es', a: 'yes' }], 's3');
    const probably = probabilityOf(e, [{ q: 'lang_es', a: 'probably' }], 's3');
    const none = probabilityOf(e, [], 's3');
    expect(sure).toBeGreaterThan(probably);
    expect(probably).toBeGreaterThan(none);
  });
});

describe('elección de preguntas', () => {
  it('prefiere preguntas que dividen bien a las candidatas', () => {
    const e = engine();
    const ranked = e.rankQuestions(input(), e.posterior(input()), 200);
    const ig = (id: string) => ranked.find((r) => r.id === id)?.infoGain ?? 0;
    // El idioma divide 5/3; "¿Es reguetón?" no lo tiene nadie y no aporta nada.
    expect(ig('lang_es')).toBeGreaterThan(0.3);
    expect(ig('g_reggaeton')).toBeLessThan(0.05);
  });

  it('no repite preguntas ni pregunta lo que ya está implícito', () => {
    const e = engine();
    const answers: AnswerRecord[] = [
      { q: 'lang_es', a: 'yes' },
      { q: 'dec_1980', a: 'yes' },
    ];
    const ids = e.rankQuestions(input(answers), e.posterior(input(answers)), 500).map((r) => r.id);
    expect(ids).not.toContain('lang_es');
    // Grupo exclusivo de idioma cerrado por el «sí»
    expect(ids).not.toContain('lang_en');
    // Década conocida: el resto de décadas y los umbrales determinados sobran
    expect(ids).not.toContain('dec_1990');
    expect(ids).not.toContain('era_lt1990');
    expect(ids).not.toContain('era_lt1970');
  });

  it('genera preguntas dinámicas de artista cuando un artista concentra la masa', () => {
    const e = engine();
    const answers: AnswerRecord[] = [
      { q: 'lang_es', a: 'yes' },
      { q: 'voice_female', a: 'yes' },
    ];
    const ids = e.rankQuestions(input(answers), e.posterior(input(answers)), 500).map((r) => r.id);
    const mecano = `artist:${e.catalog.artists.indexOf('Mecano')}`;
    expect(ids).toContain(mecano);
    expect(e.publicQuestion(e.resolve(mecano)!).text).toBe('¿Es una canción de Mecano?');
  });
});

describe('decisión', () => {
  it('intenta adivinar cuando la confianza es alta y no repite canciones rechazadas', () => {
    const e = engine();
    const answers: AnswerRecord[] = [
      { q: 'lang_es', a: 'yes' },
      { q: 'voice_male', a: 'yes' },
      { q: 'g_latin', a: 'yes' },
      { q: 'era_ge2020', a: 'yes' },
      { q: 'artist_oneword', a: 'no' },
    ];
    const first = e.step(input(answers));
    expect(first.type).toBe('guess');
    if (first.type !== 'guess') return;
    expect(first.song.id).toBe('s5');
    expect(first.confidence).toBeGreaterThan(0.6);
    expect(first.clues.length).toBeGreaterThan(0);
    const next = e.step(input(answers, [{ id: 's5', at: answers.length }]));
    if (next.type === 'guess') expect(next.song.id).not.toBe('s5');
  });

  it('con semilla de partida, una partida completa termina en intento o rendición', () => {
    const e = engine();
    const answers: AnswerRecord[] = [];
    const guesses: Array<{ id: string; at: number }> = [];
    let finished = false;
    for (let turn = 0; turn < 400 && !finished; turn++) {
      const d = e.step({ mode: 'hard', answers, guesses, seed: 12345 });
      if (d.type === 'question') answers.push({ q: d.question.id, a: 'unknown' });
      else if (d.type === 'guess') guesses.push({ id: d.song.id, at: answers.length });
      else finished = true;
    }
    expect(finished).toBe(true);
  });

  it('se rinde al agotar los intentos', () => {
    const e = engine();
    const guesses = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((id) => ({ id, at: 0 }));
    expect(e.step(input([], guesses)).type).toBe('give_up');
  });
});

describe('aprendizaje', () => {
  it('las respuestas confirmadas mueven la probabilidad, más donde no había datos', () => {
    const e = engine();
    const unknownIdx = e.catalog.questionIndex.get('explicit')!;
    const known = e.catalog.questions[e.catalog.questionIndex.get('lang_es')!];
    const s3 = e.songIndex('s3')!;
    const before = fromCode(e.catalog.questions[unknownIdx].codes[s3]);
    e.applyLearning('s3', 'explicit', { yes: 3, probably: 0, unknown: 0, probably_not: 0, no: 0 });
    const after = fromCode(e.catalog.questions[unknownIdx].codes[s3]);
    expect(after - before).toBeGreaterThan(0.4);

    const knownBefore = fromCode(known.codes[s3]);
    e.applyLearning('s3', 'lang_es', { yes: 0, probably: 0, unknown: 0, probably_not: 0, no: 3 });
    const knownAfter = fromCode(known.codes[s3]);
    expect(knownBefore - knownAfter).toBeGreaterThan(0.1);
    expect(knownBefore - knownAfter).toBeLessThan(after - before);
  });

  it('detecta respuestas que contradicen los datos', () => {
    const e = engine();
    const mismatches = e.compareWithData('s1', [
      { q: 'lang_es', a: 'yes' },
      { q: 'voice_male', a: 'yes' },
    ]);
    expect(mismatches.map((m) => m.questionId)).toEqual(['lang_es']);
    expect(mismatches[0].dataSaysYes).toBe(false);
  });
});

describe('búsqueda', () => {
  it('encuentra canciones por título y artista sin importar tildes ni mayúsculas', () => {
    const e = engine();
    expect(e.search('dakiti')[0]?.id).toBe('s5');
    expect(e.search('mecano luna')[0]?.id).toBe('s3');
    expect(e.search('zzz')).toEqual([]);
  });
});

/**
 * Benchmark del motor con jugadores simulados.
 *
 *   npm run bench               → docs/BENCHMARK.md
 *   npm run bench -- --games 100
 *
 * Mide la eficacia de la ESTRATEGIA de preguntas sobre el propio catálogo:
 * el jugador simulado responde según los datos (con dudas y errores), así que
 * no mide la calidad de los datos frente a jugadores reales.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PLAYER,
  Engine,
  FixedQuestionnaireEngine,
  RandomQuestionEngine,
  compileCatalog,
  loadCatalogFile,
  playGame,
  sampleTarget,
  seededRandom,
  type GameResult,
  type Mode,
  type PlayerProfile,
} from '../src/index';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const argGames = process.argv.indexOf('--games');
const GAMES = argGames > 0 ? Number(process.argv[argGames + 1]) : 300;
/** --only N: ejecuta solo los N primeros escenarios (para iterar rápido) y no escribe el informe. */
const argOnly = process.argv.indexOf('--only');
const ONLY = argOnly > 0 ? Number(process.argv[argOnly + 1]) : 0;

interface Scenario {
  name: string;
  description: string;
  mode: Mode;
  engine: Engine;
  games: number;
  profile?: PlayerProfile;
}

interface Summary {
  scenario: Scenario;
  results: GameResult[];
}

function percentile(values: number[], p: number): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function run(s: Scenario): Summary {
  const rng = seededRandom(20261030);
  const results: GameResult[] = [];
  for (let g = 0; g < s.games; g++) {
    const target = sampleTarget(s.engine, s.mode, rng);
    results.push(playGame(s.engine, s.mode, target, rng, s.profile ?? DEFAULT_PLAYER));
  }
  return { scenario: s, results };
}

function row(sum: Summary): string {
  const r = sum.results;
  const wins = r.filter((x) => x.won);
  const winQ = wins.map((x) => x.questions);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const pct = (n: number) => `${((100 * n) / r.length).toFixed(1)} %`;
  return [
    sum.scenario.name,
    String(r.length),
    pct(wins.length),
    pct(wins.filter((x) => x.questions <= 20).length),
    mean(winQ).toFixed(1),
    String(percentile(winQ, 50)),
    String(percentile(winQ, 90)),
    mean(wins.map((x) => x.guesses)).toFixed(2),
    mean(r.map((x) => x.msPerStep)).toFixed(1),
  ].join(' | ');
}

function calibration(summaries: Summary[]): string {
  const buckets = [
    [0, 0.3],
    [0.3, 0.6],
    [0.6, 0.85],
    [0.85, 1.01],
  ];
  const lines = ['| Confianza declarada | Intentos | Aciertos reales |', '|---|---|---|'];
  const attempts = summaries.flatMap((s) => s.results.flatMap((r) => r.attempts));
  for (const [lo, hi] of buckets) {
    const inBucket = attempts.filter((a) => a.confidence >= lo && a.confidence < hi);
    const hit = inBucket.filter((a) => a.correct).length;
    lines.push(
      `| ${(lo * 100).toFixed(0)}–${Math.min(100, hi * 100).toFixed(0)} % | ${inBucket.length} | ${inBucket.length ? ((100 * hit) / inBucket.length).toFixed(1) : '–'} % |`,
    );
  }
  return lines.join('\n');
}

function main() {
  const t0 = performance.now();
  const catalog = compileCatalog(loadCatalogFile(`${ROOT}data/catalog/catalog.json.gz`));
  const compileMs = performance.now() - t0;
  const fresh = () => new Engine(compileCatalog(loadCatalogFile(`${ROOT}data/catalog/catalog.json.gz`)));
  const engine = new Engine(catalog);
  const random = new RandomQuestionEngine(catalog);
  random.rng = seededRandom(99);
  const fixed = new FixedQuestionnaireEngine(catalog);
  void fresh;

  const scenarios: Scenario[] = [
    { name: 'Normal · ganancia de información', description: 'Motor real', mode: 'normal', engine, games: GAMES },
    { name: 'Normal · preguntas al azar', description: 'Misma inferencia, pregunta aleatoria', mode: 'normal', engine: random, games: Math.ceil(GAMES / 2) },
    { name: 'Normal · cuestionario fijo', description: 'Misma inferencia, orden fijo', mode: 'normal', engine: fixed, games: Math.ceil(GAMES / 2) },
    {
      name: 'Normal · jugador muy despistado',
      description: '12 % de respuestas erróneas',
      mode: 'normal',
      engine,
      games: Math.ceil(GAMES / 2),
      profile: { mistakeRate: 0.12, sureRate: 0.6 },
    },
    { name: 'Difícil · ganancia de información', description: 'Catálogo completo, prior casi plano', mode: 'hard', engine, games: Math.ceil(GAMES / 2) },
    { name: 'Reto 20 · ganancia de información', description: '20 preguntas y 3 intentos', mode: 'challenge', engine, games: Math.ceil(GAMES / 2) },
  ];

  const summaries: Summary[] = [];
  for (const s of ONLY ? scenarios.slice(0, ONLY) : scenarios) {
    const t = performance.now();
    const sum = run(s);
    summaries.push(sum);
    console.log(`${row(sum)}   (${((performance.now() - t) / 1000).toFixed(1)} s)`);
  }

  if (ONLY) return;
  const header = '| Escenario | Partidas | Acierto | Acierto en ≤ 20 preguntas | Media de preguntas (aciertos) | Mediana | P90 | Intentos por acierto | ms por turno |\n|---|---|---|---|---|---|---|---|---|';
  const md = `# Benchmark del motor

Generado con \`npm run bench\` el ${new Date().toISOString().slice(0, 10)} sobre el catálogo semilla
(${catalog.songs.length.toLocaleString('es-ES')} canciones; modo normal y Reto 20: ${catalog.modes.normal.pool.length.toLocaleString('es-ES')}).
Compilación del catálogo en memoria: ${(compileMs / 1000).toFixed(1)} s.

## Qué mide

Cada partida elige una canción objetivo al azar según el prior del modo, así que en modo normal salen más
los éxitos. Un **jugador simulado** responde a las preguntas del motor:

- Donde el catálogo tiene el dato, la respuesta «verdadera» se muestrea de ese dato.
- Donde no lo tiene, el jugador conoce un valor oculto que el motor no sabe, como pasa con un jugador real.
- Contesta «No lo sé» con la tasa propia de cada pregunta, usa «Probablemente» un 20 % de las veces y se
  equivoca un 4 % (un 12 % en el escenario «muy despistado»).

Las dos líneas base usan **la misma inferencia bayesiana y la misma política de intento**. Solo cambia cómo se
elige la siguiente pregunta, así que la diferencia mide el valor de elegir por ganancia de información.

> Limitación honesta: el jugador simulado responde según los mismos datos que usa el motor, así que esto mide la
> eficiencia de la estrategia, no la precisión de los datos frente a personas reales. Con jugadores reales
> pesan además los huecos y errores del catálogo, y el aprendizaje los va corrigiendo.

## Resultados

${header}
${summaries.map((s) => `| ${row(s)} |`).join('\n')}

## Calibración de la confianza

El porcentaje que muestra la app en cada intento es el posterior de la canción propuesta, calibrado con un
escalado de Platt (\`CONFIDENCE_CALIBRATION\` en \`engine.ts\`). Si está bien calibrado, los intentos al 90 %
aciertan cerca del 90 % de las veces. Datos de las partidas con ganancia de información de la tabla anterior:

${calibration(summaries.filter((s) => s.scenario.engine === engine))}
`;
  writeFileSync(`${ROOT}docs/BENCHMARK.md`, md);
  console.log('\n✓ docs/BENCHMARK.md');
}

main();

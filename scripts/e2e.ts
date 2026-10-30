/**
 * Prueba de extremo a extremo en un navegador real (opcional, no forma parte de `npm test`).
 *
 * Requiere Playwright con Chromium:  npm i -D playwright && npx playwright install chromium
 * Con el servidor en marcha (npm run build && npm start):
 *
 *   npm run e2e                       → capturas en test-results/e2e/
 *   BASE_URL=http://localhost:5173 npm run e2e
 *
 * Un jugador simulado (el mismo del benchmark) "piensa" en una canción y responde
 * en la interfaz: se comprueba que la IA la acierta en escritorio y en móvil, y
 * que el Reto 20 termina en derrota con búsqueda y panel de aprendizaje.
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Engine, SimulatedPlayer, compileCatalog, loadCatalogFile, seededRandom } from '../packages/engine/src/index';

type Page = import('playwright').Page;
const { chromium } = createRequire(import.meta.url)('playwright') as typeof import('playwright');

const root = fileURLToPath(new URL('../', import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';
const OUT = `${root}test-results/e2e`;
mkdirSync(OUT, { recursive: true });

const catalog = compileCatalog(loadCatalogFile(`${root}data/catalog/catalog.json.gz`));
const engine = new Engine(catalog);
let failures = 0;

async function waitForTurn(page: Page): Promise<'question' | 'guess' | 'lost'> {
  const card = page.locator('.qcard[data-question-id]');
  const guess = page.locator('.songcard');
  const lost = page.locator('.end--lost');
  await Promise.race([card, guess, lost].map((l) => l.waitFor({ timeout: 15_000 }).catch(() => undefined)));
  if (await lost.isVisible().catch(() => false)) return 'lost';
  if (await guess.isVisible().catch(() => false)) return 'guess';
  return 'question';
}

async function nextQuestion(page: Page, previous: string): Promise<void> {
  await page
    .waitForFunction(
      (prev) =>
        document.querySelector('.qcard[data-question-id]')?.getAttribute('data-question-id') !== prev ||
        !!document.querySelector('.songcard') ||
        !!document.querySelector('.end--lost'),
      previous,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
}

/** La IA debe acertar la canción en la que piensa el jugador simulado. */
async function playToWin(page: Page, title: string, artist: string, name: string): Promise<void> {
  const target = catalog.songs.findIndex((s) => s.title === title && s.credit.includes(artist));
  const player = new SimulatedPlayer(engine, target, seededRandom(21), { mistakeRate: 0, sureRate: 0.85 });
  await page.goto(BASE_URL);
  await page.screenshot({ path: `${OUT}/${name}-inicio.png`, fullPage: true });
  await page.getByRole('button', { name: 'Empezar' }).click();
  for (let turn = 0; turn < 80; turn++) {
    const kind = await waitForTurn(page);
    if (kind === 'lost') break;
    if (kind === 'guess') {
      await page.waitForTimeout(1600); // redoble y revelación
      const guessed = await page
        .locator('.songcard__title')
        .textContent({ timeout: 10_000 })
        .catch(async (err) => {
          await page.screenshot({ path: `${OUT}/${name}-fallo.png`, fullPage: true });
          throw err;
        });
      const correct = guessed === catalog.songs[target].title;
      if (correct) await page.screenshot({ path: `${OUT}/${name}-intento.png`, fullPage: true });
      await page.getByRole('button', { name: correct ? '¡Sí, es esa!' : 'No, no es esa' }).click();
      // La tarjeta del intento rechazado sigue visible durante su animación de salida
      if (!correct) await page.locator('.songcard').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
      if (correct) {
        await page.locator('.end--won').waitFor();
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${OUT}/${name}-victoria.png`, fullPage: true });
        console.log(`✓ ${name}: «${title}» adivinada tras ${turn} turnos`);
        return;
      }
      continue;
    }
    const qid = (await page.locator('.qcard[data-question-id]').getAttribute('data-question-id'))!;
    if (turn === 3) await page.screenshot({ path: `${OUT}/${name}-pregunta.png`, fullPage: true });
    await page.locator(`.answer--${player.answer(qid)}`).click();
    await nextQuestion(page, qid);
  }
  failures++;
  console.log(`✗ ${name}: la IA no adivinó «${title}»`);
}

/** Reto 20 con respuestas evasivas: la IA pierde y el jugador revela y enseña la canción. */
async function challengeDefeat(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.getByRole('radio', { name: /Reto 20/ }).click();
  await page.getByRole('button', { name: 'Empezar' }).click();
  for (let turn = 0; turn < 40; turn++) {
    const kind = await waitForTurn(page);
    if (kind === 'lost') break;
    if (kind === 'guess') {
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: 'No, no es esa' }).click();
      await page.locator('.songcard').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
      continue;
    }
    const qid = (await page.locator('.qcard[data-question-id]').getAttribute('data-question-id'))!;
    await page.locator(['.answer--unknown', '.answer--probably', '.answer--probably_not'][turn % 3]).click();
    await nextQuestion(page, qid);
  }
  await page.getByLabel('Buscar canción').fill('vivir mi vida');
  await page.locator('.search__results button').first().click();
  await page.locator('.teachme .chipbtn').first().click();
  await page.getByRole('button', { name: 'Enseñar' }).click();
  const thanks = await page.locator('.thanks').textContent({ timeout: 10_000 }).catch(() => null);
  await page.screenshot({ path: `${OUT}/reto-derrota.png`, fullPage: true });
  if (thanks) console.log('✓ reto: derrota, revelación y aprendizaje');
  else {
    failures++;
    console.log('✗ reto: no se completó el flujo de aprendizaje');
  }
}

const browser = await chromium.launch();
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  desktop.on('pageerror', (e) => {
    failures++;
    console.log(`✗ error de página: ${e.message}`);
  });
  await playToWin(desktop, 'Rolling In The Deep', 'Adele', 'escritorio');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await playToWin(mobile, 'La Bicicleta', 'Carlos Vives', 'movil');
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) {
    failures++;
    console.log(`✗ móvil: desbordamiento horizontal de ${overflow}px`);
  }
  await challengeDefeat(await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} fallo(s). Capturas en ${OUT}` : `\nTodo correcto. Capturas en ${OUT}`);
process.exit(failures ? 1 : 0);

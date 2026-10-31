// Playwright Chromium smoke test + screenshots. Run: npm run test:e2e
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const shots = path.join(root, 'screenshots');
mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const server = await createServer({ root, logLevel: 'error' });
await server.listen();
const url = `http://127.0.0.1:${server.config.server.port}/`;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));

const waitFor = (fn, timeout = 15000) => page.waitForFunction(fn, null, { timeout });
const pose = () => page.evaluate(() => ({ ...window.__pen.pose(), tipX: window.__pen.tipWorldX(), index: window.__pen.mech.rotorIndex }));
const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });

try {
  await page.goto(url);
  await waitFor(() => window.__penFrames > 5);
  check('WebGL started', await page.evaluate(() => window.__pen.hasWebGL()));
  check('auto tour runs at load', (await page.evaluate(() => window.__pen.mode)) === 'tour');

  // first interaction stops the tour; Reset restores the default camera
  await page.click('#btn-reset');
  check('interaction stops the tour', (await page.evaluate(() => window.__pen.mode)) === 'user');
  await page.waitForTimeout(1400);
  await shot('01-assembled');

  await page.click('[data-view=cutaway]');
  await page.waitForTimeout(1400);
  await shot('02-cutaway');

  // ---- click 1: tip extends and latches
  let p = await pose();
  check('starts retracted', p.phase === 'RETRACTED' && p.tipExtensionMm === 0 && p.index === 0);
  // record phases inside the page so the short cam band cannot be missed by polling
  await page.evaluate(() => {
    window.__phases = new Set();
    window.__phaseTimer = setInterval(() => window.__phases.add(window.__pen.pose().phase), 4);
  });
  await page.click('#btn-click');
  let maxTip = 0, tipConsistent = true;
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(40);
    const q = await pose();
    maxTip = Math.max(maxTip, q.tipExtensionMm);
    if (q.tipExtensionMm > 0 && !near(q.tipX, -62 - q.tipExtensionMm)) tipConsistent = false;
    if (!(await page.evaluate(() => window.__pen.anim))) break;
  }
  p = await pose();
  const phases = await page.evaluate(() => { clearInterval(window.__phaseTimer); return [...window.__phases]; });
  check('click 1 passes through press, full press and release (cam band is checked via the scrubber)',
    ['PRESS_1', 'FULL_PRESS_1', 'RELEASE'].every((x) => phases.includes(x)), phases.join(','));
  check('tip extends during click 1', maxTip > 6, `peak ${maxTip.toFixed(2)} mm`);
  check('latched and extended after click 1', p.phase === 'EXTENDED_LATCHED' && p.index === 1 && near(p.tipExtensionMm, 4.5), `${p.phase}, tip ${p.tipExtensionMm.toFixed(2)} mm`);
  check('3D tip position matches displayed tip extension', tipConsistent && near(p.tipX, -62 - p.tipExtensionMm));
  check('panel shows the model value', (await page.textContent('#r-tip')).trim() === `${p.tipExtensionMm.toFixed(2)} mm`);
  await page.click('[data-view=mechanism]');
  await page.waitForTimeout(1400);
  await shot('03-extended-mechanism');
  await page.click('[data-view=cutaway]');
  await page.waitForTimeout(1300);
  await shot('04-extended');

  // ---- click 2 via keyboard: retracts
  await page.keyboard.press('Space');
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(40);
    if (!(await page.evaluate(() => window.__pen.anim))) break;
  }
  p = await pose();
  check('click 2 (Space) retracts the tip', p.phase === 'RETRACTED' && p.index === 0 && p.tipExtensionMm === 0, `${p.phase}`);

  // ---- cam transition via the scrubber (deterministic)
  await page.evaluate(() => { const e = document.getElementById('rng-travel'); e.value = 750; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(500); // let a frame repaint the panel
  p = await pose();
  check('scrubber into the cam band shows CAM_TRANSITION_1 at 22.5 deg',
    p.phase === 'CAM_TRANSITION_1' && near(p.camAngleDeg, 22.5, 1e-6) && (await page.textContent('#r-cam')).trim() === '22.5°', p.phase);
  await shot('06a-cam-transition');
  await page.evaluate(() => { const e = document.getElementById('rng-travel'); e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); });

  // ---- scrubber partial press does not toggle
  await page.evaluate(() => { const e = document.getElementById('rng-travel'); e.value = 500; e.dispatchEvent(new Event('input', { bubbles: true })); });
  p = await pose();
  check('scrubber drives the model', near(p.buttonTravelMm, 4.5) && p.index === 0);
  await page.evaluate(() => { const e = document.getElementById('rng-travel'); e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); });
  p = await pose();
  check('partial press via scrubber does not toggle latch', p.index === 0 && p.tipExtensionMm === 0);

  // ---- two-click cycle button returns to retracted
  await page.click('#btn-cycle');
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(40);
    if (!(await page.evaluate(() => window.__pen.anim))) break;
  }
  p = await pose();
  check('two-click cycle ends retracted', p.index === 0 && p.tipExtensionMm === 0);

  // ---- exploded view
  const before = await page.evaluate(() => window.__pen.view.explode);
  await page.evaluate(() => { const e = document.getElementById('rng-explode'); e.value = 1000; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const after = await page.evaluate(() => window.__pen.view.explode);
  check('exploded slider works', before === 0 && after === 1);
  await page.click('[data-view=exploded]');
  await page.waitForTimeout(1400);
  await shot('05-exploded');
  await page.keyboard.press('e');
  await page.waitForTimeout(1100);
  check('E toggles exploded view off', (await page.evaluate(() => window.__pen.view.explode)) === 0);

  // ---- isolate + side view + labels
  await page.click('[data-iso=cam]');
  await page.click('[data-view=mechanism]');
  await page.waitForTimeout(1300);
  await shot('06-isolate-cam');
  await page.click('[data-iso=none]');
  await page.click('[data-view=side]');
  await page.waitForTimeout(1300);
  await shot('07-side');
  await page.uncheck('#chk-labels');
  check('labels toggle hides labels', !(await page.isVisible('#labels')));
  await page.check('#chk-labels');

  // ---- idle resume of the tour
  await page.click('[data-view=assembled]');
  await page.evaluate(() => window.__pen.forceIdle(25));
  await page.waitForTimeout(400);
  check('tour resumes after inactivity', (await page.evaluate(() => window.__pen.mode)) === 'tour');
  await page.waitForTimeout(600);
  await page.keyboard.press('r');
  check('R resets and stops the tour', (await page.evaluate(() => window.__pen.mode)) === 'user');

  // ---- narrow layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow at 390 px', overflow <= 1, `overflow ${overflow}px`);
  await shot('08-narrow');

  check('no console errors or page errors', problems.length === 0, problems.slice(0, 3).join(' | '));
} catch (err) {
  check('e2e run completed', false, err.message);
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed. Screenshots: ${shots}`);
process.exit(failed ? 1 : 0);

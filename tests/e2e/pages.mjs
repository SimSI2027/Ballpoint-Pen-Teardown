// Production build under the GitHub Pages base path: loads in Chromium with no failed requests,
// WebGL running, and the live mechanism panel populated. Requires `npm run build` first.
import { preview } from 'vite';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
if (!existsSync(path.join(root, 'dist', 'index.html'))) { console.error('FAIL  dist/ missing: run npm run build first'); process.exit(1); }
mkdirSync(path.join(root, 'screenshots'), { recursive: true });

const server = await preview({ root, logLevel: 'error', preview: { port: 4180, strictPort: false } });
const port = server.httpServer.address().port;
const base = `http://127.0.0.1:${port}/Ballpoint-Pen-Teardown/`;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
let failed = false;
const check = (name, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${d ? '  - ' + d : ''}`); if (!ok) failed = true; };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const bad = [];
  page.on('requestfailed', (r) => bad.push('failed ' + r.url()));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => bad.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') bad.push('console ' + m.text()); });
  await page.goto(base);
  await page.waitForFunction(() => window.__penFrames > 5, null, { timeout: 60000 }).catch((e) => { console.log('problems:', bad.join(' | ')); throw e; });
  check('base path page loads and animates', true);
  check('WebGL started', await page.evaluate(() => window.__pen.hasWebGL()));
  check('no failed or 4xx requests', bad.length === 0, bad.join(' | '));
  check('panel populated from the model', (await page.textContent('#r-phase')).trim().length > 0);
  await page.screenshot({ path: path.join(root, 'screenshots', '09-pages-base-path.png') });
} catch (e) { console.error(e); failed = true; }
await browser.close(); await server.close();
process.exit(failed ? 1 : 0);

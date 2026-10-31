// Deterministic video export: renders every film frame from an explicit frame index in Playwright
// Chromium and encodes 1920x1080 / 60 fps H.264 (yuv420p, faststart, silent) with FFmpeg.
// Also writes a contact sheet extracted from the finished MP4.
//
//   npm run video                 full export -> output/ballpoint-pen-teardown-v<version>.mp4 + contact sheet
//   npm run video -- --disk       render numbered PNGs in output/.frames-tmp instead of piping
//   npm run video -- --limit 120  render only the first N frames (smoke test; writes output/_smoke.mp4)
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'output');
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const args = process.argv.slice(2);
const useDisk = args.includes('--disk');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 0;
const smoke = limit > 0;
const mp4Path = path.join(outDir, smoke ? '_smoke.mp4' : `ballpoint-pen-teardown-v${version}.mp4`);
const sheetPath = path.join(outDir, 'ballpoint-pen-contact-sheet.jpg');
const framesDir = path.join(outDir, '.frames-tmp');
const sheetWork = path.join(outDir, '.sheet-tmp');

const fail = (msg) => { console.error(`\nERROR: ${msg}`); process.exit(1); };

// ---------------------------------------------------------------- FFmpeg discovery
function supportsX264(exe) {
  const r = spawnSync(exe, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return r.status === 0 && /\blibx264\b/.test(r.stdout || '');
}
function findPlaywrightFfmpeg() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright'),
    path.join(os.homedir(), '.cache', 'ms-playwright'), path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')].filter(Boolean);
  for (const b of bases) {
    if (!existsSync(b)) continue;
    for (const d of readdirSync(b).filter((n) => n.startsWith('ffmpeg'))) {
      for (const n of ['ffmpeg-win64.exe', 'ffmpeg-linux', 'ffmpeg-mac']) {
        const p = path.join(b, d, n);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}
function pickFfmpeg() {
  const sys = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (sys.status === 0 && supportsX264('ffmpeg')) return { exe: 'ffmpeg', source: 'system' };
  const pw = findPlaywrightFfmpeg();
  if (pw && supportsX264(pw)) return { exe: pw, source: 'playwright' };
  return null;
}
const ff = pickFfmpeg();
if (!ff) {
  fail('No FFmpeg with the libx264 encoder was found (system or Playwright). '
    + 'Install one with:  winget install --id Gyan.FFmpeg -e   (then reopen this window)');
}
console.log(`FFmpeg: ${ff.source} (${ff.exe})`);

// ---------------------------------------------------------------- render + encode
mkdirSync(outDir, { recursive: true });
rmSync(framesDir, { recursive: true, force: true });
rmSync(sheetWork, { recursive: true, force: true });

const server = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5174, strictPort: false } });
await server.listen();
const addr = server.httpServer.address();
const url = `http://127.0.0.1:${addr.port}/film.html`;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
let encoder = null, encoderDone = null, ok = false;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__filmReady === true, null, { timeout: 60000 });
  const meta = await page.evaluate(() => ({ frames: window.__film.frames, fps: window.__film.fps }));
  const total = smoke ? Math.min(limit, meta.frames) : meta.frames;
  console.log(`Rendering ${total} frames at ${meta.fps} fps -> ${path.relative(root, mp4Path)}${useDisk ? ' (disk frames)' : ' (piped)'}`);

  const outArgs = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(meta.fps),
    '-movflags', '+faststart', '-an', mp4Path];
  const inArgs = useDisk
    ? ['-framerate', String(meta.fps), '-i', path.join(framesDir, 'f%05d.png')]
    : ['-f', 'image2pipe', '-framerate', String(meta.fps), '-c:v', 'png', '-i', '-'];
  if (useDisk) mkdirSync(framesDir, { recursive: true });

  const startEncoder = () => {
    encoder = spawn(ff.exe, ['-hide_banner', '-loglevel', 'error', '-y', ...inArgs, ...outArgs], { stdio: ['pipe', 'inherit', 'inherit'] });
    encoderDone = new Promise((resolve, reject) => {
      encoder.on('error', reject);
      encoder.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
    });
    encoderDone.catch(() => {});
    encoder.stdin.on('error', () => {});
  };
  if (!useDisk) startEncoder();

  const t0 = Date.now();
  for (let k = 0; k < total; k++) {
    await page.evaluate((i) => window.__film.renderFrame(i), k);
    const png = await page.screenshot({ type: 'png' });
    if (useDisk) {
      writeFileSync(path.join(framesDir, `f${String(k).padStart(5, '0')}.png`), png);
    } else {
      if (encoder.exitCode !== null) throw new Error('ffmpeg stopped early');
      if (!encoder.stdin.write(png)) await new Promise((r) => encoder.stdin.once('drain', r));
    }
    if (k % 60 === 0 || k === total - 1) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  frame ${k + 1}/${total}  ${el.toFixed(0)}s elapsed, ~${((el / (k + 1)) * (total - k - 1)).toFixed(0)}s left`);
    }
  }
  if (problems.length) throw new Error('page problems: ' + problems.join(' | '));
  if (useDisk) startEncoder();
  if (!useDisk) encoder.stdin.end();
  await encoderDone;
  if (!existsSync(mp4Path) || statSync(mp4Path).size === 0) throw new Error('MP4 missing or empty');
  console.log(`MP4: ${mp4Path} (${(statSync(mp4Path).size / 1e6).toFixed(2)} MB)`);

  // ---------------------------------------------------------------- contact sheet from the MP4
  if (!smoke) {
    mkdirSync(sheetWork, { recursive: true });
    const times = [1, 4, 5.8, 8.0, 8.8, 11, 14, 16.8, 19, 22, 24.5, 28.8];
    const cells = [];
    for (const [i, t] of times.entries()) {
      const f = path.join(sheetWork, `c${String(i).padStart(2, '0')}.png`);
      const r = spawnSync(ff.exe, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', mp4Path, '-frames:v', '1', f], { encoding: 'utf8' });
      if (r.status !== 0 || !existsSync(f)) throw new Error(`could not extract frame at ${t}s: ${r.stderr}`);
      cells.push({ t, data: readFileSync(f).toString('base64') });
    }
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#23262b;font:16px system-ui,sans-serif;color:#eee;width:1920px}
      h1{margin:0;padding:18px 24px 6px;font-size:26px;font-weight:650}
      p{margin:0;padding:0 24px 14px;color:#9aa0a8;font-size:14px}
      .g{display:grid;grid-template-columns:repeat(4,456px);gap:12px;padding:0 24px 24px}
      figure{margin:0}img{width:456px;height:256.5px;display:block;border-radius:6px}
      figcaption{padding:4px 2px;font-variant-numeric:tabular-nums;font-size:14px;color:#c8ccd2}</style>
      <h1>Click Pen Teardown v${version} - contact sheet</h1><p>Frames extracted from the exported MP4 (generic pen, placeholder dimensions).</p>
      <div class="g">${cells.map((c) => `<figure><img src="data:image/png;base64,${c.data}"><figcaption>t = ${c.t.toFixed(1)} s</figcaption></figure>`).join('')}</div>`;
    const sp = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
    await sp.setContent(html);
    await sp.screenshot({ path: sheetPath, type: 'jpeg', quality: 90, fullPage: true });
    await sp.close();
    console.log(`Contact sheet: ${sheetPath} (${(statSync(sheetPath).size / 1e3).toFixed(0)} KB)`);
    rmSync(sheetWork, { recursive: true, force: true });
  }
  ok = true;
} catch (err) {
  console.error('\nExport failed:', err && err.message ? err.message : err);
  if (useDisk) console.error(`Temporary frames kept for diagnosis in ${framesDir}`);
  try { encoder && encoder.kill(); } catch { /* ignore */ }
} finally {
  await browser.close();
  await server.close();
}
if (!ok) process.exit(1);
if (useDisk) rmSync(framesDir, { recursive: true, force: true });
console.log('Done.');

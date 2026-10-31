import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILM, FILM_FRAMES, KEYS, CLICKS, BEATS, filmFrame, filmU, filmView } from '../src/film/timeline.js';
import { VIEW_KEYS } from '../src/view/views.js';
import { pose, createInitialState, step } from '../src/mechanism/mechanism.js';

test('film is 1920x1080 at 60 fps and 24-30 s long', () => {
  assert.equal(FILM.width, 1920); assert.equal(FILM.height, 1080); assert.equal(FILM.fps, 60);
  assert.ok(FILM.duration >= 24 && FILM.duration <= 30);
  assert.equal(FILM_FRAMES, FILM.duration * 60);
  assert.equal(KEYS[KEYS.length - 1].t, FILM.duration);
});

test('same frame index always yields the same state, camera and presentation (any access order)', () => {
  const ks = [0, 400, 600, 1000, 1739, 20, 600, 5];
  const first = ks.map((k) => JSON.stringify(filmFrame(k)));
  const again = [...ks].reverse().map((k) => JSON.stringify(filmFrame(k))).reverse();
  assert.deepEqual(again, first);
});

test('film mechanism state equals a fresh replay of step() over the same input', () => {
  let s = createInitialState();
  for (let k = 1; k <= 1000; k++) s = step(s, filmU(k / 60));
  assert.deepEqual(filmFrame(1000).mech, s);
  assert.deepEqual(filmFrame(1000).pose, pose(s));
});

test('film passes through every mechanism phase and ends retracted', () => {
  const seen = new Set();
  let maxTip = 0;
  for (let k = 0; k <= FILM_FRAMES; k++) { const f = filmFrame(k); seen.add(f.pose.phase); maxTip = Math.max(maxTip, f.pose.tipExtensionMm); }
  for (const ph of ['RETRACTED', 'PRESS_1', 'CAM_TRANSITION_1', 'FULL_PRESS_1', 'RELEASE', 'EXTENDED_LATCHED', 'PRESS_2', 'CAM_TRANSITION_2', 'FULL_PRESS_2']) {
    assert.ok(seen.has(ph), `missing phase ${ph}`);
  }
  assert.ok(maxTip > 4.4);
  const end = filmFrame(FILM_FRAMES);
  assert.equal(end.pose.phase, 'RETRACTED');
  assert.equal(end.pose.tipExtensionMm, 0);
  assert.equal(end.view.explode, 0);
  // extended + latched is held between the two clicks, tip shown at its latched extension
  const mid = filmFrame(Math.round(14.5 * 60));
  assert.equal(mid.pose.phase, 'EXTENDED_LATCHED');
  assert.ok(Math.abs(mid.pose.tipExtensionMm - 4.5) < 1e-9);
});

test('camera never jumps between adjacent frames and stays finite', () => {
  let prev = filmView(0);
  for (let k = 1; k <= FILM_FRAMES; k++) {
    const v = filmView(k / 60);
    for (const key of VIEW_KEYS) {
      assert.ok(Number.isFinite(v[key]));
      assert.ok(Math.abs(v[key] - prev[key]) < (key === "dist" ? 0.04 * v.dist : 4), `jump in ${key} at frame ${k}`);
    }
    prev = v;
  }
});

test('beats are ordered and covered by the clicks', () => {
  for (let i = 1; i < BEATS.length; i++) assert.ok(BEATS[i].t0 > BEATS[i - 1].t0);
  assert.equal(BEATS.length, 15);
  for (const c of CLICKS) assert.ok(c.start + c.dur <= FILM.duration);
  assert.equal(filmU(0), 0);
});

test('production build uses the Pages subpath and no root-absolute asset URLs', () => {
  const cfg = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');
  assert.match(cfg, /\/Ballpoint-Pen-Teardown\//);
  assert.match(cfg, /mode === 'production'/);
});

test('caption beats match the model phases they describe', () => {
  const at = (t) => filmFrame(Math.round(t * 60));
  assert.match(at(7.7).pose.phase, /^PRESS_1$/);          // cam caption starts just before the transition
  assert.equal(at(8.0).pose.phase, 'CAM_TRANSITION_1');
  assert.equal(at(8.5).pose.phase, 'FULL_PRESS_1');      // "spring most compressed" beat
  assert.equal(at(8.5).beat.n, 6);
  assert.equal(at(11).pose.phase, 'RELEASE');
  assert.equal(at(11).beat.n, 7);
  assert.equal(at(13).pose.phase, 'EXTENDED_LATCHED');
  assert.equal(at(13).beat.n, 8);
  assert.equal(at(16.8).pose.phase, 'CAM_TRANSITION_2');
  assert.equal(at(16.8).beat.n, 10);
  assert.equal(at(19).pose.phase, 'RELEASE');
  assert.equal(at(21).pose.phase, 'RETRACTED');
});

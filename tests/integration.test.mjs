import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_PARAMS as P } from '../src/mechanism/params.js';
import { createInitialState, step, pose } from '../src/mechanism/mechanism.js';
import { clickU } from '../src/mechanism/clickProfile.js';
import { readouts, formatReadouts } from '../src/mechanism/readouts.js';
import { tourAt, TOUR_END, autoHighlight } from '../src/tour.js';
import { VIEWS, cameraFromView, lerpView } from '../src/view/views.js';
import { buildPen, LAYOUT as L } from '../src/view/pen.js';

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const PITCH = 360 / P.camTeeth;

test('clickU stays within [0,1], starts and ends at 0, peaks at 1, ignores non-finite', () => {
  assert.equal(clickU(0), 0);
  assert.equal(clickU(1), 0);
  assert.equal(clickU(NaN), 0);
  assert.equal(clickU(Infinity), 0);
  assert.equal(clickU(-3), 0);
  assert.equal(clickU(0.47), 1);
  for (let i = 0; i <= 1000; i++) {
    const u = clickU(i / 1000);
    assert.ok(u >= 0 && u <= 1);
  }
});

test('readouts are finite, formatted, and reject non-finite poses', () => {
  const p = pose(step(createInitialState(), 0.6));
  const r = readouts(p);
  const f = formatReadouts(r);
  assert.match(f.button, /^5\.40 mm$/);
  assert.equal(f.latch, 'RETRACTED');
  assert.throws(() => readouts({ ...p, springForceN: NaN }), RangeError);
  assert.throws(() => readouts({ ...p, camAngleDeg: undefined }), RangeError);
});

test('the automated tour is deterministic and runs the full two-click cycle', () => {
  assert.deepEqual(tourAt(12.34), tourAt(12.34));
  assert.equal(tourAt(TOUR_END + 1).done, true);
  let s = createInitialState();
  const seen = new Set();
  let sawExtended = false;
  for (let t = 0; t <= TOUR_END; t += 1 / 60) {
    const tt = tourAt(t);
    assert.ok(tt.u >= 0 && tt.u <= 1);
    for (const v of Object.values(tt.view)) assert.ok(Number.isFinite(v));
    s = step(s, tt.u);
    const p = pose(s);
    seen.add(p.phase);
    if (p.extended && p.latched) sawExtended = true;
  }
  assert.ok(sawExtended, 'pen latches extended during the tour');
  for (const ph of ['RETRACTED', 'CAM_TRANSITION_1', 'EXTENDED_LATCHED', 'CAM_TRANSITION_2', 'RELEASE']) {
    assert.ok(seen.has(ph), `tour passes through ${ph}`);
  }
  assert.equal(s.rotorIndex, 0, 'tour ends retracted');
  assert.equal(pose(s).tipExtensionMm, 0);
  assert.equal(autoHighlight('RETRACTED'), null);
});

test('camera helper is finite for every preset at wide and narrow aspect', () => {
  for (const v of Object.values(VIEWS)) {
    for (const a of [0.4, 1, 1.8]) {
      const c = cameraFromView(v, a);
      for (const x of [...c.position, ...c.target]) assert.ok(Number.isFinite(x));
    }
  }
  const mid = lerpView(VIEWS.assembled, VIEWS.exploded, 0.5);
  near(mid.explode, 0.5);
});

// ---- the built scene must agree with the pose

function sweep() {
  const out = [];
  let s = createInitialState();
  const us = [];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i <= 100; i++) us.push(i / 100);
    for (let i = 100; i >= 0; i--) us.push(i / 100);
  }
  for (const u of us) { s = step(s, u); out.push(pose(s)); }
  return out;
}

test('3D parts sit exactly where the pose says (tip, button, cartridge, rotor, spring)', () => {
  const pen = buildPen();
  for (const p of sweep()) {
    assert.equal(pen.update(p, { explode: 0 }), true);
    pen.root.updateMatrixWorld(true);
    near(pen.tipWorldX(), L.tipX0 - p.cartridgeTravelMm, 1e-9, 'tip vs cartridge');
    if (p.tipExtensionMm > 0) near(pen.tipWorldX(), L.noseExitX - p.tipExtensionMm, 1e-9, 'tip vs readout');
    else assert.ok(pen.tipWorldX() >= L.noseExitX - 1e-9, 'hidden tip is inside the nose');
    near(pen.parts.cartridge.position.x, -p.cartridgeTravelMm);
    near(pen.parts.plunger.position.x, -p.buttonTravelMm);
    near(pen.parts.rotor.position.x, -p.cartridgeTravelMm);
    near(pen.parts.rotor.rotation.x, (p.camAngleDeg * Math.PI) / 180);
    // spring length in the scene = free length scaled by the coil
    const coil = pen.parts.spring.children[0];
    near(coil.scale.x * P.springFreeLengthMm, p.springLengthMm, 1e-9, 'spring length');
    // spring is seated at the nose washer and ends on the cartridge collar
    near(pen.parts.spring.position.x + p.springLengthMm, L.collarX0 - p.cartridgeTravelMm, 1e-9, 'spring meets collar');
  }
});

test('no part passes through another along the click cycle (cam fins vs ribs, flange vs sleeve, collar vs seat)', () => {
  const pen = buildPen();
  const inArc = (a, c, half) => { const d = Math.abs((((a - c) % 360) + 540) % 360 - 180); return 180 - d <= half; };
  for (const p of sweep()) {
    pen.update(p, { explode: 0 });
    const finTop = pen.parts.rotor.position.x + L.rotorTop0;
    assert.ok(finTop <= L.sleeveX0 + 1e-9, 'fin never above the sleeve ring');
    for (let k = 0; k < P.camTeeth; k++) {
      const phi = p.camAngleDeg + k * PITCH;
      for (let j = 0; j < P.camTeeth; j++) {
        const lugMid = (j + 0.5) * PITCH;
        const overlap = inArc(phi, lugMid, L.lugHalfDeg + L.finHalfDeg);
        if (overlap) assert.ok(finTop <= L.lugBottomX + 1e-9, `fin ${k} over lug ${j} at cam ${p.camAngleDeg.toFixed(1)}: top ${finTop}`);
      }
    }
    assert.ok(pen.parts.plunger.position.x + L.flangeX0 >= L.sleeveX1 - 1e-9, 'flange clears the sleeve');
    assert.ok(L.collarX0 - p.cartridgeTravelMm > L.seatX + P.springSolidHeightMm - 1e-9, 'collar stays clear of the seat');
  }
});

test('rest poses: retracted fins sit under the ring, latched fins sit on the long ribs', () => {
  const pen = buildPen();
  let s = createInitialState();
  pen.update(pose(s));
  near(pen.parts.rotor.position.x + L.rotorTop0, L.sleeveX0);
  s = step(step(s, 1), 0);
  pen.update(pose(s));
  near(pen.parts.rotor.position.x + L.rotorTop0, L.lugBottomX);
  assert.ok(pen.tipWorldX() < L.noseExitX, 'latched tip protrudes from the nose');
});

test('explode only offsets parts; it does not change mechanism-derived relative travel', () => {
  const pen = buildPen();
  const p = pose(step(createInitialState(), 0.5));
  pen.update(p, { explode: 0 });
  const x0 = pen.parts.cartridge.position.x;
  pen.update(p, { explode: 1 });
  assert.notEqual(pen.parts.cartridge.position.x, x0);
  pen.update(p, { explode: 0 });
  near(pen.parts.cartridge.position.x, x0);
});

test('non-finite poses never reach the transforms', () => {
  const pen = buildPen();
  pen.update(pose(createInitialState()));
  const before = pen.parts.cartridge.position.x;
  assert.equal(pen.update({ ...pose(createInitialState()), cartridgeTravelMm: NaN }), false);
  assert.equal(pen.update({ ...pose(createInitialState()), springLengthMm: Infinity }), false);
  assert.equal(pen.parts.cartridge.position.x, before);
  for (const part of Object.values(pen.parts)) {
    assert.ok(Number.isFinite(part.position.x) && Number.isFinite(part.rotation.x));
  }
});

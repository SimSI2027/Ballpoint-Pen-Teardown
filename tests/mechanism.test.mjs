import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PARAM_DEFS, DEFAULT_PARAMS, validateParams } from '../src/mechanism/params.js';
import {
  PHASES, createInitialState, deriveGeometry, step, pose,
} from '../src/mechanism/mechanism.js';

const P = DEFAULT_PARAMS;
const G = deriveGeometry(P);
const EPS = 1e-9;

const near = (a, b, eps = EPS, msg = '') =>
  assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

/** Apply a sequence of u values. */
const drive = (s, seq) => seq.reduce((st, u) => step(st, u), s);
/** Inclusive linear ramp with exact endpoints. */
const ramp = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => (i === n ? b : a + ((b - a) * i) / n));
/** One full press-and-release cycle. */
const cycle = (n = 50) => [...ramp(0, 1, n), ...ramp(1, 0, n)];
const at = (u, from = createInitialState()) => step(from, u);

// ---------------------------------------------------------------- parameters

test('every parameter has units, provenance, status and confidence', () => {
  for (const [key, d] of Object.entries(PARAM_DEFS)) {
    assert.ok(Number.isFinite(d.value), `${key} value`);
    assert.equal(typeof d.unit, 'string', `${key} unit`);
    assert.ok(d.unit.length > 0, `${key} unit non-empty`);
    assert.match(d.provenance, /placeholder-estimate/, `${key} provenance`);
    assert.equal(d.status, 'placeholder', `${key} status`);
    assert.ok(['low', 'medium', 'high'].includes(d.confidence), `${key} confidence`);
    assert.ok(d.note.length > 0, `${key} note`);
  }
  assert.ok(Object.isFrozen(PARAM_DEFS) && Object.isFrozen(DEFAULT_PARAMS));
});

test('default parameters validate; inconsistent ones are rejected', () => {
  assert.doesNotThrow(() => validateParams(P));
  const bad = (patch) => assert.throws(() => validateParams({ ...P, ...patch }));
  bad({ engageTravelMm: P.releaseTravelMm });          // no hysteresis
  bad({ latchDropMm: P.releaseTravelMm + 0.1 });       // would make pose discontinuous
  bad({ engageTravelMm: P.buttonStrokeMm + 1 });
  bad({ tipInsetMm: P.latchDropMm });                  // latched tip would not protrude
  bad({ camTeeth: 1 });
  bad({ camTeeth: 3.5 });
  bad({ springRateNPerMm: 0 });
  bad({ springFreeLengthMm: 10 });                     // spring would go solid
  bad({ buttonStrokeMm: NaN });
  bad({ springRateNPerMm: undefined });
  assert.throws(() => validateParams(null), TypeError);
});

// ---------------------------------------------------------------- input validation

test('non-numeric input throws TypeError', () => {
  const s = createInitialState();
  for (const v of ['0.5', '', null, undefined, true, {}, [], [0.5], 10n, () => 0.5, Symbol('x')]) {
    assert.throws(() => step(s, v), TypeError, `input ${String(typeof v)}`);
  }
});

test('NaN, infinite, negative and over-range input throws RangeError and is not clamped', () => {
  const s = at(0.5);
  for (const v of [NaN, Infinity, -Infinity, -1e-12, -0.1, -1, 1 + 1e-12, 1.0000001, 2, 1e9]) {
    assert.throws(() => step(s, v), RangeError, `input ${v}`);
  }
  assert.deepEqual(s, at(0.5), 'failed call leaves state untouched');
});

test('boundaries 0 and 1 are accepted; -0 is normalised to +0', () => {
  assert.doesNotThrow(() => step(createInitialState(), 0));
  assert.doesNotThrow(() => step(createInitialState(), 1));
  const s = step(createInitialState(), -0);
  assert.ok(Object.is(s.u, 0));
});

test('invalid or inconsistent state is rejected by step and pose', () => {
  const ok = createInitialState();
  const bads = [
    null, 5, { ...ok, u: 2 }, { ...ok, u: NaN }, { ...ok, dir: 2 }, { ...ok, armed: 1 },
    { ...ok, rotorIndex: 2 }, { ...ok, rotorIndex: 0.5 },
    { ...ok, armed: true, u: 0 },                       // armed below release threshold
    { ...ok, armed: true, u: G.uRelease },
  ];
  for (const b of bads) {
    assert.throws(() => pose(b));
    assert.throws(() => step(b, 0.5));
  }
});

// ---------------------------------------------------------------- the states

test('retracted', () => {
  const s = createInitialState();
  const p = pose(s);
  assert.equal(p.phase, 'RETRACTED');
  assert.equal(p.buttonTravelMm, 0);
  assert.equal(p.cartridgeTravelMm, 0);
  assert.equal(p.tipExtensionMm, 0);
  assert.equal(p.camAngleDeg, 0);
  assert.equal(p.extended, false);
  assert.equal(p.latched, false);
  near(p.springCompressionMm, P.springPreCompressionMm);
  near(p.springForceN, P.springRateNPerMm * P.springPreCompressionMm);
});

test('partial press: pose follows the button, no toggle, returns to the identical state', () => {
  const s = at(0.5);
  const p = pose(s);
  assert.equal(p.phase, 'PRESS_1');
  near(p.buttonTravelMm, 4.5);
  near(p.cartridgeTravelMm, 4.5);
  near(p.tipExtensionMm, 4.5 - P.tipInsetMm);
  assert.equal(s.armed, false);
  assert.equal(s.rotorIndex, 0);

  const back = step(s, 0);
  assert.equal(back.rotorIndex, 0);
  assert.equal(pose(back).phase, 'RETRACTED');
  assert.equal(pose(back).tipExtensionMm, 0);
  assert.deepEqual(back, { ...createInitialState(), dir: -1 });
});

test('press into the cam band without engaging still does not toggle', () => {
  const justShort = G.uEngage - 1e-6;
  const s = drive(createInitialState(), [0.3, 0.75, justShort, 0.4, 0]);
  assert.equal(s.rotorIndex, 0);
  assert.equal(s.armed, false);
});

test('cam transition: angle rises monotonically from 0 to half a pitch', () => {
  let prev = -1;
  let s = createInitialState();
  for (const u of ramp(G.uRelease, G.uEngage, 40)) {
    s = step(s, u);
    const p = pose(s);
    assert.ok(p.camAngleDeg >= prev - EPS, 'monotonic');
    prev = p.camAngleDeg;
  }
  const mid = pose(at(0.75));
  assert.equal(mid.phase, 'CAM_TRANSITION_1');
  near(mid.camProgress, 0.5);
  near(mid.camAngleDeg, G.stepDeg / 2);
  near(pose(at(G.uRelease)).camAngleDeg, 0);
});

test('full press: armed, rotor still not committed, spring at maximum compression', () => {
  const s = at(1);
  const p = pose(s);
  assert.equal(s.armed, true);
  assert.equal(s.rotorIndex, 0);
  assert.equal(p.phase, 'FULL_PRESS_1');
  near(p.cartridgeTravelMm, P.buttonStrokeMm);
  near(p.springCompressionMm, P.springPreCompressionMm + P.buttonStrokeMm);
  near(p.camAngleDeg, G.stepDeg);
});

test('release after full press commits: extended and latched with the tip out', () => {
  const s = drive(createInitialState(), [1, 0.5]);
  assert.equal(s.rotorIndex, 1);
  assert.equal(s.armed, false);
  assert.equal(pose(s).phase, 'RELEASE');
  near(pose(s).cartridgeTravelMm, P.latchDropMm);

  const rest = step(s, 0);
  const p = pose(rest);
  assert.equal(p.phase, 'EXTENDED_LATCHED');
  assert.equal(p.extended, true);
  assert.equal(p.latched, true);
  near(p.cartridgeTravelMm, P.latchDropMm);
  near(p.tipExtensionMm, P.latchDropMm - P.tipInsetMm);
  near(p.plungerGapMm, P.latchDropMm);
  near(p.camAngleDeg, G.stepDeg);
  near(p.springCompressionMm, P.springPreCompressionMm + P.latchDropMm);
  // Peak overshoot is larger than the latched extension: the pen settles back.
  assert.ok(pose(at(1)).tipExtensionMm > p.tipExtensionMm);
});

test('second press from extended: tip holds until the button passes the latch, then retracts on release', () => {
  const ext = drive(createInitialState(), [1, 0]);
  const half = step(ext, 0.5); // button 4.5 mm < latch drop 6 mm
  assert.equal(pose(half).phase, 'PRESS_2');
  near(pose(half).cartridgeTravelMm, P.latchDropMm, EPS, 'cartridge holds');
  assert.equal(half.rotorIndex, 1);
  assert.equal(pose(half).latched, true);

  const cam = step(half, 0.75);
  assert.equal(pose(cam).phase, 'CAM_TRANSITION_2');
  near(pose(cam).camAngleDeg, G.stepDeg + G.stepDeg / 2);

  const full = step(cam, 1);
  assert.equal(pose(full).phase, 'FULL_PRESS_2');
  assert.equal(full.rotorIndex, 1, 'not yet committed');
  near(pose(full).cartridgeTravelMm, P.buttonStrokeMm);
  near(pose(full).camAngleDeg, 0, EPS, 'wrapped modulo pitch');

  const rel = step(full, 0.5);
  assert.equal(rel.rotorIndex, 0);
  assert.equal(pose(rel).phase, 'RELEASE');
  near(pose(rel).cartridgeTravelMm, 4.5);

  const done = step(rel, 0);
  assert.equal(pose(done).phase, 'RETRACTED');
  assert.equal(pose(done).tipExtensionMm, 0);
  assert.deepEqual(done.rotorIndex, 0);
  assert.deepEqual(pose(done), pose({ ...createInitialState(), dir: -1 }));
});

// ---------------------------------------------------------------- scrubber behaviour

test('scrubber reversal: backing off before engagement never toggles', () => {
  const s = drive(createInitialState(), [0.4, 0.75, 0.6, 0.2, 0.75, 0.5, 0]);
  assert.equal(s.rotorIndex, 0);
});

test('scrubber reversal after engagement: exactly one toggle however it wanders', () => {
  // arm, wander back into the cam band (above release), up again, then release.
  let s = drive(createInitialState(), [0.9, 0.75, 0.95, 0.72, 1, 0.8]);
  assert.equal(s.rotorIndex, 0, 'no toggle while above release threshold');
  assert.equal(s.armed, true);
  s = step(s, 0.2);
  assert.equal(s.rotorIndex, 1);
  s = drive(s, [0.3, 0.1, 0.6, 0]);   // sub-engagement wandering afterwards
  assert.equal(s.rotorIndex, 1, 'still one toggle');
});

test('threshold jitter at engagement does not cause multiple toggles', () => {
  const e = 1e-9;
  const seq = [0.5];
  for (let i = 0; i < 400; i++) seq.push(i % 2 ? G.uEngage - e : G.uEngage + e);
  let s = drive(createInitialState(), seq);
  assert.equal(s.rotorIndex, 0);
  assert.equal(s.armed, true);
  s = step(s, 0);
  assert.equal(s.rotorIndex, 1);
});

test('threshold jitter at release (armed) toggles once; it cannot re-arm', () => {
  const e = 1e-9;
  const seq = [1];
  for (let i = 0; i < 400; i++) seq.push(i % 2 ? G.uRelease + e : G.uRelease - e);
  let s = drive(createInitialState(), seq);
  assert.equal(s.rotorIndex, 1);
  assert.equal(s.armed, false);
  s = step(s, 0);
  assert.equal(s.rotorIndex, 1);
});

test('threshold jitter at release without engagement toggles nothing', () => {
  const e = 1e-9;
  const seq = [];
  for (let i = 0; i < 400; i++) seq.push(i % 2 ? G.uRelease + e : G.uRelease - e);
  const s = drive(createInitialState(), [...seq, 0]);
  assert.equal(s.rotorIndex, 0);
});

test('identical repeated input is idempotent', () => {
  const s = at(0.9);
  assert.deepEqual(step(s, 0.9), s);
  assert.deepEqual(step(step(s, 0.9), 0.9), s);
});

test('a single large scrubber jump over the whole stroke behaves like a ramp', () => {
  const jumped = drive(createInitialState(), [1, 0]);
  const ramped = drive(createInitialState(), cycle(50));
  assert.equal(jumped.rotorIndex, 1);
  assert.deepEqual(pose(jumped), pose(ramped));
});

// ---------------------------------------------------------------- cycles and drift

test('two complete cycles return to the original state and pose exactly', () => {
  const start = pose(createInitialState());
  const one = drive(createInitialState(), cycle());
  assert.equal(one.rotorIndex, 1);
  const two = drive(one, cycle());
  assert.equal(two.rotorIndex, 0);
  assert.equal(two.u, 0);
  assert.equal(two.armed, false);
  const p2 = pose(two);
  for (const k of Object.keys(start)) {
    if (k === 'phase') assert.equal(p2.phase, 'RETRACTED');
    else assert.equal(p2[k], start[k], `no drift in ${k}`);
  }
});

test('1000 complete cycles show no accumulated drift', () => {
  const retractedPose = pose(createInitialState());
  const extendedPose = pose(drive(createInitialState(), cycle()));
  let s = createInitialState();
  const seq = cycle(40);
  for (let c = 1; c <= 1000; c++) {
    s = drive(s, seq);
    assert.equal(s.rotorIndex, c % 2);
    const p = pose(s);
    const ref = c % 2 ? extendedPose : retractedPose;
    assert.deepEqual(p, ref, `cycle ${c}`);
  }
});

test('different ramp resolutions give the same result', () => {
  const a = pose(drive(createInitialState(), cycle(7)));
  const b = pose(drive(createInitialState(), cycle(333)));
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------- invariants and agreement

function lcgWalk(n, seed = 12345) {
  let x = seed >>> 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out.push(i % 50 === 49 ? 0 : i % 71 === 70 ? 1 : x / 2 ** 32);
  }
  return out;
}

test('all derived measurements are finite and physically bounded along a long random walk', () => {
  const S = P.buttonStrokeMm;
  let s = createInitialState();
  for (const u of lcgWalk(20000)) {
    s = step(s, u);
    const p = pose(s);
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} finite`);
    }
    assert.ok(p.buttonTravelMm >= 0 && p.buttonTravelMm <= S);
    assert.ok(p.cartridgeTravelMm >= 0 && p.cartridgeTravelMm <= S + EPS);
    assert.ok(p.cartridgeTravelMm >= p.buttonTravelMm - EPS);
    assert.ok(p.plungerGapMm >= 0);
    assert.ok(p.tipExtensionMm >= 0 && p.tipExtensionMm <= S - P.tipInsetMm + EPS);
    assert.ok(p.springCompressionMm >= P.springPreCompressionMm - EPS);
    assert.ok(p.springCompressionMm <= P.springPreCompressionMm + S + EPS);
    assert.ok(p.springLengthMm > P.springSolidHeightMm, 'spring never solid');
    assert.ok(p.springLengthMm <= P.springFreeLengthMm);
    assert.ok(p.springForceN >= 0);
    assert.ok(p.camAngleDeg >= 0 && p.camAngleDeg < G.pitchDeg + EPS);
    assert.ok(p.camProgress >= 0 && p.camProgress <= 1);
    assert.ok(PHASES.includes(p.phase), p.phase);
  }
});

test('spring compression and tip extension agree with the cartridge pose', () => {
  let s = createInitialState();
  for (const u of lcgWalk(5000, 99)) {
    s = step(s, u);
    const p = pose(s);
    near(p.springCompressionMm - P.springPreCompressionMm, p.cartridgeTravelMm, EPS, 'compression');
    near(p.springLengthMm, P.springFreeLengthMm - p.springCompressionMm, EPS, 'length');
    near(p.springForceN, P.springRateNPerMm * p.springCompressionMm, EPS, 'force');
    near(p.tipExtensionMm, Math.max(0, p.cartridgeTravelMm - P.tipInsetMm), EPS, 'tip');
    near(p.buttonTravelMm, s.u * P.buttonStrokeMm, EPS, 'button');
    near(p.plungerTravelMm, p.buttonTravelMm, EPS, 'plunger');
  }
});

test('pose is continuous in u, including across the step commit (cartridge and cam angle)', () => {
  const n = 2000;
  const du = 1 / n;
  const circ = (a, b) => {
    const d = Math.abs(a - b) % G.pitchDeg;
    return Math.min(d, G.pitchDeg - d);
  };
  const maxCamRate = (G.stepDeg / (P.engageTravelMm - P.releaseTravelMm)) * P.buttonStrokeMm;
  let s = createInitialState();
  let prev = pose(s);
  for (let c = 0; c < 2; c++) {
    for (const u of [...ramp(0, 1, n), ...ramp(1, 0, n)].slice(1)) {
      s = step(s, u);
      const p = pose(s);
      assert.ok(Math.abs(p.cartridgeTravelMm - prev.cartridgeTravelMm) <= P.buttonStrokeMm * du * 1.001 + EPS,
        `cartridge jump at u=${u}`);
      assert.ok(circ(p.camAngleDeg, prev.camAngleDeg) <= maxCamRate * du * 1.001 + 1e-6,
        `cam jump at u=${u}`);
      prev = p;
    }
  }
});

test('step and pose are pure: same inputs, same outputs; results are frozen; inputs untouched', () => {
  const s = at(0.9);
  const snap = JSON.stringify(s);
  const a = step(s, 0.3);
  const b = step(s, 0.3);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(s), snap);
  assert.deepEqual(pose(s), pose(s));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(pose(a)) && Object.isFrozen(createInitialState()));
});

test('custom parameters flow through consistently', () => {
  const q = { ...P, buttonStrokeMm: 10, engageTravelMm: 8, releaseTravelMm: 7, latchDropMm: 6.5 };
  const s = step(step(createInitialState(), 1, q), 0, q);
  const p = pose(s, q);
  assert.equal(p.phase, 'EXTENDED_LATCHED');
  near(p.cartridgeTravelMm, 6.5);
});

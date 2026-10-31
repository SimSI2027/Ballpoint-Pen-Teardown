// Canonical mechanism model: generic rotating-cam retractable ballpoint pen.
// Pure functions only. No rendering, no clock, no randomness, no hidden state.
// See docs/MECHANISM.md for the model, the state layers and the assumptions.
//
// Three layers:
//   input state       u            normalized button travel, 0..1
//   persistent latch  dir, armed, rotorIndex   (the minimum memory needed)
//   derived pose      everything else, computed by pose(state) from the above

import { DEFAULT_PARAMS, validateParams } from './params.js';

export const PHASES = Object.freeze([
  'RETRACTED',
  'PRESS_1',
  'CAM_TRANSITION_1',
  'FULL_PRESS_1',
  'EXTENDED_LATCHED',
  'PRESS_2',
  'CAM_TRANSITION_2',
  'FULL_PRESS_2',
  'RELEASE',
]);

/**
 * Thresholds and constants derived from a parameter set. Pure.
 */
export function deriveGeometry(params = DEFAULT_PARAMS) {
  validateParams(params);
  const S = params.buttonStrokeMm;
  const pitchDeg = 360 / params.camTeeth;
  return Object.freeze({
    strokeMm: S,
    uEngage: params.engageTravelMm / S,
    uRelease: params.releaseTravelMm / S,
    pitchDeg,
    stepDeg: pitchDeg / 2,
  });
}

/** The initial state: fully retracted, button at rest. */
export function createInitialState() {
  return Object.freeze({ u: 0, dir: 0, armed: false, rotorIndex: 0 });
}

function assertValidInput(u) {
  if (typeof u !== 'number') {
    throw new TypeError(`button travel u must be a number, got ${typeof u}`);
  }
  if (!Number.isFinite(u)) {
    throw new RangeError(`button travel u must be finite, got ${u}`);
  }
  if (u < 0 || u > 1) {
    throw new RangeError(`button travel u must be within [0, 1], got ${u}`);
  }
}

function assertValidState(s, geom) {
  if (s === null || typeof s !== 'object') throw new TypeError('state must be an object');
  assertValidInput(s.u);
  if (s.dir !== -1 && s.dir !== 0 && s.dir !== 1) throw new RangeError('state.dir must be -1, 0 or 1');
  if (typeof s.armed !== 'boolean') throw new TypeError('state.armed must be a boolean');
  if (s.rotorIndex !== 0 && s.rotorIndex !== 1) throw new RangeError('state.rotorIndex must be 0 or 1');
  // An armed press has crossed engagement and has not yet fallen back to the release threshold.
  if (s.armed && !(s.u > geom.uRelease)) {
    throw new RangeError('inconsistent state: armed but u is at or below the release threshold');
  }
}

/**
 * Advance the persistent state to a new button travel.
 *
 * Input policy: u must be a number in [0, 1] inclusive. Anything else throws
 * (TypeError for non-numbers, RangeError for NaN, +-Infinity and out-of-range).
 * Nothing is clamped. -0 is accepted and normalised to +0.
 *
 * Latch rule (hysteresis):
 *   - arm     when u >= uEngage (idempotent; repeated crossings do nothing more)
 *   - commit  when armed and u <= uRelease: rotorIndex flips and armed clears
 * A press that never arms never toggles. Arming needs u >= uEngage > uRelease, so
 * jitter around either threshold cannot produce a second toggle.
 */
export function step(state, u, params = DEFAULT_PARAMS) {
  assertValidInput(u);
  const geom = deriveGeometry(params);
  assertValidState(state, geom);
  const uu = u === 0 ? 0 : u; // normalise -0

  const dir = uu > state.u ? 1 : uu < state.u ? -1 : state.dir;
  let { armed, rotorIndex } = state;

  if (!armed && uu >= geom.uEngage) {
    armed = true;
  } else if (armed && uu <= geom.uRelease) {
    armed = false;
    rotorIndex = 1 - rotorIndex;
  }
  return Object.freeze({ u: uu, dir, armed, rotorIndex });
}

function phaseOf(state, geom, buttonMm) {
  const { u, dir, armed, rotorIndex } = state;
  if (u === 0 && !armed) return rotorIndex === 1 ? 'EXTENDED_LATCHED' : 'RETRACTED';
  const n = rotorIndex + 1; // press number, valid until the step commits
  if (armed) return dir < 0 ? 'RELEASE' : `FULL_PRESS_${n}`;
  if (dir < 0) return 'RELEASE';
  return buttonMm < geom.uRelease * geom.strokeMm ? `PRESS_${n}` : `CAM_TRANSITION_${n}`;
}

/**
 * Derive every geometric quantity from the canonical state. Pure.
 *
 * cartridgeTravelMm = max(button travel, rotor rest height): the rotor is pushed by the
 * plunger but cannot rise above the rib/slot it is seated on. Because the rest height
 * never exceeds releaseTravelMm, this is continuous when the step commits.
 */
export function pose(state, params = DEFAULT_PARAMS) {
  const geom = deriveGeometry(params);
  assertValidState(state, geom);

  const buttonTravelMm = state.u * geom.strokeMm;
  const restMm = state.rotorIndex === 1 ? params.latchDropMm : 0;
  const cartridgeTravelMm = Math.max(buttonTravelMm, restMm);

  // Cam rotation progress for the current step, 0..1. Rotation happens between the
  // release and engage thresholds on the way up and is complete once armed.
  const camProgress = state.armed
    ? 1
    : Math.min(1, Math.max(0, (buttonTravelMm - params.releaseTravelMm) /
        (params.engageTravelMm - params.releaseTravelMm)));
  // Reported modulo one tooth pitch (the rotor is N-fold symmetric).
  const camAngleDeg = geom.pitchDeg * (((state.rotorIndex + camProgress) % 2) / 2);

  const springCompressionMm = params.springPreCompressionMm + cartridgeTravelMm;

  return Object.freeze({
    buttonTravelMm,
    plungerTravelMm: buttonTravelMm,
    plungerGapMm: cartridgeTravelMm - buttonTravelMm,
    cartridgeTravelMm,
    tipExtensionMm: Math.max(0, cartridgeTravelMm - params.tipInsetMm),
    springCompressionMm,
    springLengthMm: params.springFreeLengthMm - springCompressionMm,
    springForceN: params.springRateNPerMm * springCompressionMm,
    camAngleDeg,
    camProgress,
    extended: state.rotorIndex === 1,
    latched: state.rotorIndex === 1 && buttonTravelMm <= params.latchDropMm,
    phase: phaseOf(state, geom, buttonTravelMm),
  });
}

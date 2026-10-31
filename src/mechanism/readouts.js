// Live-panel values. Derived ONLY from a pose returned by mechanism.pose().
// Throws if any numeric value is not finite, so NaN/Infinity can never reach the UI.

export const PHASE_LABELS = Object.freeze({
  RETRACTED: 'Retracted',
  PRESS_1: 'Press 1: button pushes the rotor down',
  CAM_TRANSITION_1: 'Cam transition 1: teeth clear the ribs and turn',
  FULL_PRESS_1: 'Fully pressed (1)',
  EXTENDED_LATCHED: 'Extended and latched',
  PRESS_2: 'Press 2: button pushes the rotor down',
  CAM_TRANSITION_2: 'Cam transition 2: teeth clear the ribs and turn',
  FULL_PRESS_2: 'Fully pressed (2)',
  RELEASE: 'Release: spring returns the rotor to a rest',
});

const NUMERIC = [
  'buttonTravelMm', 'cartridgeTravelMm', 'tipExtensionMm',
  'springCompressionMm', 'springForceN', 'camAngleDeg',
];

export function readouts(p) {
  const out = {};
  for (const k of NUMERIC) {
    if (typeof p[k] !== 'number' || !Number.isFinite(p[k])) {
      throw new RangeError(`readout ${k} is not finite: ${String(p[k])}`);
    }
    out[k] = p[k];
  }
  out.phase = p.phase;
  out.phaseLabel = PHASE_LABELS[p.phase] ?? p.phase;
  out.latchState = p.extended ? 'EXTENDED' : 'RETRACTED';
  out.latched = Boolean(p.latched);
  return Object.freeze(out);
}

export const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

/** Display strings for the panel. */
export function formatReadouts(r) {
  return Object.freeze({
    button: `${fmt(r.buttonTravelMm)} mm`,
    cartridge: `${fmt(r.cartridgeTravelMm)} mm`,
    tip: `${fmt(r.tipExtensionMm)} mm`,
    spring: `${fmt(r.springCompressionMm)} mm`,
    force: `${fmt(r.springForceN)} N`,
    cam: `${fmt(r.camAngleDeg, 1)}°`,
    phase: r.phaseLabel,
    latch: r.latchState === 'EXTENDED' ? (r.latched ? 'EXTENDED · latched' : 'EXTENDED') : 'RETRACTED',
  });
}

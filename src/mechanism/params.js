// Parameter block for the generic rotating-cam retractable ballpoint-pen model.
//
// EVERY value below is a PLACEHOLDER ESTIMATE invented for model development.
// None was measured from a real pen and none is a manufacturer specification.
// Replace them (and update provenance/status) once a documented reference pen
// is selected and measured.

const PROVENANCE =
  'placeholder-estimate: invented for model development; not measured; not a manufacturer specification';

function def(value, unit, confidence, note) {
  return Object.freeze({
    value,
    unit,
    provenance: PROVENANCE,
    status: 'placeholder',
    confidence,
    note,
  });
}

export const PARAM_DEFS = Object.freeze({
  buttonStrokeMm: def(9.0, 'mm', 'low',
    'Full button travel, u = 1. Real pens vary roughly in the single-digit mm range.'),
  engageTravelMm: def(7.2, 'mm', 'low',
    'Button travel at which the rotor teeth have cleared the guide ribs and the cam step is committed to the next release.'),
  releaseTravelMm: def(6.3, 'mm', 'low',
    'Button travel below which a committed step is applied (rotor seats on a long rib or a short slot). Also where cam rotation begins on the way up. Must be below engageTravelMm to give hysteresis.'),
  latchDropMm: def(6.0, 'mm', 'low',
    'Cartridge travel from the retracted position when the rotor is seated on the long ribs (pen extended and latched).'),
  tipInsetMm: def(1.5, 'mm', 'low',
    'Distance the writing tip sits inside the nose-cone exit when fully retracted. Tip protrudes only once cartridge travel exceeds this.'),
  camTeeth: def(4, 'count', 'low',
    'Number of rotor teeth / guide-rib pairs. One click advances the rotor by half a tooth pitch.'),
  springFreeLengthMm: def(30.0, 'mm', 'low', 'Uncompressed spring length.'),
  springSolidHeightMm: def(6.0, 'mm', 'low', 'Spring length with all coils touching.'),
  springPreCompressionMm: def(2.0, 'mm', 'low',
    'Compression of the spring in the fully retracted, installed state.'),
  springRateNPerMm: def(0.25, 'N/mm', 'low',
    'Linear spring rate. Force outputs derived from it are ESTIMATES, not measured forces.'),
});

export const DEFAULT_PARAMS = Object.freeze(
  Object.fromEntries(Object.entries(PARAM_DEFS).map(([k, d]) => [k, d.value])),
);

function requireFinite(p, key) {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new TypeError(`parameter ${key} must be a finite number, got ${String(v)}`);
  }
  return v;
}

/**
 * Validate a parameter value object (not the definition block).
 * Throws on the first inconsistency. Returns the same object.
 */
export function validateParams(p) {
  if (p === null || typeof p !== 'object') {
    throw new TypeError('params must be an object');
  }
  for (const key of Object.keys(PARAM_DEFS)) requireFinite(p, key);

  const {
    buttonStrokeMm: S, engageTravelMm: eng, releaseTravelMm: rel, latchDropMm: hold,
    tipInsetMm: inset, camTeeth: teeth, springFreeLengthMm: free,
    springSolidHeightMm: solid, springPreCompressionMm: pre, springRateNPerMm: k,
  } = p;

  if (!Number.isInteger(teeth) || teeth < 2) {
    throw new RangeError('camTeeth must be an integer >= 2');
  }
  if (!(S > 0)) throw new RangeError('buttonStrokeMm must be > 0');
  // hold <= rel guarantees the cartridge pose is continuous when the step commits.
  if (!(0 < hold && hold <= rel && rel < eng && eng <= S)) {
    throw new RangeError(
      'require 0 < latchDropMm <= releaseTravelMm < engageTravelMm <= buttonStrokeMm',
    );
  }
  if (!(0 <= inset && inset < hold)) {
    throw new RangeError('require 0 <= tipInsetMm < latchDropMm');
  }
  if (!(k > 0)) throw new RangeError('springRateNPerMm must be > 0');
  if (!(solid > 0 && pre >= 0)) {
    throw new RangeError('springSolidHeightMm must be > 0 and springPreCompressionMm >= 0');
  }
  // Fully pressed: compression = pre + S. Spring must not go solid.
  if (!(free - (pre + S) > solid)) {
    throw new RangeError('spring would reach solid height at full button stroke');
  }
  return p;
}

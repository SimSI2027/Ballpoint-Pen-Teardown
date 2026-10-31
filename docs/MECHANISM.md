# Mechanism model: generic rotating-cam retractable ballpoint pen

This is a **generic** rotating-cam retractable ballpoint-pen mechanism. It is not
modelled on any specific manufacturer or product, and nothing here is a
manufacturer specification. Every dimension and force is a **placeholder estimate**
(see `src/mechanism/params.js`) until a documented real reference pen is selected
and measured.

Code: `src/mechanism/params.js` (parameters), `src/mechanism/mechanism.js` (model).
Tests: `tests/mechanism.test.mjs` (`npm test`, Node's built-in runner).

## How the generic mechanism works

A plunger (button) pushes a rotor fixed to the ink cartridge. Barrel guide ribs
alternate between long ribs and short slots. Pressing past the rib tips lets the
sloped teeth turn the rotor by half a tooth pitch. On release the spring pushes the
rotor back up until its teeth land on either a long rib (cartridge held low, tip out,
latched) or a short slot (cartridge rises, tip retracts). Every press-and-release
therefore alternates the pen between two resting states; two clicks are one cycle.

## Three state layers

| Layer | Fields | Meaning |
|---|---|---|
| **Input state** | `u` | Normalized button travel, 0..1. The primary continuous input. |
| **Persistent latch state** | `dir`, `armed`, `rotorIndex` | The minimum memory `u` cannot supply. |
| **Derived pose** | everything returned by `pose()` | Pure function of the two layers above. Never stored. |

Persistent fields:

- `rotorIndex` (0 or 1): which half-pitch step the rotor sits on. 0 = retracted
  rest state, 1 = extended rest state. "Extended" is derived from it, not stored
  separately. It is deliberately modulo one tooth pitch, so it cannot grow without
  bound and two clicks return it to its original value.
- `armed` (boolean): the engagement threshold was crossed during the current press
  and the step has not yet been applied.
- `dir` (-1, 0, +1): direction of the last change in `u` (kept across equal samples).

Not stored, because derivable: extended/retracted, latched, phase, cam angle,
cartridge position, tip extension, spring state, forces.

## Transition rule (`step(state, u)`)

Two thresholds with hysteresis, `uEngage = engageTravelMm / buttonStrokeMm` and
`uRelease = releaseTravelMm / buttonStrokeMm`, with `uRelease < uEngage`.

1. **Arm**: `!armed && u >= uEngage` sets `armed`. Idempotent.
2. **Commit**: `armed && u <= uRelease` clears `armed` and flips `rotorIndex`.

Consequences:

- A partial press that never reaches `uEngage` never arms, so it never toggles.
- Jitter around `uEngage` cannot toggle: arming is idempotent.
- Jitter around `uRelease` cannot toggle twice: after the commit `armed` is false,
  and re-arming needs `u >= uEngage`, which is far above `uRelease`.
- Backing off into the band between the thresholds keeps `armed` until `uRelease` is crossed.
- Exactly one toggle per press-and-release, so two cycles restore the original state.
- No accumulating arithmetic is used: pose is recomputed from `u` and the integer
  state each time, so there is no drift (tested over 1000 cycles, compared with `deepEqual`).

## Derived pose (`pose(state)`)

With `b = u * buttonStrokeMm` and rest height `r = 0` (index 0) or `latchDropMm` (index 1):

- `cartridgeTravelMm = max(b, r)`. The rotor is driven down by the plunger but cannot
  rise above the rib or slot it rests on. Since `latchDropMm <= releaseTravelMm`, this is
  continuous at the moment the step commits (enforced by `validateParams`).
- `tipExtensionMm = max(0, cartridgeTravelMm - tipInsetMm)`.
- `springCompressionMm = springPreCompressionMm + cartridgeTravelMm`;
  `springLengthMm = free length - compression`; `springForceN = rate * compression`.
- `camProgress`: 0 below `releaseTravel`, linear to 1 at `engageTravel`, 1 while armed.
  `camAngleDeg = pitch * (((rotorIndex + camProgress) mod 2) / 2)`, i.e. reported
  modulo one tooth pitch (the rotor is N-fold symmetric). It is continuous modulo pitch.
- `plungerGapMm = cartridgeTravelMm - buttonTravelMm` (lost motion when extended).
- `latched = rotorIndex == 1 && b <= latchDropMm`.

## Phases

`RETRACTED`, `PRESS_1`, `CAM_TRANSITION_1`, `FULL_PRESS_1`, `EXTENDED_LATCHED`,
`PRESS_2`, `CAM_TRANSITION_2`, `FULL_PRESS_2`, `RELEASE`.

`RELEASE` is one phase used for any falling `u > 0` (including after the commit and
for the release of a partial press); the resting state it ends in is `RETRACTED` or
`EXTENDED_LATCHED`. Phase is derived, never stored.

## Input validation policy

`u` must be a `number` in `[0, 1]` inclusive. There is **no silent clamping**.

- Non-number (string, null, undefined, boolean, object, bigint, ...): `TypeError`.
- `NaN`, `+-Infinity`, `u < 0`, `u > 1`: `RangeError`.
- `-0` is accepted and normalised to `+0`.
- A failed call throws before producing any state; the previous state is unchanged.
- States passed to `step`/`pose` are validated too (including consistency of `armed` with `u`).
- Callers (e.g. a future slider) are responsible for supplying in-range values.
  `1.0000000002` from floating-point error is an error by design.

The only clamp is on a derived quantity (`camProgress`), which is a defined part of the model.

## Parameters (all placeholders: low confidence, not measured)

| Parameter | Value | Unit |
|---|---|---|
| `buttonStrokeMm` | 9.0 | mm |
| `engageTravelMm` | 7.2 | mm |
| `releaseTravelMm` | 6.3 | mm |
| `latchDropMm` | 6.0 | mm |
| `tipInsetMm` | 1.5 | mm |
| `camTeeth` | 4 | count |
| `springFreeLengthMm` | 30.0 | mm |
| `springSolidHeightMm` | 6.0 | mm |
| `springPreCompressionMm` | 2.0 | mm |
| `springRateNPerMm` | 0.25 | N/mm |

Each has `unit`, `provenance`, `status: 'placeholder'`, `confidence` and a `note` in
`PARAM_DEFS`. Spring force is an estimate derived from an invented rate.

## Assumptions and known limitations

- Generic design; no reference pen chosen. All numbers invented.
- The cam is reduced to thresholds and one rotation law. Tooth profiles, rib slopes and
  the exact sliding contact are not modelled.
- Cartridge travel follows the button exactly while pressed. Real overshoot, friction,
  compliance, bounce and dynamics are not modelled (no time dependence at all).
- The button returns to `u = 0` in both rest states, with the plunger-rotor gap
  reported as `plungerGapMm`. Real pens differ on where the button rests when extended.
- Force is linear spring force only; no friction, no latch force, no preload variation.
- Cam angle is reported modulo one tooth pitch; a renderer wanting cumulative rotation
  must track it itself or accept the wrap.
- Phase `RELEASE` is not split into numbered sub-phases.
- Persistent state is not time-based. Time enters only through the input: `src/mechanism/clickProfile.js`
  (`clickU(s)`) and `src/tour.js` (`tourAt(t)`) are pure functions of a controlled time value that supply `u`.
- The 3D view (`src/view/pen.js`) is posed from `pose()`; see README.md and docs/LIMITATIONS.md.

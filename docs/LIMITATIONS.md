# Known limitations (v0.1.0 experimental MVP)

## Data and accuracy
- **No reference pen.** The mechanism is a generic rotating-cam design. No manufacturer, model or
  real measurement was used. Do not read any value as a specification.
- **All dimensions and forces are placeholder estimates** (`src/mechanism/params.js`, each tagged
  `placeholder-estimate`, low confidence). Spring force assumes a linear 0.25 N/mm spring.
- `buttonStrokeMm` has a note that real pens "vary in the single-digit mm range"; that is unverified.

## Mechanism model
- The cam is reduced to two thresholds (engage and release) and one linear rotation law. Real tooth
  profiles, slopes, contact and tolerances are not modelled.
- No time dependence: no overshoot dynamics, friction, bounce, compliance or latch force.
- The button returns to travel 0 in both rest states; the plunger-to-rotor lost motion in the
  extended state is reported as `plungerGapMm`. Real pens differ in where the button rests.
- Cam angle is reported modulo one tooth pitch (the rotor is N-fold symmetric).
- After a full cycle the persistent state matches the start except `dir` (last direction of travel),
  which is genuine history; the derived pose is identical (tested over 1000 cycles).
- The model validates input strictly (throws, no clamping). Clamping happens only at the UI boundary.
- `RELEASE` is a single phase for any falling travel above zero.

## Visuals
- Cam teeth and guide ribs are simplified boxes and lugs; the rotor fins are not sloped like real
  saw teeth. Clearances were checked analytically along the cycle (tests), not by mesh collision.
- No finite-element detail, threads, ink fill variation or text/branding.
- Transparent barrel and ghosting use ordinary alpha blending, so heavy overlap can look flat from
  some angles. Shadows are a simple soft floor shadow.
- Labels are laid out in two rows with leader lines; on narrow stages only the highest-priority
  labels are shown. Leader lines can cross in some views.
- Layout is responsive (checked at 1440 and 390 px) but not optimised for mobile performance or touch
  gestures (no pinch zoom).
- Exploded offsets are hand-chosen view parameters, not part of the mechanism.

## Behaviour
- The automated tour has no fake cursor. Captions are fixed per tour step, except the click steps,
  which follow the live mechanism phase.
- If a click is interrupted (tour interrupted mid-press), the button eases back to rest; if the
  engage threshold had been crossed, the step is applied as in a normal release.
- On slow machines the input is still sampled in 1/60 s sub-steps, but only the end-of-frame pose is
  drawn, so very short phases (the cam band) may be skipped visually.
- Auto-resume runs only while playing; it is paused with Pause.

## Testing
- Unit and integration tests run in Node without WebGL. The e2e script uses Playwright Chromium with
  software WebGL (SwiftShader): it checks behaviour and takes screenshots, not frame rate or GPU
  performance. Performance on integrated GPUs was not measured.
- Screenshots are written to `screenshots/` and are git-ignored by the existing `.gitignore`.
- Not tested: other browsers, touch devices, high-DPI scaling, WebGL context loss, long idle runs.

## Out of scope for v0.1.0
No video, no sound, no deployment, no rigid-body physics.

## v0.2.0 additions

- The film is silent, rendered with software WebGL (SwiftShader) and takes about 10 minutes; shadows and antialiasing may differ slightly from a GPU render.
- Film visuals were inspected from a 12-frame contact sheet, not frame by frame; part intersections were checked only visually at those beats.
- The Windows launchers were exercised on one machine (Windows 11, Node 24); the "port held by an unrelated program" path was not exercised interactively.
- `npm run test:e2e` is timing-based and failed 7 of 21 checks on the GitHub runner (slow software rendering), so CI runs `npm test`, the build and `npm run test:pages` only; the e2e passes locally.

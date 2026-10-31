# Click Pen Teardown

An interactive 3D teardown of a **generic rotating-cam retractable ballpoint pen**, built
procedurally in the browser with three.js. Press the button (or drag the scrubber) and watch the
plunger, rotor (cam), cartridge, spring and tip move together while a live panel reads the same
numbers.

> **Placeholder estimates only.** There is no real reference pen yet. Every dimension and every
> force in this project is an invented placeholder estimate, not a measurement and not a
> manufacturer specification. Spring force assumes a linear 0.25 N/mm spring and is an estimate.
> The mechanism is generic; nothing here implies the accuracy of any specific product.

## How it is built

- **One canonical model.** `src/mechanism/` holds the pure mechanism model: `step(state, u)` advances
  a minimal persistent latch state from normalized button travel `u` (0..1), and `pose(state)` derives
  every position, angle, spring value and phase. See `docs/MECHANISM.md`.
- **Every part is posed from that pose.** `src/view/pen.js` builds the pen from code and places each
  moving part from `pose()`; the live panel, chart and labels read the same pose. Nothing is animated
  independently. Explode, cutaway and camera are view parameters only.
- **Deterministic tour.** `src/tour.js` is a pure function of time that supplies camera, cutaway and
  explode values plus the button-travel input; the mechanism state is still advanced by `step()`.
  The input is sampled in fixed 1/60 s sub-steps so frame rate cannot change the result.
- **Dependencies:** three.js at runtime; Vite and Playwright for development and tests. No remote
  assets, fonts, analytics or telemetry.
- The installed `teardown` skill was used as design guidance (single input drives everything, panels
  read the same model, cutaways, auto tour). Its kit files were **not** copied or modified: the live page
  only needs plain three.js, and the kit is built around a separate esbuild/recording pipeline.

## Install and run

```
npm install
npm run dev        # http://127.0.0.1:5173/
```

Other commands:

```
npm test           # mechanism + integration tests (Node built-in runner, no browser)
npm run test:e2e   # Playwright Chromium: loads the page, clicks, screenshots into screenshots/
npm run build      # static build into dist/ (git-ignored)
npm run preview    # serve the build at http://127.0.0.1:4173/
```

Playwright needs its Chromium once: `npx playwright install chromium`.

## Controls

| Control | Action |
|---|---|
| **CLICK PEN** / `Space` | One press-and-release (toggles extended / retracted) |
| Two-click cycle | Extend, then retract |
| Slow | Slower click animation |
| Pause / Play | Freeze or resume animations and the tour |
| Reset / `R` | Retracted pen, default camera, no isolation |
| Button travel slider | Drive the model's `u` directly (partial presses do not toggle the latch) |
| Exploded view slider / `E` | Separate the parts along the axis |
| View: Assembled, Cutaway, Exploded, Side, Click mechanism | Camera presets |
| Isolate: Button + plunger, Cam mechanism, Spring + cartridge, Show all | Ghost everything else |
| Labels | Show or hide labels and leader lines |
| Drag / scroll / double-click | Orbit / zoom / restore the default camera |

The automated tour starts on load, stops on any interaction, and resumes after 25 s of inactivity.
The orange accent marks the part that is doing the work in the current mechanism phase.

## Known limitations

See `docs/LIMITATIONS.md` for the honest list. In short: generic mechanism, invented numbers,
simplified cam geometry, no dynamics or friction, no real-pen reference, no video or sound.

## Project rules

See `CLAUDE.md` and `PROJECT_SPEC.md`. References, when added, go in `references/` with source and
licence recorded.

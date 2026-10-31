# Click Pen Teardown

> **Live demo: https://simsi2027.github.io/Ballpoint-Pen-Teardown/**

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

## Fastest way to run on Windows

1. Clone or download the repository.
2. Right-click `Install-Shortcuts.ps1` and choose **Run with PowerShell** (once).
3. Use the generated local shortcuts in the project folder:
   - **Launch Ballpoint Pen Demo** - starts the dev server at http://127.0.0.1:5173/ and opens the browser (opens it directly if this project is already serving there)
   - **Build and Preview Demo** - production build and preview at http://127.0.0.1:4173/Ballpoint-Pen-Teardown/
   - **Export Demo Video** - renders the MP4 and contact sheet (see Video export)

The `.lnk` files contain machine-specific paths, so they are local and not stored in Git (re-run the installer after moving the folder).
Every push to `main` automatically rebuilds and redeploys the newest simulator through GitHub Pages.

Or run the scripts directly (no Administrator, no permanent execution-policy change; Ctrl+C stops a server):

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\windows\Launch-Demo.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\windows\Build-And-Preview.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\tools\windows\Export-Video.ps1"
```

The scripts check Node/npm and run `npm install` once if `node_modules` is missing.

## Deployment (GitHub Pages)

`.github/workflows/deploy-pages.yml` runs on every push to `main` (and manually): `npm ci`, `npm test`,
`npm run build`, `npm run test:pages`, then publishes `dist/` with the official Pages actions. The timing-based `npm run test:e2e` is run locally only: its wall-clock click assertions are not reliable under slow CI software rendering. Production
builds use the base path `/Ballpoint-Pen-Teardown/`; local dev still serves at `/`.

## Video export

```
npm run video            # or use the Export Demo Video shortcut
```

Writes `output/ballpoint-pen-teardown-v<version>.mp4` (1920x1080, 60 fps, H.264, yuv420p, faststart, silent, ~29 s)
and `output/ballpoint-pen-contact-sheet.jpg` (12 frames taken from the MP4). It is a deterministic film mode
(`film.html`, `src/film/`): every frame is rendered by Playwright Chromium from an explicit frame index, with
the mechanism advanced by the same `step()` as the simulator; camera, captions and highlights are film-only
presentation. Frames are piped straight to FFmpeg (`npm run video -- --disk` renders numbered PNGs in
`output/.frames-tmp` instead, deleted after a good encode). It prefers the system `ffmpeg`, then Playwright's
bundled one if it has libx264, otherwise it stops and tells you to run `winget install --id Gyan.FFmpeg -e`.
Rendering uses software WebGL and takes roughly 10 minutes. Output is git-ignored (see `output/README.md`).

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
simplified cam geometry, no dynamics or friction, no real-pen reference, no sound. The exported film is silent and software-rendered.

## Project rules

See `CLAUDE.md` and `PROJECT_SPEC.md`. References, when added, go in `references/` with source and
licence recorded.

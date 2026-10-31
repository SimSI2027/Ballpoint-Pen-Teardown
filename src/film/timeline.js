// Deterministic film timeline. Pure functions of an explicit time t (seconds); no wall clock.
// The mechanism state is advanced by the SAME step() as the interactive simulator, from a button
// travel input u(t) sampled on a fixed 1/60 s grid. Camera, highlight, captions and explode are
// film-specific presentation only; nothing here poses a part.

import { createInitialState, step, pose } from '../mechanism/mechanism.js';
import { clickU } from '../mechanism/clickProfile.js';
import { VIEWS, lerpView, easeInOutCubic } from '../view/views.js';
import { autoHighlight } from '../tour.js';

export const FILM = Object.freeze({ width: 1920, height: 1080, fps: 60, duration: 29 });
export const FILM_FRAMES = FILM.duration * FILM.fps;

const V = VIEWS;
const hero = { az: 28, el: 18, dist: 200, tx: 4, ty: 0, tz: 0, cut: 0, explode: 0 };
const heroOrbit = { ...hero, az: 44, el: 16 };
const closeButton = { az: 30, el: 14, dist: 95, tx: 48, ty: 0, tz: 0, cut: 1, explode: 0 };
const closeCam = { az: 14, el: 14, dist: 82, tx: 28, ty: 0, tz: 0, cut: 1, explode: 0 };
const closeSpring = { az: 15, el: 14, dist: 95, tx: -30, ty: 0, tz: 0, cut: 1, explode: 0 };
const closeTip = { az: -22, el: 10, dist: 70, tx: -50, ty: 0, tz: 0, cut: 1, explode: 0 };

/** Camera keyframes; the view eases between consecutive keys. */
export const KEYS = Object.freeze([
  { t: 0, view: hero },
  { t: 2.5, view: heroOrbit },        // 1 hero, slow drift
  { t: 5, view: V.cutaway },          // 2 move to the cutaway
  { t: 6.4, view: closeButton },      // 3 button + plunger
  { t: 6.9, view: closeButton },
  { t: 7.7, view: closeCam },         // 5 cam transition (model: 7.97-8.10 s)
  { t: 8.2, view: closeCam },
  { t: 9.2, view: closeSpring },      // 6 spring fully compressed (model: 8.10-9.63 s)
  { t: 10.2, view: closeSpring },
  { t: 12.0, view: closeTip },        // 7-8 release, latch, tip extended (model: latched at 12.50 s)
  { t: 15, view: closeTip },
  { t: 16.3, view: closeCam },        // 10 cam release (model: 16.72-16.83 s)
  { t: 17.2, view: closeCam },
  { t: 19.5, view: closeTip },        // 11 spring returns, retracted at 20.50 s
  { t: 22, view: closeTip },
  { t: 24.5, view: V.exploded },      // 12 exploded (long, slow pull-back)
  { t: 25.5, view: V.exploded },
  { t: 27.5, view: hero },            // 13 reassembly
  { t: 29, view: heroOrbit },         // 14 final hero
]);

/** Two slow clicks (start, duration in s). Click 1: press 6.5-9.0, hold, release to 12.5. */
export const CLICKS = Object.freeze([{ start: 6.5, dur: 6 }, { start: 15.5, dur: 5 }]);

/** Beat times follow the model's phase windows (printed by tests/film.test.mjs expectations). */
export const BEATS = Object.freeze([
  { t0: 0, n: 1, title: 'Click Pen Teardown', caption: 'A generic rotating-cam retractable ballpoint pen (placeholder dimensions)', highlight: null },
  { t0: 2.5, n: 2, caption: 'Cutaway: half of the barrel is removed', highlight: null },
  { t0: 5, n: 3, caption: 'The button and plunger drive the cartridge toward the tip', highlight: 'plunger' },
  { t0: 6.5, n: 4, caption: 'First press, slowly', highlight: 'auto' },
  { t0: 7.6, n: 5, caption: 'Cam transition: the rotor teeth clear the ribs and turn', highlight: 'rotor' },
  { t0: 8.1, n: 6, caption: 'Fully pressed: the spring is at its most compressed', highlight: 'spring' },
  { t0: 9.63, n: 7, caption: 'Release: the spring lifts the rotor until its teeth catch', highlight: 'auto' },
  { t0: 12.5, n: 8, caption: 'Latched: the writing tip stays extended (4.5 mm, estimated)', highlight: 'tip' },
  { t0: 15.5, n: 9, caption: 'Second press', highlight: 'auto' },
  { t0: 16.6, n: 10, caption: 'Cam release: the rotor turns again, lining up with the slots', highlight: 'rotor' },
  { t0: 18.12, n: 11, caption: 'Release: the spring returns the tip inside the nose cone', highlight: 'auto' },
  { t0: 20.5, n: 12, caption: 'Retracted again', highlight: null },
  { t0: 23.5, n: 13, caption: 'Exploded view: every part separated along the axis', highlight: null },
  { t0: 25.5, n: 14, caption: 'Reassembly', highlight: null },
  { t0: 27.8, n: 15, title: 'Click Pen Teardown', caption: 'Generic mechanism. All dimensions and forces are estimates.', highlight: null },
]);

const clampT = (t) => (Number.isFinite(t) ? Math.min(FILM.duration, Math.max(0, t)) : 0);

/** Button-travel input at time t. */
export function filmU(t) {
  for (const c of CLICKS) if (t >= c.start && t < c.start + c.dur) return clickU((t - c.start) / c.dur);
  return 0;
}

export function filmView(t) {
  const tt = clampT(t);
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (tt < b.t) return lerpView(a.view, b.view, easeInOutCubic((tt - a.t) / (b.t - a.t)));
  }
  return { ...KEYS[KEYS.length - 1].view };
}

export function beatAt(t) {
  const tt = clampT(t);
  let b = BEATS[0];
  for (const x of BEATS) if (tt >= x.t0) b = x;
  return b;
}

// Mechanism state on the frame grid: replay from frame 0 with fixed 1/60 s steps (cached, forward-only).
let cache = { k: 0, state: createInitialState() };
export function mechAtFrame(k) {
  if (k < cache.k) cache = { k: 0, state: createInitialState() };
  let { state } = cache;
  for (let i = cache.k + 1; i <= k; i++) state = step(state, filmU(i / FILM.fps));
  cache = { k, state };
  return state;
}

/** Everything a renderer needs for frame k (t = k / fps). The same k always yields the same value. */
export function filmFrame(k) {
  const kk = Math.min(FILM_FRAMES, Math.max(0, Math.round(k)));
  const t = kk / FILM.fps;
  const mech = mechAtFrame(kk);
  const p = pose(mech);
  const beat = beatAt(t);
  return {
    k: kk, t, view: filmView(t), mech, pose: p, beat,
    highlight: beat.highlight === 'auto' ? autoHighlight(p.phase) : beat.highlight,
  };
}

// Deterministic automated tour: tourAt(t) is a pure function of time t (seconds).
// It supplies camera/cutaway/explode, the button-travel INPUT u, a highlight and a caption.
// It never poses parts; the mechanism state is advanced by step() from u as usual.

import { VIEWS, lerpView, easeInOutCubic } from './view/views.js';
import { clickU } from './mechanism/clickProfile.js';

const V = VIEWS;
const closeTip = { az: -22, el: 10, dist: 70, tx: -50, ty: 0, tz: 0, cut: 1, explode: 0 };
const closeSpring = { az: 15, el: 14, dist: 95, tx: -30, ty: 0, tz: 0, cut: 1, explode: 0 };
const closeButton = { az: 30, el: 14, dist: 95, tx: 48, ty: 0, tz: 0, cut: 1, explode: 0 };

/** Camera keyframes. The view eases between consecutive keyframes. */
export const KEYS = Object.freeze([
  { t: 0, view: V.assembled },
  { t: 3, view: V.assembled },
  { t: 6, view: V.cutaway },
  { t: 9, view: closeButton },
  { t: 10, view: closeButton },
  { t: 12, view: V.mechanism },
  { t: 14, view: V.mechanism },
  { t: 16, view: closeSpring },
  { t: 18, view: closeTip },
  { t: 21.5, view: closeTip },
  { t: 23, view: V.mechanism },
  { t: 27, view: V.mechanism },
  { t: 29, view: closeTip },
  { t: 31, view: closeTip },
  { t: 33.5, view: V.exploded },
  { t: 36.5, view: V.exploded },
  { t: 40, view: V.assembled },
]);

export const TOUR_END = 42;

/** Two slow clicks (start, duration in seconds). */
export const TOUR_CLICKS = Object.freeze([{ start: 10, dur: 6.5 }, { start: 22, dur: 6.5 }]);

/** Numbered steps with captions; highlight 'auto' = by mechanism phase, null = none. */
export const STEPS = Object.freeze([
  { t0: 0, n: 1, caption: 'A generic retractable click pen, assembled. (Placeholder dimensions)', highlight: null },
  { t0: 3, n: 2, caption: 'Cutaway: the near half of the barrel is removed.', highlight: null },
  { t0: 6.5, n: 3, caption: 'The button and plunger push the cartridge assembly toward the tip.', highlight: 'plunger' },
  { t0: 10, n: 4, caption: 'First click, slowly.', highlight: 'auto', phaseCaption: true },
  { t0: 17, n: 7, caption: 'Latched: the tip stays extended while the button is released.', highlight: 'tip' },
  { t0: 22, n: 8, caption: 'Second click.', highlight: 'auto', phaseCaption: true },
  { t0: 29, n: 9, caption: 'Retracted again: the tip is back inside the nose cone.', highlight: null },
  { t0: 31.5, n: 10, caption: 'Exploded view: every part separated along the axis.', highlight: null },
  { t0: 36.5, n: 11, caption: 'Reassembling.', highlight: null },
  { t0: 40, n: 12, caption: 'Your turn: drag to orbit, scroll to zoom, press Space to click.', highlight: null },
]);

export const PHASE_CAPTIONS = Object.freeze({
  RETRACTED: 'Retracted.',
  PRESS_1: 'Pressing: the plunger pushes the rotor and cartridge down.',
  CAM_TRANSITION_1: 'Cam transition: the rotor teeth clear the ribs and turn half a step.',
  FULL_PRESS_1: 'Fully pressed: the spring is at its most compressed.',
  EXTENDED_LATCHED: 'Extended and latched.',
  PRESS_2: 'Second press: the plunger pushes the rotor down again.',
  CAM_TRANSITION_2: 'Cam transition: the rotor turns again, lining up with the short slots.',
  FULL_PRESS_2: 'Fully pressed.',
  RELEASE: 'Release: the spring lifts the rotor until its teeth catch.',
});

/** Highlight chosen automatically from the mechanism phase (also used outside the tour). */
export function autoHighlight(phase) {
  switch (phase) {
    case 'PRESS_1': case 'PRESS_2': return 'plunger';
    case 'CAM_TRANSITION_1': case 'CAM_TRANSITION_2': return 'rotor';
    case 'FULL_PRESS_1': case 'FULL_PRESS_2': return 'spring';
    case 'RELEASE': return 'cartridge';
    case 'EXTENDED_LATCHED': return 'tip';
    default: return null;
  }
}

function viewAt(t) {
  if (t <= KEYS[0].t) return { ...KEYS[0].view };
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (t < b.t) return lerpView(a.view, b.view, easeInOutCubic((t - a.t) / (b.t - a.t)));
  }
  return { ...KEYS[KEYS.length - 1].view };
}

export function tourU(t) {
  for (const c of TOUR_CLICKS) {
    if (t >= c.start && t < c.start + c.dur) return clickU((t - c.start) / c.dur);
  }
  return 0;
}

export function tourAt(t) {
  const tt = Number.isFinite(t) ? Math.max(0, t) : 0;
  let step = STEPS[0];
  for (const s of STEPS) if (tt >= s.t0) step = s;
  return {
    view: viewAt(tt),
    u: tourU(tt),
    step,
    highlight: step.highlight,
    done: tt >= TOUR_END,
  };
}

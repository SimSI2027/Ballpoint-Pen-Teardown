// App wiring: one canonical mechanism state drives the 3D pen, the live panel and the chart.
import { createInitialState, step, pose } from './mechanism/mechanism.js';
import { clickU } from './mechanism/clickProfile.js';
import { readouts, formatReadouts } from './mechanism/readouts.js';
import { buildPen, ISOLATIONS } from './view/pen.js';
import { createStage } from './view/stage.js';
import { createLabels } from './view/labels.js';
import { createChart } from './view/chart.js';
import { VIEWS, lerpView, easeInOutCubic, clampView } from './view/views.js';
import { tourAt, autoHighlight, PHASE_CAPTIONS } from './tour.js';

const IDLE_RESUME_S = 25;
const $ = (id) => document.getElementById(id);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

const app = {
  mech: createInitialState(),
  view: { ...VIEWS.assembled },
  viewName: 'assembled',
  tween: null,             // { from, to, t, dur }
  anim: null,              // { kind: 'clicks', clicks, t, end } | { kind: 'settle', u0, t, dur }
  mode: 'tour',            // 'tour' | 'user'
  tourT: 0,
  playing: true,
  idle: 0,
  isolate: 'none',
  slow: false,
  caption: '',
  tour: null,
};

const pen = buildPen();
let stage = null;
try {
  stage = createStage($('gl'));
  stage.scene.add(pen.root);
} catch (err) {
  console.warn('WebGL unavailable:', err && err.message);
  $('error').hidden = false;
  $('gl').style.display = 'none';
}
const labels = createLabels($('labels'), $('leaders'), pen.anchors);
const chart = createChart($('chart'));

// ---------------------------------------------------------------- model input (UI boundary)

/** Clamp UI-supplied values here; the mechanism itself still validates strictly and throws. */
function setU(raw) {
  const v = Number(raw);
  if (!Number.isFinite(v)) return;
  app.mech = step(app.mech, clamp01(v));
}

function startTour() {
  app.mode = 'tour';
  app.tourT = 0;
  app.mech = createInitialState();
  app.anim = null;
  app.tween = null;
  app.isolate = 'none';
  app.caption = '';
}

function userInteracted() {
  app.idle = 0;
  if (app.mode === 'tour') {
    app.mode = 'user';
    app.caption = '';
    // let an interrupted press finish consistently instead of freezing mid-stroke
    if (app.mech.u > 0) app.anim = { kind: 'settle', u0: app.mech.u, t: 0, dur: 0.5 };
  } else {
    app.caption = '';
  }
}

function startClicks(count) {
  userInteracted();
  if (app.mech.u > 0) setU(0);
  const dur = app.slow ? 4.5 : 1.8;
  const clicks = [{ start: 0, dur }];
  if (count > 1) clicks.push({ start: dur + 0.4, dur });
  const last = clicks[clicks.length - 1];
  app.anim = { kind: 'clicks', clicks, t: 0, end: last.start + last.dur };
}

function tweenTo(name) {
  userInteracted();
  app.viewName = name;
  app.tween = { from: { ...app.view }, to: { ...VIEWS[name] }, t: 0, dur: 0.9 };
}

function reset() {
  userInteracted();
  app.mech = createInitialState();
  app.anim = null;
  app.isolate = 'none';
  app.playing = true;
  tweenTo('assembled');
}

// ---------------------------------------------------------------- per-frame update

const SUBSTEP = 1 / 60;
function forSteps(dt, fn) {
  const n = Math.ceil(dt / SUBSTEP - 1e-9);
  for (let i = 0; i < n; i++) fn(dt / n);
}

function advance(dt) {
  const sdt = app.playing ? dt : 0;
  let highlightOverride;

  if (app.mode === 'user') {
    if (app.anim) app.idle = 0; else app.idle += dt;
    if (app.idle >= IDLE_RESUME_S && app.playing) startTour();
  }

  if (app.mode === 'tour') {
    // fixed sub-steps: the input u is sampled at <= 1/60 s whatever the frame rate, so slow
    // frames cannot skip the short cam-transition band and the tour stays deterministic
    forSteps(sdt, (h) => { app.tourT += h; setU(tourAt(app.tourT).u); });
    const t = tourAt(app.tourT);
    app.tour = t;
    app.view = { ...t.view };
    setU(t.u);
    highlightOverride = t.highlight;
    if (t.done) {
      app.mode = 'user';
      app.idle = 0;
      app.caption = t.step.caption;
    }
  } else {
    if (app.tween) {
      app.tween.t += dt;
      const k = easeInOutCubic(app.tween.t / app.tween.dur);
      app.view = lerpView(app.tween.from, app.tween.to, k);
      if (app.tween.t >= app.tween.dur) { app.view = { ...app.tween.to }; app.tween = null; }
    }
    forSteps(app.anim ? sdt : 0, (h) => {
      const a = app.anim;
      if (!a) return;
      a.t += h;
      if (a.kind === 'clicks') {
        let u = 0;
        for (const c of a.clicks) if (a.t >= c.start && a.t < c.start + c.dur) u = clickU((a.t - c.start) / c.dur);
        setU(u);
        if (a.t >= a.end) { setU(0); app.anim = null; }
      } else {
        setU(a.u0 * (1 - easeInOutCubic(a.t / a.dur)));
        if (a.t >= a.dur) { setU(0); app.anim = null; }
      }
    });
  }
  return highlightOverride;
}

let lastSig = '';
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (now - (frame.last ?? now)) / 1000));
  frame.last = now;
  try {
    const override = advance(dt);
    render(override);
  } catch (err) {
    if (!frame.failed) { frame.failed = true; console.error('frame error:', err); }
  }
}

function render(override) {
  app.view = clampView(app.view);
  const p = pose(app.mech);
  const r = readouts(p);
  const f = formatReadouts(r);

  let highlight = autoHighlight(p.phase);
  let caption = app.caption;
  if (app.mode === 'tour' && app.tour) {
    if (override === 'auto') highlight = autoHighlight(p.phase);
    else highlight = override ?? null;
    caption = app.tour.step.phaseCaption ? PHASE_CAPTIONS[p.phase] : app.tour.step.caption;
  }

  pen.update(p, { explode: app.view.explode });
  pen.setCutaway(app.view.cut);
  pen.setHighlight(highlight);
  pen.setIsolation(ISOLATIONS[app.isolate]);

  $('r-button').textContent = f.button;
  $('r-cartridge').textContent = f.cartridge;
  $('r-tip').textContent = f.tip;
  $('r-spring').textContent = f.spring;
  $('r-force').textContent = f.force;
  $('r-cam').textContent = f.cam;
  $('r-latch').textContent = f.latch;
  $('r-phase').textContent = f.phase;
  $('caption').textContent = caption;
  const badge = $('tourbadge');
  badge.hidden = app.mode !== 'tour';
  if (app.mode === 'tour' && app.tour) badge.textContent = `AUTO TOUR · step ${app.tour.step.n}/12`;

  const trav = $('rng-travel');
  if (document.activeElement !== trav) trav.value = String(Math.round(app.mech.u * 1000));
  $('o-travel').textContent = `${Math.round(app.mech.u * 100)}%`;
  const ex = $('rng-explode');
  if (document.activeElement !== ex) ex.value = String(Math.round(app.view.explode * 1000));
  $('o-explode').textContent = `${Math.round(app.view.explode * 100)}%`;

  const sig = `${app.viewName}|${app.isolate}|${app.playing}|${app.mode}`;
  if (sig !== lastSig) { lastSig = sig; syncButtons(); }

  chart.draw(p);

  if (stage) {
    const w = $('stage').clientWidth, h = $('stage').clientHeight;
    stage.render(app.view);
    labels.update(
      w, h,
      (a) => stage.project(pen.anchorWorld(a)),
      (a) => !pen.isGhost(a.part === 'springAnchor' ? 'spring' : a.part),
    );
  }
  window.__penFrames = (window.__penFrames || 0) + 1;
}

function syncButtons() {
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === app.viewName));
  document.querySelectorAll('[data-iso]').forEach((b) => b.classList.toggle('active', b.dataset.iso === app.isolate && app.isolate !== 'none'));
  $('btn-play').textContent = app.playing ? 'Pause' : 'Play';
  $('btn-play').setAttribute('aria-pressed', String(!app.playing));
}

// ---------------------------------------------------------------- controls

$('btn-click').addEventListener('click', () => startClicks(1));
$('btn-cycle').addEventListener('click', () => startClicks(2));
$('btn-reset').addEventListener('click', reset);
$('btn-play').addEventListener('click', () => { userInteracted(); app.playing = !app.playing; });
$('chk-slow').addEventListener('change', (e) => { userInteracted(); app.slow = e.target.checked; });
$('chk-labels').addEventListener('change', (e) => { userInteracted(); labels.setVisible(e.target.checked); });
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => tweenTo(b.dataset.view)));
document.querySelectorAll('[data-iso]').forEach((b) => b.addEventListener('click', () => {
  userInteracted();
  app.isolate = app.isolate === b.dataset.iso ? 'none' : b.dataset.iso;
}));

$('rng-travel').addEventListener('input', (e) => {
  userInteracted();
  app.anim = null;
  setU(Number(e.target.value) / 1000);
});
$('rng-explode').addEventListener('input', (e) => {
  userInteracted();
  app.tween = null;
  const v = Number(e.target.value);
  if (Number.isFinite(v)) { app.view.explode = clamp01(v / 1000); app.viewName = ''; }
});

// orbit / zoom
const stageEl = $('stage');
let drag = null;
stageEl.addEventListener('pointerdown', (e) => {
  userInteracted();
  drag = { x: e.clientX, y: e.clientY };
  stageEl.setPointerCapture(e.pointerId);
});
stageEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  app.tween = null;
  app.view.az -= (e.clientX - drag.x) * 0.4;
  app.view.el += (e.clientY - drag.y) * 0.3;
  drag = { x: e.clientX, y: e.clientY };
  app.viewName = '';
});
const endDrag = () => { drag = null; };
stageEl.addEventListener('pointerup', endDrag);
stageEl.addEventListener('pointercancel', endDrag);
stageEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  userInteracted();
  app.tween = null;
  const dy = Number.isFinite(e.deltaY) ? e.deltaY : 0;
  app.view.dist *= Math.exp(Math.max(-300, Math.min(300, dy)) * 0.0012);
}, { passive: false });
stageEl.addEventListener('dblclick', () => tweenTo('assembled'));

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); startClicks(1); }
  else if (e.key === 'r' || e.key === 'R') reset();
  else if (e.key === 'e' || e.key === 'E') {
    userInteracted();
    app.viewName = '';
    app.tween = { from: { ...app.view }, to: { ...app.view, explode: app.view.explode > 0.5 ? 0 : 1 }, t: 0, dur: 0.8 };
  }
});

const ro = new ResizeObserver(() => { if (stage) stage.resize($('stage').clientWidth, $('stage').clientHeight); });
ro.observe(stageEl);
if (stage) stage.resize(stageEl.clientWidth, stageEl.clientHeight);

// read-only hook for tests/screenshots (no network, no telemetry)
window.__pen = {
  get mech() { return app.mech; },
  get mode() { return app.mode; },
  get view() { return { ...app.view }; },
  get idle() { return app.idle; },
  get playing() { return app.playing; },
  get anim() { return app.anim ? app.anim.kind : null; },
  pose: () => pose(app.mech),
  tipWorldX: () => { pen.update(pose(app.mech), { explode: app.view.explode }); return pen.tipWorldX(); },
  hasWebGL: () => Boolean(stage),
  forceIdle: (s) => { app.idle = s; },
};

startTour();
syncButtons();
requestAnimationFrame(frame);

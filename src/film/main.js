// Film page: renders ONE frame on demand from an explicit frame index. No requestAnimationFrame loop.
import { buildPen } from '../view/pen.js';
import { createStage } from '../view/stage.js';
import { readouts, formatReadouts } from '../mechanism/readouts.js';
import { clampView } from '../view/views.js';
import { filmFrame, FILM, FILM_FRAMES } from './timeline.js';

const $ = (id) => document.getElementById(id);
const pen = buildPen();
const stage = createStage($('gl'));
stage.scene.add(pen.root);
stage.resize(FILM.width, FILM.height);

function renderFrame(k) {
  const f = filmFrame(k);
  const view = clampView(f.view);
  pen.update(f.pose, { explode: view.explode });
  pen.setCutaway(view.cut);
  pen.setHighlight(f.highlight);
  pen.setIsolation(null);
  const r = formatReadouts(readouts(f.pose));
  $('h-phase').textContent = f.pose.phase.replaceAll('_', ' ');
  $('h-tip').textContent = `tip ${r.tip}`;
  $('h-spring').textContent = `spring ${r.spring}`;
  $('h-force').textContent = `${r.force} (est.)`;
  $('caption').textContent = f.beat.caption;
  $('title').hidden = !f.beat.title;
  stage.render(view);
  return { k: f.k, t: f.t, phase: f.pose.phase, tipExtensionMm: f.pose.tipExtensionMm, view };
}

window.__film = { renderFrame, frames: FILM_FRAMES, fps: FILM.fps, width: FILM.width, height: FILM.height };
window.__filmReady = true;
renderFrame(0);

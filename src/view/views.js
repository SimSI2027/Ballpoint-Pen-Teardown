// Camera / presentation view state. Pure helpers; no DOM, no WebGL.
// A view = orbit camera + cutaway amount + explode amount. Everything is plain numbers.

export const VIEW_KEYS = ['az', 'el', 'dist', 'tx', 'ty', 'tz', 'cut', 'explode'];

export const VIEWS = Object.freeze({
  assembled: Object.freeze({ az: 28, el: 18, dist: 200, tx: 4, ty: 0, tz: 0, cut: 0, explode: 0 }),
  cutaway: Object.freeze({ az: 22, el: 20, dist: 185, tx: 4, ty: 0, tz: 0, cut: 1, explode: 0 }),
  exploded: Object.freeze({ az: 25, el: 22, dist: 330, tx: 2, ty: 6, tz: 0, cut: 0, explode: 1 }),
  side: Object.freeze({ az: 0, el: 0, dist: 215, tx: 4, ty: 0, tz: 0, cut: 0, explode: 0 }),
  mechanism: Object.freeze({ az: 18, el: 16, dist: 125, tx: 26, ty: 0, tz: 0, cut: 1, explode: 0 }),
});

export const easeInOutCubic = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
};

export function lerpView(a, b, k) {
  const out = {};
  for (const key of VIEW_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

export const clampView = (v) => ({
  ...v,
  el: Math.min(85, Math.max(-85, v.el)),
  dist: Math.min(600, Math.max(35, v.dist)),
  cut: Math.min(1, Math.max(0, v.cut)),
  explode: Math.min(1, Math.max(0, v.explode)),
});

/** Camera position/target for a view. Narrow aspect pulls the camera back so the pen still fits. */
export function cameraFromView(v, aspect) {
  const fit = Math.max(1, 1.55 / Math.max(0.2, aspect));
  const d = v.dist * fit;
  const az = (v.az * Math.PI) / 180;
  const el = (v.el * Math.PI) / 180;
  return {
    position: [
      v.tx + d * Math.cos(el) * Math.sin(az),
      v.ty + d * Math.sin(el),
      v.tz + d * Math.cos(el) * Math.cos(az),
    ],
    target: [v.tx, v.ty, v.tz],
  };
}

// Pure time profile for one press-and-release click: normalized progress s in [0, 1]
// maps to button travel u in [0, 1]. Used by the Click button and the automated tour.
// It only supplies the INPUT u; the mechanism state is still advanced by step().

const RISE_END = 0.42; // fraction of the click spent pressing
const HOLD_END = 0.52; // fraction at which release begins

const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);

/**
 * @param {number} s progress through the click. Non-finite values are treated as 0
 *   (UI boundary); values outside [0, 1] are clamped. Output is always within [0, 1].
 */
export function clickU(s) {
  if (!Number.isFinite(s) || s <= 0 || s >= 1) return 0;
  let u;
  if (s < RISE_END) u = easeInOutCubic(s / RISE_END);
  else if (s <= HOLD_END) u = 1;
  else u = easeInOutCubic(1 - (s - HOLD_END) / (1 - HOLD_END));
  return Math.min(1, Math.max(0, u));
}

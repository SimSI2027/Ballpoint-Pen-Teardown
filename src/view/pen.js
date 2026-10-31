// Procedural 3D geometry for the generic rotating-cam retractable pen.
// No DOM and no WebGL here (importable in Node for tests). Axis = +X, tip toward -X, units mm.
// Every moving part is placed by update(pose, opts) from a pose returned by mechanism.pose();
// nothing is animated independently. All dimensions are PLACEHOLDER ESTIMATES (see params.js).

import * as THREE from 'three';
import { DEFAULT_PARAMS as P } from '../mechanism/params.js';

const rad = (d) => (d * Math.PI) / 180;
const N = P.camTeeth;
const PITCH = 360 / N;

/** Static layout (mm). Axial x positions are for the fully retracted, button-up pose. */
export const LAYOUT = Object.freeze({
  noseExitX: -62,
  tipX0: -62 + P.tipInsetMm,          // tip point when cartridge travel = 0
  barrelX0: -45, capX0: 60, capX1: 62,
  barrelRIn: 4.7, barrelROut: 5.3, capRIn: 3.6,
  seatX: -46,                          // fixed spring seat (nose washer)
  collarX0: -46 + (P.springFreeLengthMm - P.springPreCompressionMm), // cartridge collar, c = 0
  cartridgeR: 1.6, tubeX0: -57, tubeX1: 16, inkR: 1.0, inkX1: 6,
  rotorX0: 14, rotorTop0: 26, rotorR: 3.4,
  finAxial: 4, finR0: 3.6, finR1: 4.5, finHalfDeg: 10,
  sleeveX0: 26, sleeveX1: 49, sleeveR0: 3.9, sleeveR1: 4.7, lugHalfDeg: 15,
  lugBottomX: 26 - P.latchDropMm,      // long-rib bottoms: where the rotor latches when extended
  springR: 2.9, wireR: 0.35, springTurns: 14,
  footX0: 26, footX1: 29, shaftX1: 60, flangeX0: 58.5, flangeX1: 60,
  headX0: 60, headX1: 70, headR: 3.2,
});
const L = LAYOUT;

/** Explode offsets (mm) at explode = 1. A view parameter, not mechanism state. */
export const EXPLODE = Object.freeze({
  nose: { dx: -42, dy: 0 },
  spring: { dx: -20, dy: -15 },
  cartridge: { dx: -16, dy: 0 },
  rotor: { dx: 12, dy: 0 },
  sleeve: { dx: 22, dy: 10 },
  plunger: { dx: 46, dy: 0 },
  barrel: { dx: 4, dy: 30 },
});

export const ISOLATIONS = Object.freeze({
  none: null,
  button: ['plunger'],
  cam: ['rotor', 'sleeve', 'plunger'],
  springCartridge: ['spring', 'cartridge', 'nose'],
});

const ACCENT = new THREE.Color(0xff5a1f);

// ------------------------------------------------------------------ geometry helpers

/** Map an XY-plane extrusion (z = axial) onto the pen axis: (xs, ys, zs) -> (zs + x0, xs, ys). */
function toAxis(g, x0) {
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return g;
}

function ringGeom(r0, r1, x0, x1, seg = 64) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, r0, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return toAxis(new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false, curveSegments: seg }), x0);
}

/** Annular sector from angle a0..a1 (deg, from +Y toward +Z), radii r0..r1, axial x0..x1. */
function sectorGeom(r0, r1, a0, a1, x0, x1) {
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, rad(a0), rad(a1), false);
  s.absarc(0, 0, r0, rad(a1), rad(a0), true);
  s.closePath();
  return toAxis(new THREE.ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false, curveSegments: 6 }), x0);
}

function cylGeom(r, x0, x1, seg = 40) {
  const g = new THREE.CylinderGeometry(r, r, x1 - x0, seg);
  g.rotateZ(Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, 0);
  return g;
}

/** Lathe about the X axis from [radius, x] points. */
function latheGeom(points, seg = 56) {
  const g = new THREE.LatheGeometry(points.map(([r, x]) => new THREE.Vector2(r, x)), seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}

class Helix extends THREE.Curve {
  constructor(len, r, turns) { super(); this.len = len; this.r = r; this.turns = turns; }
  getPoint(t, target = new THREE.Vector3()) {
    const a = Math.PI * 2 * this.turns * t;
    return target.set(this.len * t, this.r * Math.cos(a), this.r * Math.sin(a));
  }
}

// ------------------------------------------------------------------ builder

export function buildPen() {
  const root = new THREE.Group();
  root.name = 'pen';

  const std = (color, rough, metal, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, side: THREE.DoubleSide, ...extra });

  const mats = {
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xcfe2ee, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.22,
      side: THREE.DoubleSide, depthWrite: false,
    }),
    tube: std(0xe6eef5, 0.15, 0, { transparent: true, opacity: 0.3, depthWrite: false }),
    plunger: std(0x2b2d32, 0.45, 0.3),
    cap: std(0x35383e, 0.5, 0.2),
    rotor: std(0x3a3d44, 0.5, 0.35),
    sleeve: std(0xa7abb2, 0.55, 0.1),
    nose: std(0xb9bdc4, 0.4, 0.85),
    spring: std(0xa9b0b9, 0.35, 0.9),
    ink: std(0x1f3a8a, 0.4, 0.05),
    collar: std(0x4a4e55, 0.5, 0.6),
    tip: std(0xcfd3d8, 0.25, 1.0),
    clip: std(0x585d65, 0.4, 0.8),
  };

  const mesh = (geo, mat, { cast = true, order = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.renderOrder = order;
    return m;
  };

  // --- barrel (fixed) + pocket clip
  const barrel = new THREE.Group();
  barrel.add(mesh(ringGeom(L.barrelRIn, L.barrelROut, L.barrelX0, L.capX0), mats.glass, { cast: false, order: 10 }));
  barrel.add(mesh(ringGeom(L.capRIn, L.barrelROut, L.capX0, L.capX1), mats.cap));
  const clip = new THREE.Group();
  clip.add(mesh(ringGeom(L.barrelROut, L.barrelROut + 0.5, 56.5, 60), mats.clip));
  clip.add(mesh(new THREE.BoxGeometry(3.6, 1.8, 4.2).translate(58.3, L.barrelROut + 0.9, 0), mats.clip));
  clip.add(mesh(new THREE.BoxGeometry(36, 0.7, 4.4).translate(40.5, L.barrelROut + 1.35, 0), mats.clip));
  clip.add(mesh(new THREE.SphereGeometry(1.0, 16, 12).translate(22.2, L.barrelROut + 0.6, 0), mats.clip));
  barrel.add(clip);

  // --- nose cone (fixed) with spring seat washer
  const nose = new THREE.Group();
  const ex = L.noseExitX;
  nose.add(mesh(latheGeom([
    [4.6, -45], [5.3, -45], [5.3, -48], [1.5, ex + 2], [1.2, ex],
    [0.9, ex], [0.9, ex + 2], [2.6, ex + 7], [4.6, -49], [4.6, -45],
  ]), mats.nose));
  nose.add(mesh(ringGeom(1.9, 4.6, L.seatX - 0.6, L.seatX), mats.collar));

  // --- guide sleeve (fixed): ring + long-rib lugs (rest stops for an extended pen)
  const sleeve = new THREE.Group();
  sleeve.add(mesh(ringGeom(L.sleeveR0, L.sleeveR1, L.sleeveX0, L.sleeveX1), mats.sleeve, { order: 5 }));
  for (let k = 0; k < N; k++) {
    const mid = (k + 0.5) * PITCH;
    sleeve.add(mesh(sectorGeom(L.sleeveR0, L.sleeveR1, mid - L.lugHalfDeg, mid + L.lugHalfDeg, L.lugBottomX, L.sleeveX0), mats.sleeve, { order: 5 }));
  }

  // --- cartridge (moves by -cartridgeTravel): tube, ink, tip, collar
  const cartridge = new THREE.Group();
  cartridge.add(mesh(cylGeom(L.cartridgeR, L.tubeX0, L.tubeX1), mats.tube, { cast: false, order: 8 }));
  cartridge.add(mesh(cylGeom(L.inkR, L.tubeX0, L.inkX1), mats.ink));
  const tipGroup = new THREE.Group();
  tipGroup.add(mesh(latheGeom([[0.65, L.tipX0 + 0.5], [1.55, L.tubeX0], [0.0, L.tubeX0]], 32), mats.tip));
  tipGroup.add(mesh(new THREE.SphereGeometry(0.5, 20, 14).translate(L.tipX0 + 0.5, 0, 0), mats.tip));
  cartridge.add(tipGroup);
  cartridge.add(mesh(ringGeom(L.cartridgeR, 3.4, L.collarX0, L.collarX0 + 1.2), mats.collar));
  cartridge.add(mesh(cylGeom(L.cartridgeR, L.tubeX1 - 0.01, L.tubeX1 + 0.01), mats.collar));

  // --- rotor / cam (moves by -cartridgeTravel, rotates by camAngle)
  const rotor = new THREE.Group();
  rotor.add(mesh(cylGeom(L.rotorR, L.rotorX0, L.rotorTop0), mats.rotor, { order: 6 }));
  for (let k = 0; k < N; k++) {
    const arm = new THREE.Group();
    arm.rotation.x = rad(k * PITCH);
    const tang = 2 * L.finR1 * Math.sin(rad(L.finHalfDeg));
    arm.add(mesh(
      new THREE.BoxGeometry(L.finAxial, L.finR1 - L.finR0, tang)
        .translate(L.rotorTop0 - L.finAxial / 2, (L.finR0 + L.finR1) / 2, 0),
      mats.rotor, { order: 6 },
    ));
    rotor.add(arm);
  }

  // --- spring (scaled along x from a unit helix of free length; anchored at the seat)
  const spring = new THREE.Group();
  const coil = mesh(
    new THREE.TubeGeometry(new Helix(P.springFreeLengthMm, L.springR, L.springTurns), L.springTurns * 22, L.wireR, 8, false),
    mats.spring,
  );
  spring.add(coil); // group origin sits on the seat; update() scales the coil along x

  // --- plunger + button (moves by -buttonTravel)
  const plunger = new THREE.Group();
  plunger.add(mesh(cylGeom(3.0, L.footX0, L.footX1), mats.plunger));
  plunger.add(mesh(cylGeom(2.2, L.footX1, L.shaftX1), mats.plunger));
  plunger.add(mesh(cylGeom(4.0, L.flangeX0, L.flangeX1), mats.plunger));
  const head = mesh(cylGeom(L.headR, L.headX0, L.headX1 - 1), mats.plunger);
  plunger.add(head);
  plunger.add(mesh(new THREE.SphereGeometry(L.headR, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2).translate(L.headX1 - 1, 0, 0), mats.plunger));

  const parts = { barrel, nose, sleeve, cartridge, rotor, spring, plunger };
  for (const [name, g] of Object.entries(parts)) { g.name = name; root.add(g); }

  // clipping (cutaway): keeps z <= constant; constant 7 (> any radius) = no cut
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 7);
  for (const m of [mats.glass, mats.sleeve, mats.nose, mats.cap, mats.clip]) m.clippingPlanes = [plane];

  // --- ghosting bookkeeping
  const partMats = {};
  for (const [name, g] of Object.entries(parts)) {
    const set = new Set();
    g.traverse((o) => { if (o.isMesh) set.add(o.material); });
    partMats[name] = [...set];
  }
  const base = new Map();
  for (const m of Object.values(mats)) base.set(m, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, color: m.color.clone() });

  const accentable = {
    plunger: [mats.plunger], rotor: [mats.rotor], spring: [mats.spring],
    cartridge: [mats.ink, mats.collar], tip: [mats.tip],
  };

  // --- label anchors: local point in a part's frame (parts carry their pose-derived transforms)
  const anchors = [
    { id: 'button', text: 'Push button', part: 'plunger', local: [L.headX1 - 0.5, 0, 0] },
    { id: 'plunger', text: 'Plunger', part: 'plunger', local: [40, 0, 0] },
    { id: 'clip', text: 'Pocket clip', part: 'barrel', local: [38, L.barrelROut + 1.8, 0] },
    { id: 'barrel', text: 'Transparent barrel', part: 'barrel', local: [8, L.barrelROut, 0] },
    { id: 'sleeve', text: 'Guide sleeve + ribs', part: 'sleeve', local: [38, L.sleeveR1 - 0.2, 0] },
    { id: 'rotor', text: 'Rotor (cam)', part: 'rotor', local: [L.rotorTop0 - 2, L.finR1, 0] },
    { id: 'cartridge', text: 'Ink cartridge', part: 'cartridge', local: [-10, 0, 0] },
    { id: 'spring', text: 'Compression spring', part: 'springAnchor', local: [0, 0, 0] },
    { id: 'nose', text: 'Nose cone', part: 'nose', local: [-53, 3.0, 0] },
    { id: 'tip', text: 'Ball tip', part: 'cartridge', local: [L.tipX0 + 0.5, 0, 0] },
  ].map((a) => ({ ...a, local: new THREE.Vector3(...a.local) }));

  const finite = (...v) => v.every((x) => typeof x === 'number' && Number.isFinite(x));
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  // spring label anchor: child of the coil at its midpoint, so it tracks the compression
  const springAnchor = new THREE.Object3D();
  springAnchor.position.set(P.springFreeLengthMm / 2, L.springR, 0);
  coil.add(springAnchor);

  return {
    root, parts, mats, anchors, plane, springAnchor,

    /** Pose every moving part from a mechanism pose. Skips (keeps last pose) if anything is non-finite. */
    update(pose, opts = {}) {
      const c = pose.cartridgeTravelMm, b = pose.plungerTravelMm;
      const len = pose.springLengthMm, ang = pose.camAngleDeg;
      if (!finite(c, b, len, ang) || len <= 0) return false;
      const e = finite(opts.explode) ? clamp01(opts.explode) : 0;
      const place = (g, x, name) => {
        const o = EXPLODE[name];
        g.position.set(x + e * o.dx, e * o.dy, 0);
      };
      place(barrel, 0, 'barrel');
      place(nose, 0, 'nose');
      place(sleeve, 0, 'sleeve');
      place(cartridge, -c, 'cartridge');
      place(rotor, -c, 'rotor');
      place(plunger, -b, 'plunger');
      place(spring, L.seatX, 'spring');
      rotor.rotation.x = rad(ang);
      coil.scale.x = len / P.springFreeLengthMm; // compression shortens the coil from the seat
      return true;
    },

    setCutaway(cut) {
      const k = finite(cut) ? clamp01(cut) : 0;
      plane.constant = 7 - 7 * k;
    },

    /** id: 'plunger' | 'rotor' | 'spring' | 'cartridge' | 'tip' | null */
    setHighlight(id) {
      for (const [key, list] of Object.entries(accentable)) {
        for (const m of list) {
          const b0 = base.get(m).color;
          const on = key === id;
          m.color.copy(b0);
          if (on) m.color.lerp(ACCENT, 0.9);
          m.emissive = m.emissive ?? new THREE.Color(0);
          m.emissive.copy(ACCENT).multiplyScalar(on ? 0.18 : 0);
        }
      }
    },

    /** names: array of part names to keep solid; null = show all solid */
    setIsolation(names) {
      for (const [name, list] of Object.entries(partMats)) {
        const ghost = names !== null && !names.includes(name);
        for (const m of list) {
          const b0 = base.get(m);
          if (!b0) continue;
          m.opacity = ghost ? Math.min(b0.opacity, 0.06) : b0.opacity;
          m.transparent = ghost || b0.transparent;
          m.depthWrite = ghost ? false : b0.depthWrite;
        }
        parts[name].userData.ghost = ghost;
      }
    },

    anchorWorld(a, out = new THREE.Vector3()) {
      root.updateMatrixWorld(true);
      if (a.part === 'springAnchor') return springAnchor.getWorldPosition(out);
      return parts[a.part].localToWorld(out.copy(a.local));
    },

    isGhost(partName) { return Boolean(parts[partName].userData.ghost); },

    /** World x of the ball-tip point (for visual/readout agreement checks). */
    tipWorldX() {
      root.updateMatrixWorld(true);
      return cartridge.localToWorld(new THREE.Vector3(L.tipX0, 0, 0)).x;
    },
  };
}

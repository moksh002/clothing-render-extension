// Renderer-agnostic 3D figure: pure geometry data (rings to loft) built from a FitResult.
// Units are cm, y is up, the figure faces +z. No Three.js here so it can be unit tested.
import type { FitResult, Gender } from '../../types';

export interface Ring {
  y: number;
  cx: number;
  cz: number;
  /** Half width (x) and half depth (z) of the elliptical cross-section. */
  a: number;
  b: number;
  /** 0..1, how red the garment is at this ring (tight). */
  tint: number;
}

export interface Part {
  name: string;
  kind: 'body' | 'garment';
  rings: Ring[];
  /** Part-local coordinates are rotated about the z axis by `rotZ` and moved to `origin`. */
  origin: { x: number; y: number };
  rotZ: number;
}

export interface Blob {
  name: string;
  center: { x: number; y: number; z: number };
  radii: { x: number; y: number; z: number };
  /** Rotation about z in radians, for hands following the arms. */
  rotZ?: number;
}

export interface FigureSpec {
  heightCm: number;
  gender: Gender;
  parts: Part[];
  blobs: Blob[];
}

// ---- geometry helpers ------------------------------------------------------

/** Ramanujan's approximation for the perimeter of an ellipse with half axes a and b. */
export function ellipsePerimeter(a: number, b: number): number {
  const h = ((a - b) / (a + b)) ** 2;
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

/** Half axes of an ellipse with the given perimeter and depth/width ratio. */
export function halfAxes(circumference: number, ratio: number): { a: number; b: number } {
  const a = circumference / ellipsePerimeter(1, ratio);
  return { a, b: ratio * a };
}

const lerp = (x: number, y: number, t: number) => x + (y - x) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Linear interpolation of a ring stack (sorted top to bottom) at height y. */
export function sampleRings(rings: Ring[], y: number): Ring {
  if (y >= rings[0].y) return { ...rings[0], y };
  for (let i = 1; i < rings.length; i++) {
    const hi = rings[i - 1];
    const lo = rings[i];
    if (y >= lo.y) {
      const t = (y - lo.y) / Math.max(1e-6, hi.y - lo.y);
      return {
        y,
        cx: lerp(lo.cx, hi.cx, t),
        cz: lerp(lo.cz, hi.cz, t),
        a: lerp(lo.a, hi.a, t),
        b: lerp(lo.b, hi.b, t),
        tint: lerp(lo.tint, hi.tint, t),
      };
    }
  }
  return { ...rings[rings.length - 1], y };
}

/** Uniform Catmull-Rom smoothing of a ring stack: `sub` extra rings between each pair. */
export function smoothRings(rings: Ring[], sub = 4): Ring[] {
  if (rings.length < 3) return rings;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const out: Ring[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const p0 = rings[Math.max(0, i - 1)];
    const p1 = rings[i];
    const p2 = rings[i + 1];
    const p3 = rings[Math.min(rings.length - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      out.push({
        y: cr(p0.y, p1.y, p2.y, p3.y, t),
        cx: cr(p0.cx, p1.cx, p2.cx, p3.cx, t),
        cz: cr(p0.cz, p1.cz, p2.cz, p3.cz, t),
        a: Math.max(0.1, cr(p0.a, p1.a, p2.a, p3.a, t)),
        b: Math.max(0.1, cr(p0.b, p1.b, p2.b, p3.b, t)),
        tint: clamp(cr(p0.tint, p1.tint, p2.tint, p3.tint, t), 0, 1),
      });
    }
  }
  out.push(rings[rings.length - 1]);
  return out;
}

// ---- body templates ------------------------------------------------------------

interface Template {
  /** Depth / width of each cross-section. */
  chestDepth: number;
  waistDepth: number;
  hipDepth: number;
  neckRadius: number;
  /** The chest centre sits this far forward (bust). */
  bustForward: number;
  headScale: number;
}

const TEMPLATES: Record<Gender, Template> = {
  men: { chestDepth: 0.72, waistDepth: 0.8, hipDepth: 0.72, neckRadius: 6, bustForward: 0, headScale: 1 },
  women: { chestDepth: 0.78, waistDepth: 0.76, hipDepth: 0.76, neckRadius: 5, bustForward: 1.2, headScale: 0.96 },
};

// Anatomical levels as fractions of height (from the ground).
const NECK_BASE = 0.818;
const SHOULDER_LINE = 0.808;
const CHEST = 0.72;
const WAIST = 0.62;
const HIPS = 0.52;

const ARM_ANGLE = (7 * Math.PI) / 180;
const GAP = 0.35; // cm the garment keeps from the skin

const circle = (y: number, cx: number, r: number, cz = 0): Ring => ({ y, cx, cz, a: r, b: r, tint: 0 });
const circleFromCirc = (y: number, cx: number, circ: number): Ring => circle(y, cx, circ / (2 * Math.PI));

function torsoRings(fit: FitResult, t: Template): Ring[] {
  const { body } = fit;
  const H = body.heightCm;
  const shoulderHalf = body.shoulderCm / 2;
  const at = (frac: number, circ: number, depth: number, cz = 0): Ring => {
    const { a, b } = halfAxes(circ, depth);
    return { y: frac * H, cx: 0, cz, a, b, tint: 0 };
  };
  const chest = at(CHEST, body.chestCm, t.chestDepth, t.bustForward);
  const waist = at(WAIST, body.waistCm, t.waistDepth);
  const hips = at(HIPS, body.hipsCm, t.hipDepth);
  const shoulderA = shoulderHalf * 0.8;
  const mid = (r1: Ring, r2: Ring, y: number): Ring => ({ ...sampleRings([r1, r2], y), y });
  const crotch = body.inseamCm;

  const shoulder: Ring = { y: SHOULDER_LINE * H, cx: 0, cz: 0, a: shoulderA, b: shoulderA * 0.36, tint: 0 };
  const upper: Ring = { y: 0.77 * H, cx: 0, cz: t.bustForward * 0.4, a: lerp(shoulderA, chest.a, 0.55), b: lerp(shoulder.b, chest.b, 0.6), tint: 0 };
  const lowChest: Ring = mid(chest, waist, 0.67 * H);
  const lowWaist: Ring = mid(waist, hips, 0.57 * H);
  const pelvis: Ring = {
    y: crotch + 1,
    cx: 0,
    cz: 0,
    a: hips.a * 0.97,
    b: hips.b * 0.95,
    tint: 0,
  };
  return [
    { y: (NECK_BASE + 0.012) * H, cx: 0, cz: 0, a: t.neckRadius + 2.2, b: t.neckRadius + 1.4, tint: 0 },
    shoulder,
    upper,
    chest,
    lowChest,
    waist,
    lowWaist,
    hips,
    pelvis,
  ];
}

function legRings(fit: FitResult, dir: 1 | -1): Ring[] {
  const { body } = fit;
  const H = body.heightCm;
  const hipA = (body.hipsCm / 2 / Math.PI) * 0.55;
  const top = body.inseamCm + 2;
  const x = (f: number) => dir * hipA * f;
  const rows: [number, number, number][] = [
    // y, circumference factor of hips, centre factor
    [top, 0.6, 1.0],
    [top - (top - 0.285 * H) * 0.5, 0.5, 0.92],
    [0.285 * H, 0.38, 0.85],
    [0.17 * H, 0.4, 0.8],
    [0.05 * H, 0.23, 0.78],
    [0.02 * H, 0.22, 0.78],
  ];
  return rows.map(([y, f, c]) => circleFromCirc(y, x(c), body.hipsCm * f));
}

/** Arm rings in arm-local space: y is minus the distance along the arm from the shoulder joint. */
function armRings(fit: FitResult): Ring[] {
  const { body } = fit;
  const L = body.armLengthCm;
  const c = body.chestCm;
  const rows: [number, number][] = [
    // A negative first value is a 1 cm overlap above the joint rather than a fraction of the arm.
    [-1, 0.3],
    [0.12, 0.31],
    [0.5, 0.25],
    [0.65, 0.26],
    [0.92, 0.17],
    [1, 0.16],
  ];
  return rows.map(([t, f]) => circleFromCirc(t < 0 ? -t : -t * L, 0, c * f));
}

const armRadiusAt = (arm: Ring[], dist: number): number => {
  const r = sampleRings(arm, -dist);
  return r.a;
};

// ---- the figure --------------------------------------------------------------------

export function buildFigure(fit: FitResult): FigureSpec {
  const { body, garment: g } = fit;
  const H = body.heightCm;
  const t = TEMPLATES[body.gender];
  const parts: Part[] = [];
  const blobs: Blob[] = [];

  const torso = torsoRings(fit, t);
  parts.push({ name: 'torso', kind: 'body', rings: smoothRings(torso), origin: { x: 0, y: 0 }, rotZ: 0 });

  // Neck
  const headRy = 0.066 * H * t.headScale;
  const chinY = H - 2 * headRy + 1.5;
  parts.push({
    name: 'neck',
    kind: 'body',
    rings: [circle(chinY, 0, t.neckRadius, 1), circle((NECK_BASE + 0.015) * H, 0, t.neckRadius + 0.6, 0)],
    origin: { x: 0, y: 0 },
    rotZ: 0,
  });
  blobs.push({
    name: 'head',
    center: { x: 0, y: H - headRy, z: 1 },
    radii: { x: 0.045 * H * t.headScale, y: headRy, z: 0.056 * H * t.headScale },
  });

  // Legs and feet
  for (const dir of [1, -1] as const) {
    parts.push({ name: dir === 1 ? 'leg-r' : 'leg-l', kind: 'body', rings: smoothRings(legRings(fit, dir), 3), origin: { x: 0, y: 0 }, rotZ: 0 });
    const legX = dir * (body.hipsCm / 2 / Math.PI) * 0.55 * 0.78;
    blobs.push({
      name: dir === 1 ? 'foot-r' : 'foot-l',
      center: { x: legX, y: 0.025 * H, z: 0.04 * H },
      radii: { x: 0.027 * H, y: 0.024 * H, z: 0.075 * H },
    });
  }

  // Arms and hands
  const arm = armRings(fit);
  const shoulderJoint = (dir: 1 | -1) => {
    const r = body.chestCm * 0.3 / (2 * Math.PI);
    return { x: dir * (body.shoulderCm / 2 - r), y: (SHOULDER_LINE - 0.004) * H - r * 0.3 };
  };
  for (const dir of [1, -1] as const) {
    const origin = shoulderJoint(dir);
    const rotZ = dir * ARM_ANGLE;
    parts.push({ name: dir === 1 ? 'arm-r' : 'arm-l', kind: 'body', rings: smoothRings(arm, 3), origin, rotZ });
    // Hand: just past the wrist, following the arm angle.
    const d = body.armLengthCm + 4;
    blobs.push({
      name: dir === 1 ? 'hand-r' : 'hand-l',
      center: { x: origin.x + Math.sin(rotZ) * d, y: origin.y - Math.cos(rotZ) * d, z: 0 },
      radii: { x: 0.02 * H, y: 0.05 * H, z: 0.012 * H },
      rotZ,
    });
  }

  // ---- garment ----
  const bodyAt = (y: number) => sampleRings(torso.slice(1), clamp(y, torso[torso.length - 1].y, torso[1].y));
  const bodyPerimeterAt = (y: number) => {
    const r = bodyAt(y);
    return ellipsePerimeter(r.a, r.b);
  };

  /** A garment ring at height y with the given circumference, kept outside the body. */
  const shell = (y: number, circ: number): Ring => {
    const b = bodyAt(y);
    const ratio = b.b / b.a;
    const free = halfAxes(circ, ratio);
    const a = Math.max(free.a, b.a + GAP);
    const bb = Math.max(free.b, b.b + GAP);
    const bodyPerim = ellipsePerimeter(b.a, b.b);
    const clamped = circ < bodyPerim - 0.05;
    return { y, cx: b.cx, cz: b.cz, a, b: bb, tint: clamped ? 1 : 0 };
  };

  const neckY = NECK_BASE * H;
  const hemY = Math.max(neckY - g.lengthCm, body.inseamCm - 18);
  const dropCm = clamp((fit.easeCm.shoulder - 3) * 0.8, 0, 9);

  const controls: Ring[] = [];
  const collar: Ring = {
    y: NECK_BASE * H + 1,
    cx: 0,
    cz: 0.6,
    a: t.neckRadius + 1.9,
    b: t.neckRadius + 1.6,
    tint: 0,
  };
  controls.push(collar);
  {
    const s = torso[1];
    const shoulderA = Math.max(g.shoulderCm / 2 * 0.8, s.a + GAP);
    controls.push({ y: s.y + 0.3, cx: 0, cz: 0, a: shoulderA + (dropCm > 0 ? 0.3 * dropCm : 0), b: s.b + GAP + 0.4, tint: 0 });
  }
  const gStraightWaist = Math.max(g.waistCm, g.chestCm * 0.92);
  const candidates: [number, number][] = [
    [0.77 * H, lerp(ellipsePerimeter(torso[2].a, torso[2].b), g.chestCm, 0.8)],
    [CHEST * H, g.chestCm],
    [0.67 * H, lerp(g.chestCm, gStraightWaist, 0.5)],
    [WAIST * H, gStraightWaist],
  ];
  for (const [y, circ] of candidates) if (y > hemY + 4) controls.push(shell(y, circ));
  // Everything from the shoulders to the chest takes the chest's tint, so a tight top is one red
  // area rather than bands (the rings in between are not individually measured).
  const chestRing = controls.find((r) => Math.abs(r.y - CHEST * H) < 0.5);
  if (chestRing) for (const r of controls) if (r.y >= chestRing.y - 0.5 && r !== controls[0]) r.tint = chestRing.tint;
  // The torso between chest and waist is tight if the waist is, even though its rings are drawn straight.
  if (fit.label.waist === 'tight') for (const r of controls) if (r !== controls[0]) r.tint = Math.max(r.tint, 1);
  // Below the waist the body widens to the hips; add rings so the shell never sinks into it.
  const hemCirc = Math.max(gStraightWaist, g.chestCm * 0.98);
  for (let y = WAIST * H - 8; y > hemY + 3; y -= 8) controls.push(shell(y, hemCirc));
  controls.push(shell(hemY, hemCirc));
  if (fit.label.waist === 'tight') for (const r of controls) if (r !== controls[0]) r.tint = 1;
  parts.push({ name: 'shirt', kind: 'garment', rings: smoothRings(controls, 4), origin: { x: 0, y: 0 }, rotZ: 0 });
  void bodyPerimeterAt;

  // Sleeves follow the arms. They start at the shoulder seam (lower when the shoulder drops).
  if (g.sleeveCm > 0.5) {
    const gap = clamp(fit.easeCm.chest * 0.1, GAP, 3.5);
    const tight = fit.easeCm.chest < 0 ? 1 : 0;
    const start = Math.max(-1, dropCm - 1.5);
    const end = Math.max(start + 2, g.sleeveCm + dropCm * 0.5);
    const rows = [0, 0.25, 0.6, 1].map((u) => start + (end - start) * u);
    for (const dir of [1, -1] as const) {
      const rings: Ring[] = rows.map((dist) => ({
        y: -dist,
        cx: 0,
        cz: 0,
        a: armRadiusAt(arm, dist) + gap,
        b: armRadiusAt(arm, dist) + gap,
        tint: tight,
      }));
      parts.push({
        name: dir === 1 ? 'sleeve-r' : 'sleeve-l',
        kind: 'garment',
        rings: smoothRings(rings, 3),
        origin: shoulderJoint(dir),
        rotZ: dir * ARM_ANGLE,
      });
    }
  }

  return { heightCm: H, gender: body.gender, parts, blobs };
}

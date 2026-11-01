// Garment shell built from cross-sections of the real body mesh, so it follows the actual shape
// (bust, back, thighs, arms) instead of an ellipse. Units are cm, y up, figure faces +z.
import type { FitResult, Neckline } from '../../types';
import type { Part, Ring } from '../three/figure';
import { smoothRings } from '../three/figure';
import type { BodyFit } from './fit';
import { sliceLoops, trunkLoop, type Loop } from './slice';

export const POLAR = 56;
const GAP = 0.35; // cm of air between skin and cloth
const TRUNK_HALF_WIDTH = 30;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Convex hull (monotone chain) of x,z pairs. */
function hull(pts: number[]): number[] {
  const p: [number, number][] = [];
  for (let i = 0; i < pts.length; i += 2) p.push([pts[i], pts[i + 1]]);
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (arr: [number, number][]) => {
    const h: [number, number][] = [];
    for (const q of arr) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...build(p), ...build([...p].reverse())].flat();
}

function asLoop(pts: number[]): Loop {
  let perimeter = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]); minZ = Math.min(minZ, pts[i + 1]); maxZ = Math.max(maxZ, pts[i + 1]);
    const j = (i + 2) % pts.length;
    perimeter += Math.hypot(pts[j] - pts[i], pts[j + 1] - pts[i + 1]);
  }
  return { pts, perimeter, minX, maxX, minZ, maxZ };
}

/**
 * The body's trunk at height y. Where the arms join the shoulders the loop merges with them, so with
 * `clipHalfWidth` the points beyond it are dropped and the hull of the rest is used. Below the crotch
 * this is the hull around both thighs.
 */
export function trunkSection(pos: Float32Array, tris: Uint32Array, y: number, clipHalfWidth = Infinity, hullBelowY = -Infinity): Loop {
  const loops = sliceLoops(pos, tris, y);
  // Around the crotch the loop pinches between the thighs; use the hull of everything instead.
  if (y <= hullBelowY) return asLoop(hull(loops.filter((l) => (l.minX + l.maxX) / 2 > -TRUNK_HALF_WIDTH && (l.minX + l.maxX) / 2 < TRUNK_HALF_WIDTH && l.maxX - l.minX < 80).flatMap((l) => l.pts)));
  const merged = trunkLoop(loops, 80);
  if (merged) {
    if (merged.maxX - merged.minX <= 2 * clipHalfWidth) return merged;
    const kept: number[] = [];
    for (let i = 0; i < merged.pts.length; i += 2) if (Math.abs(merged.pts[i]) <= clipHalfWidth) kept.push(merged.pts[i], merged.pts[i + 1]);
    if (kept.length >= 6) return asLoop(hull(kept));
    return merged;
  }
  const near = loops.filter((l) => (l.minX + l.maxX) / 2 > -TRUNK_HALF_WIDTH && (l.minX + l.maxX) / 2 < TRUNK_HALF_WIDTH && l.maxX - l.minX < 35);
  return asLoop(hull(near.flatMap((l) => l.pts)));
}

const centreOf = (l: Loop): [number, number] => [(l.minX + l.maxX) / 2, (l.minZ + l.maxZ) / 2];

/** Distance from (cx, cz) to the loop along each of n evenly spaced directions. */
export function polarRadii(loop: Loop, cx: number, cz: number, n = POLAR): number[] {
  const out: number[] = [];
  const pts = loop.pts;
  const m = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const th = (k / n) * Math.PI * 2;
    const dx = Math.cos(th), dz = Math.sin(th);
    let best = 0;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const ax = pts[i * 2] - cx, az = pts[i * 2 + 1] - cz;
      const ex = pts[j * 2] - pts[i * 2], ez = pts[j * 2 + 1] - pts[i * 2 + 1];
      const den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (ax * ez - az * ex) / den;
      const u = (ax * dz - az * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
    }
    out.push(best || (out[k - 1] ?? 5));
  }
  return out;
}

/** A garment ring around a body section: scaled to the circumference `C`, never inside the body. */
export function shellRing(y: number, loop: Loop, C: number, gap = GAP, widen = 1): Ring {
  const [cx, cz] = centreOf(loop);
  const base = polarRadii(loop, cx, cz);
  const s = Math.max(1, (C - 2 * Math.PI * gap) / loop.perimeter);
  const radii = base.map((r, k) => {
    const th = (k / POLAR) * Math.PI * 2;
    // `widen` stretches the shoulders sideways (drop shoulder) without changing the front-to-back depth.
    return r * s * (1 + (widen - 1) * Math.cos(th) ** 4) + gap;
  });
  const max = Math.max(...radii);
  return { y, cx, cz, a: max, b: max, radii, tint: C < loop.perimeter - 0.05 ? 1 : 0 };
}

export interface Decorations {
  /** Button centres, cm. */
  buttons: [number, number, number][];
  /** Flat patches on the cloth: centre, outward direction in x/z, size. */
  pockets: { pos: [number, number, number]; nx: number; nz: number; w: number; h: number }[];
}

export interface BodyGarment {
  parts: Part[];
  decorations: Decorations;
}

/** How each neckline is cut: front and back drop below the neck line, and how narrow the front dip is. */
const NECKLINES: Record<Neckline, { front: number; back: number; power: number; raise: number; rib: number }> = {
  crew: { front: 3.2, back: 0.8, power: 3, raise: 0, rib: 1.3 },
  scoop: { front: 8.5, back: 1.2, power: 2, raise: 0, rib: 1.3 },
  v: { front: 14, back: 1, power: 14, raise: 0, rib: 1.3 },
  boat: { front: 2.2, back: 1.4, power: 1, raise: 0, rib: 1.1 },
  collar: { front: 9, back: 0, power: 16, raise: 2.4, rib: 0 },
  henley: { front: 5, back: 0.8, power: 6, raise: 0, rib: 1.3 },
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function buildBodyGarment(fit: FitResult, bf: BodyFit): BodyGarment {
  const { garment: g } = fit;
  const pos = bf.positionsCm;
  const tris = bf.srcTris;
  const m = bf.measured;
  const H = m.heightCm;
  const parts: Part[] = [];
  // Half width of the torso, used to keep the arms out of the shoulder and armpit sections.
  const chestTrunk = trunkLoop(sliceLoops(pos, tris, m.chestY), TRUNK_HALF_WIDTH);
  const torsoHalf = chestTrunk ? (chestTrunk.maxX - chestTrunk.minX) / 2 : 20;
  const shoulderHalf = m.shoulderCm / 2;
  const clipHalf = (y: number) =>
    y >= m.shoulderY ? shoulderHalf * 1.08 : lerp(torsoHalf * 1.12, shoulderHalf * 1.08, smoothstep(m.chestY, m.shoulderY, y));
  const section = (y: number) => trunkSection(pos, tris, y, clipHalf(y), m.crotchY + 4);

  const neckBaseY = 0.818 * H;
  const hemY = Math.max(neckBaseY - g.lengthCm, 0.3 * H);
  const widenMax = clamp(g.shoulderCm / m.shoulderCm, 1, 1.3);
  const cut = NECKLINES[g.detail.neckline];

  // Target circumference along the height, piecewise linear between control levels.
  const neckY = 0.842 * H;
  const topY = neckY + cut.raise;
  const neck = section(neckY);
  const shoulderSection = section(m.shoulderY);
  const straightWaist = Math.max(g.waistCm, g.chestCm * 0.92);
  const hemCirc = Math.max(straightWaist, g.chestCm * 0.98);
  const controls: [number, number][] = [
    [topY, neck.perimeter + 2 * Math.PI * 1.6],
    [m.shoulderY, Math.max(g.chestCm * 0.95, shoulderSection.perimeter)],
    [m.chestY, g.chestCm],
    [m.waistY, straightWaist],
    [hemY, hemCirc],
  ].filter(([y], i, arr) => i === 0 || y < (arr[i - 1] as [number, number])[0] - 1) as [number, number][];
  const targetC = (y: number) => {
    for (let i = 1; i < controls.length; i++) {
      const [y0, c0] = controls[i - 1];
      const [y1, c1] = controls[i];
      if (y >= y1) return lerp(c1, c0, (y - y1) / Math.max(1e-6, y0 - y1));
    }
    return controls[controls.length - 1][1];
  };

  // Tint follows the fit labels: chest tint down to the chest, waist tint to the waist, hip tint below.
  const chestTint = g.chestCm < m.chestCm - 0.05 ? 1 : 0;
  const waistTint = fit.label.waist === 'tight' ? 1 : 0;
  const hipTint = hemCirc < m.hipsCm - 0.05 || waistTint ? 1 : 0;
  const tintAt = (y: number) =>
    y >= m.chestY ? chestTint : y >= m.waistY ? lerp(waistTint, chestTint, (y - m.waistY) / Math.max(1, m.chestY - m.waistY)) : lerp(hipTint, waistTint, (y - m.hipsY) / Math.max(1, m.waistY - m.hipsY));

  // Dense rings, each taken from the body's own section at that height, so the cloth always sits outside it.
  const rings: Ring[] = [];
  function ringAt(y: number): Ring {
    const widen = 1 + (widenMax - 1) * smoothstep(m.chestY, m.shoulderY, y);
    const r = shellRing(y, section(y), targetC(y), y > m.shoulderY ? GAP + 1.1 : y > m.chestY ? GAP + 0.7 : GAP, widen);
    r.tint = tintAt(y);
    return r;
  }
  for (let y = topY; y > hemY; y -= y > m.chestY ? 1.5 : 2.5) rings.push(ringAt(y));
  rings.push(ringAt(hemY));

  // ---- neckline: cut the top edge lower at the front (and a little at the back) ----
  const N = POLAR;
  const edgeY = (j: number) => {
    const th = (j / N) * Math.PI * 2;
    const front = Math.max(0, Math.sin(th)) ** cut.power; // +z is the front
    const back = Math.max(0, -Math.sin(th)) ** 2;
    return topY - (cut.back * back + (cut.back + (cut.front - cut.back) * front) * (1 - back));
  };
  const radiusAt = (j: number, y: number) => {
    for (let i = 1; i < rings.length; i++) {
      if (y >= rings[i].y) {
        const t = (y - rings[i].y) / Math.max(1e-6, rings[i - 1].y - rings[i].y);
        return lerp(rings[i].radii![j], rings[i - 1].radii![j], t);
      }
    }
    return rings[rings.length - 1].radii![j];
  };
  for (const r of rings) {
    r.ys = Array.from({ length: N }, (_, j) => Math.min(r.y, edgeY(j)));
    r.radii = r.radii!.map((v, j) => (r.y > edgeY(j) ? radiusAt(j, edgeY(j)) : v));
    // Rib band along the cut edge, and a slightly darker hem.
    r.trim = Array.from({ length: N }, (_, j) => {
      const below = edgeY(j) - r.y;
      const rib = cut.rib > 0 && below <= cut.rib ? 1 : 0;
      const hem = r.y - hemY < 1.1 ? 0.7 : 0;
      return Math.max(rib, hem);
    });
  }
  parts.push({ name: 'shirt', kind: 'garment', rings, origin: { x: 0, y: 0 }, rotZ: 0 });

  if (g.sleeveCm > 0.5) {
    for (const side of [1, -1] as const) {
      const sleeve = armSleeve(fit, bf, side);
      if (sleeve) parts.push(sleeve);
    }
  }
  // Briefs only matter where the top leaves the hips bare; under a long top they would just z-fight with it.
  if (hemY > m.crotchY + 2) parts.push(...briefs(bf));

  // ---- decorations ----
  const front = Math.round(N / 4); // direction +z
  const surfaceAt = (y: number, j: number): { x: number; z: number; r: number } => {
    for (let i = 1; i < rings.length; i++) {
      if (y >= rings[i].y) {
        const t = (y - rings[i].y) / Math.max(1e-6, rings[i - 1].y - rings[i].y);
        const a = rings[i], b = rings[i - 1];
        const r = lerp(a.radii![j], b.radii![j], t);
        const th = (j / N) * Math.PI * 2;
        return { x: lerp(a.cx, b.cx, t) + r * Math.cos(th), z: lerp(a.cz, b.cz, t) + r * Math.sin(th), r };
      }
    }
    const a = rings[rings.length - 1];
    const th = (j / N) * Math.PI * 2;
    return { x: a.cx + a.radii![j] * Math.cos(th), z: a.cz + a.radii![j] * Math.sin(th), r: a.radii![j] };
  };
  const deco: Decorations = { buttons: [], pockets: [] };
  const lowest = edgeY(front) - 2.2;
  if (g.detail.buttons === 'full') {
    for (let y = lowest; y > hemY + 5; y -= 8) {
      const p = surfaceAt(y, front);
      deco.buttons.push([p.x, y, p.z + 0.25]);
    }
  } else if (g.detail.buttons === 'placket') {
    for (let k = 0; k < 3; k++) {
      const y = lowest - k * 3.4;
      const p = surfaceAt(y, front);
      deco.buttons.push([p.x, y, p.z + 0.25]);
    }
  }
  if (g.detail.pocket) {
    // The wearer's left chest: +x as seen from the front.
    const y = m.chestY - 3;
    let jBest = front, bestDx = Infinity;
    for (let j = 0; j < N / 2; j++) {
      const p = surfaceAt(y, j);
      const dx = Math.abs(p.x - (shoulderHalf * 0.38 + torsoHalf * 0.25));
      if (dx < bestDx) { bestDx = dx; jBest = j; }
    }
    const p = surfaceAt(y, jBest);
    const th = (jBest / N) * Math.PI * 2;
    deco.pockets.push({ pos: [p.x, y, p.z + 0.12 * Math.sin(th)], nx: Math.cos(th), nz: Math.sin(th), w: 9, h: 10 });
  }
  return { parts, decorations: deco };
}

/** Plain briefs so the figure is not bare under short tops. */
function briefs(bf: BodyFit): Part[] {
  const pos = bf.positionsCm;
  const tris = bf.srcTris;
  const m = bf.measured;
  const H = m.heightCm;
  const out: Part[] = [];
  const topY = m.crotchY + 0.075 * H;
  const trunk: Ring[] = [];
  for (let y = topY; y > m.crotchY + 1; y -= 2.5) trunk.push(shellRing(y, trunkSection(pos, tris, y, Infinity, m.crotchY + 4), 0, 0.12));
  trunk.push(shellRing(m.crotchY + 1, trunkSection(pos, tris, m.crotchY + 1, Infinity, m.crotchY + 4), 0, 0.12));
  for (const r of trunk) r.tint = 0;
  out.push({ name: 'briefs', kind: 'garment', style: 'underwear', rings: trunk, origin: { x: 0, y: 0 }, rotZ: 0 });

  for (const side of [1, -1] as const) {
    const rings: Ring[] = [];
    for (let y = m.crotchY + 0.5; y > m.crotchY - 11; y -= 2.5) {
      const loops = sliceLoops(pos, tris, y).filter((l) => side * (l.minX + l.maxX) / 2 > 0 && l.maxX - l.minX < 35);
      if (!loops.length) continue;
      const l = loops.reduce((a, b) => (b.perimeter > a.perimeter ? b : a));
      rings.push(shellRing(y, l, 0, 0.12));
    }
    for (const r of rings) r.tint = 0;
    if (rings.length > 1) out.push({ name: side === 1 ? 'briefs-r' : 'briefs-l', kind: 'garment', style: 'underwear', rings, origin: { x: 0, y: 0 }, rotZ: 0 });
  }
  return out;
}

function armSleeve(fit: FitResult, bf: BodyFit, side: 1 | -1): Part | null {
  const { garment: g } = fit;
  const pos = bf.positionsCm;
  const m = bf.measured;
  const sx = side * (m.shoulderCm / 2 - 4.5);
  const sy = m.shoulderY - 4;
  // Fingertip: the vertex furthest out on this side, which gives the arm's direction.
  let fx = 0, fy = 0;
  for (let i = 0; i < pos.length; i += 3) if (side * pos[i] > side * fx) { fx = pos[i]; fy = pos[i + 1]; }
  const theta = Math.atan2(side * (fx - sx), sy - fy);
  const alpha = -side * theta;
  const ca = Math.cos(alpha), sa = Math.sin(alpha);

  // Rotate a copy so the arm hangs straight down from the shoulder joint.
  const rot = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const dx = pos[i] - sx, dy = pos[i + 1] - sy;
    rot[i] = sx + dx * ca - dy * sa;
    rot[i + 1] = sy + dx * sa + dy * ca;
    rot[i + 2] = pos[i + 2];
  }
  const armLoop = (d: number): Loop | null => {
    const loops = sliceLoops(rot, bf.srcTris, sy - d).filter((l) => l.minX < sx && l.maxX > sx);
    if (!loops.length) return null;
    return loops.reduce((a, b) => (b.perimeter < a.perimeter ? b : a));
  };

  // First distance at which the arm is its own loop (below the armpit).
  let dSep = 8;
  for (let d = 2; d < 20; d += 1) {
    const l = armLoop(d);
    if (l && l.maxX - l.minX < 18 && l.perimeter < 48) { dSep = d; break; }
  }
  const armLen = 0.33 * m.heightCm;
  const end = Math.min(g.sleeveCm + 2, armLen + 4);
  if (end <= dSep + 1) return null;
  const chestEase = fit.easeCm.chest;
  const gap = clamp(chestEase * 0.1, GAP, 3.5);
  const k = 1 + clamp(chestEase / 100, 0, 0.25);

  const rings: Ring[] = [];
  const dists = [dSep - 5, dSep - 2, ...Array.from({ length: Math.max(1, Math.floor((end - dSep) / 3)) }, (_, i) => dSep + (i + 1) * 3), end];
  let last: Loop | null = null;
  for (const d of dists) {
    const l: Loop | null = armLoop(Math.max(d, dSep)) ?? last;
    if (!l) continue;
    last = l;
    const [cx, cz] = centreOf(l);
    // Above the first separate loop the arm is joined to the shoulder (deltoid): cover it generously.
    const r = polarRadii(l, cx, cz).map((v) => v * k * (d < dSep ? 1.18 : 1) + gap);
    const max = Math.max(...r);
    rings.push({ y: -d, cx: cx - sx, cz, a: max, b: max, radii: r, tint: chestEase < 0 ? 1 : 0 });
  }
  if (rings.length < 2) return null;
  // Sleeve hem band, and a darker cuff band on sleeves that have one (applied after smoothing).
  const cuffed = fit.garment.detail.cuffs && fit.garment.sleeveStyle !== 'short';
  const smooth = smoothRings(rings, 2);
  for (const r of smooth) {
    const fromEnd = end + r.y; // ring y is minus the distance along the arm
    const hem = fromEnd < (cuffed ? 4 : 1.2);
    r.trim = r.radii!.map(() => (hem ? (cuffed ? 1 : 0.7) : 0));
  }
  return { name: side === 1 ? 'sleeve-r' : 'sleeve-l', kind: 'garment', rings: smooth, origin: { x: sx, y: sy }, rotZ: side * theta };
}

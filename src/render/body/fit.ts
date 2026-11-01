import type { BodyProfile } from '../../types';
import type { BodyAssets } from './assets';
import { defaultParams, morphPositions, weightSlider, type BodyParams, type Measure } from './morph';
import { sliceLoops, trunkLoop } from './slice';

export interface BodyMeasures {
  heightCm: number;
  chestCm: number;
  waistCm: number;
  hipsCm: number;
  shoulderCm: number;
  inseamCm: number;
  chestY: number;
  waistY: number;
  hipsY: number;
  crotchY: number;
  shoulderY: number;
}

export interface BodyFit {
  params: BodyParams;
  assets: BodyAssets;
  /** Triangles over the source vertices, for slicing. */
  srcTris: Uint32Array;
  /** Source-vertex positions in cm, feet on y = 0. */
  positionsCm: Float32Array;
  measured: BodyMeasures;
}

/** Trunk-only loops: the arms hang out in an A pose and must not count. */
const TRUNK_HALF_WIDTH_CM = 30;

/** Scale to cm, put the feet on y = 0 and the body centre line on x = 0. */
function toCm(pos: Float32Array, unitCm: number, targetHeightCm: number | null): Float32Array {
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) {
    minY = Math.min(minY, pos[i]);
    maxY = Math.max(maxY, pos[i]);
  }
  const s = targetHeightCm ? targetHeightCm / ((maxY - minY) * unitCm) : 1;
  const k = unitCm * s;
  const out = new Float32Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    out[i] = pos[i] * k;
    out[i + 1] = (pos[i + 1] - minY) * k;
    out[i + 2] = pos[i + 2] * k;
  }
  return out;
}

export function measureBody(pos: Float32Array, srcTris: Uint32Array): BodyMeasures {
  let maxY = -Infinity;
  for (let i = 1; i < pos.length; i += 3) maxY = Math.max(maxY, pos[i]);
  const H = maxY;
  const trunk = (y: number) => trunkLoop(sliceLoops(pos, srcTris, y), TRUNK_HALF_WIDTH_CM);

  const scan = (lo: number, hi: number, better: (a: number, b: number) => boolean) => {
    let best = { y: (lo + hi) / 2 * H, p: NaN };
    for (let f = lo; f <= hi; f += 0.5 / H) {
      const l = trunk(f * H);
      if (l && (Number.isNaN(best.p) || better(l.perimeter, best.p))) best = { y: f * H, p: l.perimeter };
    }
    return best;
  };
  // Crotch: walk down from the hips until a single loop around the centre line disappears.
  let crotchY = 0.56 * H;
  for (let y = 0.56 * H; y > 0.3 * H; y -= 0.5) {
    if (!trunk(y)) break;
    crotchY = y;
  }
  const chest = scan(0.64, 0.74, (a, b) => a > b);
  const waist = scan(0.56, 0.68, (a, b) => a < b);
  // The hips are the widest part of the pelvis, a hand's width above the crotch.
  const hips = scan(crotchY / H + 0.03, crotchY / H + 0.08, (a, b) => a > b);
  const shoulderY = 0.815 * H;
  const sh = sliceLoops(pos, srcTris, shoulderY).filter((l) => l.minX < 0 && l.maxX > 0).sort((a, b) => b.perimeter - a.perimeter)[0];

  return {
    heightCm: H,
    chestCm: chest.p,
    waistCm: waist.p,
    hipsCm: hips.p,
    shoulderCm: sh ? sh.maxX - sh.minX : NaN,
    inseamCm: crotchY,
    chestY: chest.y,
    waistY: waist.y,
    hipsY: hips.y,
    crotchY,
    shoulderY,
  };
}

/** Which modifier moves which measurement, and the profile value to reach. */
const FIT: { key: keyof BodyMeasures; modifiers: Measure[]; target: (p: BodyProfile) => number }[] = [
  { key: 'chestCm', modifiers: ['bust-circ'], target: (p) => p.chestCm },
  { key: 'waistCm', modifiers: ['waist-circ'], target: (p) => p.waistCm },
  { key: 'hipsCm', modifiers: ['hips-circ'], target: (p) => p.hipsCm },
  { key: 'shoulderCm', modifiers: ['shoulder-dist'], target: (p) => p.shoulderCm },
  { key: 'inseamCm', modifiers: ['upperleg-height', 'lowerleg-height'], target: (p) => p.inseamCm },
];

/** Shape the body to the user's measurements. */
export function fitBody(assets: BodyAssets, profile: BodyProfile, iterations = 4): BodyFit {
  const params = defaultParams(profile.gender);
  params.weight = weightSlider(profile.weightKg, profile.heightCm);
  const build = (p: BodyParams) => toCm(morphPositions(assets, p), assets.unitCm, profile.heightCm);

  // Slope of each measurement per unit of its modifier, measured on the starting body.
  const slope = new Map<Measure, number>();
  const probe = (modifiers: Measure[], key: keyof BodyMeasures, v: number) => {
    const q: BodyParams = { ...params, measures: {} };
    for (const m of modifiers) q.measures[m] = v;
    return measureBody(build(q), assets.srcTris)[key] as number;
  };
  for (const f of FIT) {
    const s = (probe(f.modifiers, f.key, 1) - probe(f.modifiers, f.key, -1)) / 2;
    for (const m of f.modifiers) slope.set(m, s || 1);
  }

  let pos = build(params);
  let measured = measureBody(pos, assets.srcTris);
  for (let it = 0; it < iterations; it++) {
    for (const f of FIT) {
      const err = f.target(profile) - (measured[f.key] as number);
      const s = slope.get(f.modifiers[0])!;
      for (const m of f.modifiers) {
        const w = (params.measures[m] ?? 0) + err / s;
        params.measures[m] = Math.max(-1.5, Math.min(1.5, w));
      }
    }
    pos = build(params);
    measured = measureBody(pos, assets.srcTris);
  }
  return { params, assets, srcTris: assets.srcTris, positionsCm: pos, measured };
}

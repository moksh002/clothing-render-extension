import type { Gender } from '../../types';
import type { BodyAssets } from './assets';

/** Measurement modifiers: weight -1..1 selects the `-decr` (negative) or `-incr` (positive) target. */
export const MEASURES = [
  'bust-circ',
  'underbust-circ',
  'waist-circ',
  'hips-circ',
  'thigh-circ',
  'calf-circ',
  'knee-circ',
  'ankle-circ',
  'upperarm-circ',
  'wrist-circ',
  'neck-circ',
  'shoulder-dist',
  'frontchest-dist',
  'napetowaist-dist',
  'waisttohip-dist',
  'upperarm-length',
  'lowerarm-length',
  'upperleg-height',
  'lowerleg-height',
  'neck-height',
] as const;
export type Measure = (typeof MEASURES)[number];

export interface BodyParams {
  gender: Gender;
  /** 0..1, 0.5 is average. */
  muscle: number;
  /** 0..1, 0.5 is average. */
  weight: number;
  race: { african: number; asian: number; caucasian: number };
  measures: Partial<Record<Measure, number>>;
}

export const defaultParams = (gender: Gender): BodyParams => ({
  gender,
  muscle: 0.5,
  weight: 0.5,
  race: { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 },
  measures: {},
});

/** MakeHuman's three-way slider: min / average / max weights summing to 1. */
function triWeights(v: number): { min: number; avg: number; max: number } {
  const min = Math.min(1, Math.max(0, 1 - 2 * v));
  const max = Math.min(1, Math.max(0, 2 * v - 1));
  return { min, avg: 1 - min - max, max };
}

/** Add `w * target` to the positions. */
function apply(assets: BodyAssets, out: Float32Array, name: string, w: number): void {
  if (Math.abs(w) < 1e-5) return;
  const t = assets.targets.get(name);
  if (!t) throw new Error(`missing target ${name}`);
  const k = w * t.scale;
  for (let i = 0; i < t.idx.length; i++) {
    const o = t.idx[i] * 3;
    out[o] += t.d[i * 3] * k;
    out[o + 1] += t.d[i * 3 + 1] * k;
    out[o + 2] += t.d[i * 3 + 2] * k;
  }
}

/** Body vertex positions (source vertices, decimetres) for a set of parameters. */
export function morphPositions(assets: BodyAssets, p: BodyParams): Float32Array {
  const out = new Float32Array(assets.positions);
  const g = p.gender;
  const other = g === 'men' ? 'female' : 'male';
  const gname = g === 'men' ? 'male' : 'female';
  void other;

  const m = triWeights(p.muscle);
  const w = triWeights(p.weight);
  const muscles = [['minmuscle', m.min], ['averagemuscle', m.avg], ['maxmuscle', m.max]] as const;
  const weights = [['minweight', w.min], ['averageweight', w.avg], ['maxweight', w.max]] as const;
  for (const [mn, mw] of muscles) {
    for (const [wn, ww] of weights) apply(assets, out, `universal-${gname}-young-${mn}-${wn}`, mw * ww);
  }
  for (const [race, rw] of Object.entries(p.race)) apply(assets, out, `${race}-${gname}-young`, rw);

  for (const [name, value] of Object.entries(p.measures) as [Measure, number][]) {
    if (!value) continue;
    apply(assets, out, `measure-${name}-${value >= 0 ? 'incr' : 'decr'}`, Math.abs(value));
  }
  return out;
}

/** Map weight (kg) and height to MakeHuman's 0..1 weight slider through BMI. */
export function weightSlider(weightKg: number, heightCm: number): number {
  const bmi = weightKg / (heightCm / 100) ** 2;
  // BMI 17 -> 0, 22 -> 0.5, 33 -> 1
  return bmi <= 22 ? Math.max(0, 0.5 * (bmi - 17) / 5) : Math.min(1, 0.5 + 0.5 * (bmi - 22) / 11);
}

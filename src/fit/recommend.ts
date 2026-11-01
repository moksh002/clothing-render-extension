import type { BodyProfile, Garment, Region } from '../types';
import { computeFit } from './engine';
import { SHOULDER_EASE_CM, STYLE_EASE_CM } from './fit-config';
import { findRow, sortSizeLabels } from './sizes';

/** How much each region counts when ranking sizes. Length and sleeves follow the size, so they do not discriminate. */
const WEIGHT: Partial<Record<Region, number>> = { chest: 1, waist: 0.5, shoulder: 0.5 };
/** A runner-up this close (weighted cm, either direction) to the intended ease is worth a mention. */
const NEARLY_RIGHT_CM = 4;

export interface SizeScore {
  size: string;
  /** Weighted cm away from the ease the cut is designed to have, tight sizes counting double; lower is better. */
  score: number;
  /** The same distance without that penalty. */
  off: number;
}

export interface SizeAdvice {
  best: string;
  /** The next-best size when it is nearly as good, so the shopper can choose by preference. */
  alsoConsider?: string;
  ranking: SizeScore[];
}

/** Being tighter than the cut intends is worse than being looser, so it costs double. */
const miss = (deltaCm: number) => (deltaCm < 0 ? -2 * deltaCm : deltaCm);

/**
 * Rank the sizes of a garment for one body by how close each gets to the ease the cut is designed to have
 * (a relaxed tee is meant to be about 16 cm bigger than the chest, a slim one 4 cm).
 * Returns null when fewer than one size can be fitted.
 */
export function recommendSize(profile: BodyProfile, garment: Garment, labels: string[]): SizeAdvice | null {
  const styleEase = garment.styleEase ?? 'regular';
  const target: Partial<Record<Region, number>> = { chest: STYLE_EASE_CM[styleEase], waist: STYLE_EASE_CM[styleEase], shoulder: SHOULDER_EASE_CM[styleEase] };

  const seen = new Set<string>();
  const ranking: SizeScore[] = [];
  for (const size of labels) {
    const row = findRow(garment.chart, size);
    if (!row || seen.has(row.label)) continue;
    seen.add(row.label);
    const fit = computeFit(profile, garment, size);
    if (!fit) continue;
    const est = fit.garment.estimated;
    let score = 0;
    let off = 0;
    for (const r of Object.keys(WEIGHT) as Region[]) {
      // Values the chart did not list are guesses that move with the chest, so they only break ties.
      if ((r === 'waist' && est.waist) || (r === 'shoulder' && est.shoulder)) continue;
      const d = fit.easeCm[r] - target[r]!;
      score += WEIGHT[r]! * miss(d);
      off += WEIGHT[r]! * Math.abs(d);
    }
    ranking.push({ size, score, off });
  }
  if (!ranking.length) return null;

  ranking.sort((a, b) => a.score - b.score);
  const [best, next] = ranking;
  return {
    best: best.size,
    ...(next && next.off <= NEARLY_RIGHT_CM && best.off <= NEARLY_RIGHT_CM ? { alsoConsider: next.size } : {}),
    ranking,
  };
}

/** Order two sizes smaller first. */
export const smallerFirst = (a: string, b: string) => sortSizeLabels([a, b]);

export interface ModelComparison {
  size: string;
  /** Body chest of the model's size, from the chart. */
  chestCm: number;
  /** Your chest minus that (negative: you are smaller than the model's size). */
  youMinusModelCm: number;
}

/**
 * Compare you with the body a size is cut for ("Model wears a size L"). The chart's chest for that row is the
 * body it is meant to fit, so the difference tells you whether the photos show about your fit, bigger or smaller.
 */
export function compareWithModel(profile: BodyProfile, garment: Garment, modelSize: string | undefined): ModelComparison | null {
  if (!modelSize) return null;
  const row = findRow(garment.chart, modelSize);
  if (!row || row.chestCm == null) return null;
  // Garment charts list the garment; take the cut's ease off to get the body it is made for.
  const flat = garment.chart.convention === 'garment-flat' ? 2 : 1;
  const ease = garment.chart.convention === 'body' ? 0 : STYLE_EASE_CM[garment.styleEase ?? 'regular'];
  const chestCm = row.chestCm * flat - ease;
  return { size: row.label, chestCm, youMinusModelCm: profile.chestCm - chestCm };
}

import type {
  BodyDims,
  BodyLandmark,
  BodyProfile,
  FitLabel,
  FitResult,
  Garment,
  GarmentDims,
  Region,
  SizeChart,
  SizeRow,
} from '../types';
import {
  DEFAULT_LENGTH_RATIO,
  DEFAULT_SLEEVE_STYLE,
  DEFAULT_STYLE_EASE,
  EASE_THRESHOLDS,
  FLAT_CHEST_MAX_CM,
  GARMENT_WAIST_PER_CHEST,
  HEM_LANDMARKS,
  PROPORTIONS,
  SHOULDER_EASE_CM,
  SLEEVE_LANDMARKS,
  SLEEVE_RATIO,
  STYLE_EASE_CM,
} from './fit-config';
import { findRow } from './sizes';

type BodyInput = Omit<BodyProfile, 'shoulderCm' | 'inseamCm'> &
  Partial<Pick<BodyProfile, 'shoulderCm' | 'inseamCm'>>;

/** FR-4: fill in dimensions the user did not give from height and gender. */
export function deriveBody(p: BodyInput): BodyDims {
  return {
    gender: p.gender,
    heightCm: p.heightCm,
    chestCm: p.chestCm,
    waistCm: p.waistCm,
    hipsCm: p.hipsCm,
    shoulderCm: p.shoulderCm ?? p.heightCm * PROPORTIONS.shoulderWidthPerHeight[p.gender],
    inseamCm: p.inseamCm ?? p.heightCm * PROPORTIONS.inseamPerHeight[p.gender],
    torsoLengthCm: p.heightCm * PROPORTIONS.torsoLengthPerHeight,
    armLengthCm: p.heightCm * PROPORTIONS.armLengthPerHeight,
  };
}

/** A chest under FLAT_CHEST_MAX_CM on an adult top is probably a flat (pit to pit) width. */
export function guessConvention(rows: SizeRow[]): 'garment-flat' | 'garment-circumference' {
  const chests = rows.map((r) => r.chestCm).filter((c): c is number => c != null);
  return chests.length > 0 && chests.every((c) => c < FLAT_CHEST_MAX_CM)
    ? 'garment-flat'
    : 'garment-circumference';
}

export function classify(region: Region, easeCm: number): FitLabel {
  const [b0, b1, b2, b3] = EASE_THRESHOLDS[region];
  if (easeCm < b0) return 'tight';
  if (easeCm < b1) return 'fitted';
  if (easeCm < b2) return 'true';
  if (easeCm < b3) return 'loose';
  return 'oversized';
}

function landmark<T extends BodyLandmark>(table: [number, T][], ratio: number): T {
  return table.find(([max]) => ratio < max)![1];
}

/** Garment dimensions for one chart row (FR-6/7, Fit logic step 1). */
export function garmentDims(row: SizeRow, chart: SizeChart, garment: Garment, body: BodyDims): GarmentDims {
  const styleEase = garment.styleEase ?? DEFAULT_STYLE_EASE;
  const sleeveStyle = garment.sleeveStyle ?? DEFAULT_SLEEVE_STYLE;
  const flat = chart.convention === 'garment-flat' ? 2 : 1;
  const isBody = chart.convention === 'body';
  const ease = isBody ? STYLE_EASE_CM[styleEase] : 0;

  // Chest: required on every chart.
  const chestCm = (row.chestCm ?? NaN) * flat + ease;

  const estimated = { waist: false, shoulder: false, length: false, sleeve: false };

  let waistCm: number;
  if (row.waistCm != null) waistCm = row.waistCm * flat + ease;
  else {
    waistCm = chestCm * GARMENT_WAIST_PER_CHEST;
    estimated.waist = true;
  }

  let shoulderCm: number;
  if (row.shoulderCm != null) shoulderCm = row.shoulderCm;
  else {
    // Estimate from the chart's own chest (body or garment) so it scales with size.
    const baseChest = (row.chestCm ?? NaN) * flat;
    shoulderCm = baseChest * PROPORTIONS.shoulderPerChest[body.gender] + (isBody ? SHOULDER_EASE_CM[styleEase] : 0);
    estimated.shoulder = true;
  }

  let lengthCm: number;
  if (row.lengthCm != null) lengthCm = row.lengthCm;
  else {
    lengthCm = body.heightCm * DEFAULT_LENGTH_RATIO[styleEase];
    estimated.length = true;
  }

  let sleeveCm: number;
  if (row.sleeveCm != null) sleeveCm = row.sleeveCm;
  else {
    sleeveCm = body.armLengthCm * SLEEVE_RATIO[sleeveStyle];
    estimated.sleeve = true;
  }

  return {
    sizeLabel: row.label,
    convention: chart.convention,
    styleEase,
    sleeveStyle,
    chestCm,
    waistCm,
    shoulderCm,
    lengthCm,
    sleeveCm,
    estimated,
  };
}

/**
 * Fit a garment size on a body. Returns null when the size is not in the chart
 * or the chart row has no chest value to work from.
 */
export function computeFit(profile: BodyInput, garment: Garment, sizeLabel: string): FitResult | null {
  const row = findRow(garment.chart, sizeLabel);
  if (!row || row.chestCm == null) return null;

  const body = deriveBody(profile);
  const g = garmentDims(row, garment.chart, garment, body);

  const expectedSleeve = body.armLengthCm * SLEEVE_RATIO[g.sleeveStyle];
  const easeCm: Record<Region, number> = {
    chest: g.chestCm - body.chestCm,
    waist: g.waistCm - body.waistCm,
    shoulder: g.shoulderCm - body.shoulderCm,
    length: g.lengthCm - body.torsoLengthCm,
    sleeve: g.sleeveCm - expectedSleeve,
  };

  const regions = Object.keys(easeCm) as Region[];
  const label = Object.fromEntries(regions.map((r) => [r, classify(r, easeCm[r])])) as Record<Region, FitLabel>;

  return {
    body,
    garment: g,
    easeCm,
    label,
    hemAt: landmark(HEM_LANDMARKS, g.lengthCm / body.torsoLengthCm),
    sleeveEndsAt: landmark(SLEEVE_LANDMARKS, g.sleeveCm / body.armLengthCm),
  };
}

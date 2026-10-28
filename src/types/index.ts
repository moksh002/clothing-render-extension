export type Gender = 'men' | 'women';
export type Region = 'chest' | 'waist' | 'shoulder' | 'length' | 'sleeve';
export type FitLabel = 'tight' | 'fitted' | 'true' | 'loose' | 'oversized';
export type StyleEase = 'slim' | 'regular' | 'relaxed' | 'oversized';
export type SleeveStyle = 'sleeveless' | 'short' | 'three-quarter' | 'long';

export interface BodyProfile {
  gender: Gender;
  heightCm: number;
  weightKg: number;
  /** Chest for men, bust for women. */
  chestCm: number;
  waistCm: number;
  hipsCm: number;
  shoulderCm: number;
  inseamCm: number;
}

export interface SizeRow {
  label: string;
  /** Other names for the same size, e.g. the alpha size on a numeric row. */
  aliases?: string[];
  chestCm?: number;
  waistCm?: number;
  hipsCm?: number;
  lengthCm?: number;
  shoulderCm?: number;
  sleeveCm?: number;
}

export type ChartConvention = 'garment-circumference' | 'garment-flat' | 'body';

export interface SizeChart {
  convention: ChartConvention;
  rows: SizeRow[];
  source?: ChartSource;
}

export type StoreId = 'target' | 'myer' | 'kmart';

export interface ChartSource {
  store: StoreId;
  chartName: string;
  url: string;
  method: 'live' | 'rule' | 'snapshot' | 'manual';
  /** ISO date; snapshots carry 2026-10-28. */
  retrievedAt: string;
  /** Which resolver step produced the chart (4 live, 5 rule, 6 snapshot, 7 manual). */
  step: 4 | 5 | 6 | 7;
}

export interface ProductFacts {
  store: StoreId;
  url: string;
  title: string;
  brand?: string;
  breadcrumb: string[];
  sizeLabels: string[];
  /** Raw fit lines, for example 'Regular fit'. */
  fitText: string[];
  /** All product feature bullets, used for sleeve style. */
  features: string[];
  modelSize?: string;
}

export interface Garment {
  title: string;
  imageUrl?: string;
  chart: SizeChart;
  styleEase?: StyleEase;
  sleeveStyle?: SleeveStyle;
}

/** Positions on the body where a hem or sleeve can end, top to bottom. */
export type BodyLandmark =
  | 'shoulder'
  | 'upper-arm'
  | 'elbow'
  | 'forearm'
  | 'wrist'
  | 'hand'
  | 'waist'
  | 'hip'
  | 'upper-thigh'
  | 'mid-thigh';

export interface BodyDims {
  gender: Gender;
  heightCm: number;
  chestCm: number;
  waistCm: number;
  hipsCm: number;
  shoulderCm: number;
  inseamCm: number;
  /** Base of neck to hip. */
  torsoLengthCm: number;
  /** Shoulder to wrist. */
  armLengthCm: number;
}

export interface GarmentDims {
  sizeLabel: string;
  convention: ChartConvention;
  styleEase: StyleEase;
  sleeveStyle: SleeveStyle;
  chestCm: number;
  waistCm: number;
  shoulderCm: number;
  lengthCm: number;
  sleeveCm: number;
  /** True where the value was estimated because the chart did not provide it. */
  estimated: Record<'waist' | 'shoulder' | 'length' | 'sleeve', boolean>;
}

/** Renderer-agnostic result of fitting a garment size on a body. */
export interface FitResult {
  body: BodyDims;
  garment: GarmentDims;
  easeCm: Record<Region, number>;
  label: Record<Region, FitLabel>;
  hemAt: BodyLandmark;
  sleeveEndsAt: BodyLandmark;
}

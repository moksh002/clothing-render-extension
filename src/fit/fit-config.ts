// Every number that drives fit lives here. All are starting defaults to be
// tuned by eye (milestone 9). Lengths are in cm.
import type { Gender, Region, SleeveStyle, StyleEase } from '../types';

/** Ascending breakpoints [b0,b1,b2,b3]: <b0 tight, <b1 fitted, <b2 true, <b3 loose, else oversized. */
export const EASE_THRESHOLDS: Record<Region, [number, number, number, number]> = {
  chest: [0, 6, 14, 22],
  waist: [0, 6, 14, 22],
  shoulder: [0, 2, 4, 8],
  // length ease = garment length - torso length (base of neck to hip)
  length: [0, 10, 22, 32],
  // sleeve ease = garment sleeve - the arm length the sleeve style should reach
  sleeve: [-4, -1, 3, 7],
};

/** Added to a body-measurement chart to get the garment circumference. */
export const STYLE_EASE_CM: Record<StyleEase, number> = {
  slim: 4,
  regular: 10,
  relaxed: 16,
  oversized: 24,
};

/** Extra shoulder width over the body (oversized = dropped shoulder). */
export const SHOULDER_EASE_CM: Record<StyleEase, number> = {
  slim: 0,
  regular: 3,
  relaxed: 5,
  oversized: 9,
};

/** Garment length as a fraction of height, used when the chart has no length. */
export const DEFAULT_LENGTH_RATIO: Record<StyleEase, number> = {
  slim: 0.38,
  regular: 0.4,
  relaxed: 0.42,
  oversized: 0.44,
};

/** Sleeve length as a fraction of arm length, by sleeve style. */
export const SLEEVE_RATIO: Record<SleeveStyle, number> = {
  sleeveless: 0,
  short: 0.4,
  'three-quarter': 0.75,
  long: 1,
};

export const DEFAULT_SLEEVE_STYLE: SleeveStyle = 'short';
export const DEFAULT_STYLE_EASE: StyleEase = 'regular';

/** Proportion ratios used to derive missing body dimensions (FR-4). */
export const PROPORTIONS = {
  torsoLengthPerHeight: 0.3,
  armLengthPerHeight: 0.33,
  shoulderWidthPerHeight: { men: 0.255, women: 0.23 } satisfies Record<Gender, number>,
  inseamPerHeight: { men: 0.46, women: 0.45 } satisfies Record<Gender, number>,
  /** Shoulder width as a fraction of chest circumference, to estimate a garment shoulder. */
  shoulderPerChest: { men: 0.45, women: 0.42 } satisfies Record<Gender, number>,
};

/** Garment waist circumference as a fraction of chest when the chart has no waist (straight cut). */
export const GARMENT_WAIST_PER_CHEST = 1;

/** A chest below this on an adult top is assumed to be a flat (pit to pit) width. */
export const FLAT_CHEST_MAX_CM = 80;

/** Hem position from garment length / torso length. Upper bounds, ascending. */
export const HEM_LANDMARKS: [number, 'waist' | 'hip' | 'upper-thigh' | 'mid-thigh'][] = [
  [0.8, 'waist'],
  [1.1, 'hip'],
  [1.45, 'upper-thigh'],
  [Infinity, 'mid-thigh'],
];

/** Sleeve end from garment sleeve / arm length. Upper bounds, ascending. */
export const SLEEVE_LANDMARKS: [number, 'shoulder' | 'upper-arm' | 'elbow' | 'forearm' | 'wrist' | 'hand'][] = [
  [0.1, 'shoulder'],
  [0.5, 'upper-arm'],
  [0.62, 'elbow'],
  [0.92, 'forearm'],
  [1.05, 'wrist'],
  [Infinity, 'hand'],
];

/** 2D front-view width = factor * circumference (same factor for body and garment). */
export const RENDER_WIDTH_FACTOR = { chest: 0.37, waist: 0.34, hips: 0.37 };

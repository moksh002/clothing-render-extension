import type { SleeveStyle, StyleEase } from '../types';
import { DEFAULT_STYLE_EASE } from './fit-config';

/** FR-25: map fit keywords in product text to a style ease. */
export function styleEaseFromText(texts: string[]): StyleEase {
  const t = texts.join(' ').toLowerCase();
  if (/oversized|drop(ped)? shoulder/.test(t)) return 'oversized';
  if (/relaxed|loose/.test(t)) return 'relaxed';
  if (/\bslim\b|fitted/.test(t)) return 'slim';
  if (/regular/.test(t)) return 'regular';
  return DEFAULT_STYLE_EASE;
}

/** Best-effort sleeve style from a product title / description. */
export function sleeveStyleFromText(texts: string[]): SleeveStyle | undefined {
  const t = texts.join(' ').toLowerCase();
  if (/sleeveless|tank|singlet|camisole/.test(t)) return 'sleeveless';
  if (/3\/4|three.?quarter/.test(t)) return 'three-quarter';
  if (/long.?sleeve|hoodie|hoody|jumper|sweater|sweatshirt|pullover|cardigan/.test(t)) return 'long';
  if (/short.?sleeve|t-?shirt|\btee\b/.test(t)) return 'short';
  return undefined;
}

import type { GarmentDetail, Neckline, ProductFacts } from '../types';

export const DEFAULT_DETAIL: GarmentDetail = { neckline: 'crew', buttons: 'none', cuffs: false, pocket: false };

/** Neckline, closure, cuffs and pocket from the product title, bullets and category. */
export function detailFromFacts(facts: Pick<ProductFacts, 'title' | 'features' | 'breadcrumb'>): GarmentDetail {
  const text = [facts.title, ...facts.features].join(' ').toLowerCase();
  const leaf = (facts.breadcrumb[facts.breadcrumb.length - 1] ?? '').toLowerCase();
  // "Shirts" is a collared garment; "T Shirts" is not.
  const isShirt = /(^|[^a-z])shirts?$/.test(leaf) && !/t[\s-]?shirts?$/.test(leaf);

  let neckline: Neckline = 'crew';
  if (/\bv[\s-]?neck/.test(text)) neckline = 'v';
  else if (/scoop/.test(text)) neckline = 'scoop';
  else if (/boat|bateau/.test(text)) neckline = 'boat';
  else if (/henley|placket/.test(text)) neckline = 'henley';
  else if (/\bpolo\b|collar|button[\s-]?down|business shirt/.test(text) || isShirt) neckline = 'collar';
  else if (/crew|round neck/.test(text)) neckline = 'crew';

  const polo = /\bpolo\b/.test(text);
  let buttons: GarmentDetail['buttons'] = 'none';
  if (neckline === 'collar' && !polo) buttons = 'full';
  else if (neckline === 'henley' || polo) buttons = 'placket';

  return { neckline, buttons, cuffs: /cuff/.test(text), pocket: /pocket/.test(text) };
}

import { detailFromFacts } from '../fit/detail';
import { sleeveStyleFromText, styleEaseFromText } from '../fit/style';
import type { Garment, ProductFacts, SizeChart } from '../types';

/** Combine scraped facts and a resolved chart into the Garment the fit engine uses. */
export function buildGarment(facts: ProductFacts, chart: SizeChart, imageUrl?: string): Garment {
  const root = facts.breadcrumb[0]?.toLowerCase();
  const gender = root === 'men' || root === 'mens' ? 'men' : root === 'women' || root === 'womens' ? 'women' : undefined;
  return {
    title: facts.title,
    ...(gender ? { gender } : {}),
    chart,
    ...(imageUrl ? { imageUrl } : {}),
    styleEase: styleEaseFromText([...facts.fitText, facts.title]),
    sleeveStyle: sleeveStyleFromText([facts.title, ...facts.features]),
    detail: detailFromFacts(facts),
  };
}

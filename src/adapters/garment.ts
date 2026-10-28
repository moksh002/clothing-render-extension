import { sleeveStyleFromText, styleEaseFromText } from '../fit/style';
import type { Garment, ProductFacts, SizeChart } from '../types';

/** Combine scraped facts and a resolved chart into the Garment the fit engine uses. */
export function buildGarment(facts: ProductFacts, chart: SizeChart, imageUrl?: string): Garment {
  return {
    title: facts.title,
    chart,
    ...(imageUrl ? { imageUrl } : {}),
    styleEase: styleEaseFromText([...facts.fitText, facts.title]),
    sleeveStyle: sleeveStyleFromText([facts.title, ...facts.features]),
  };
}

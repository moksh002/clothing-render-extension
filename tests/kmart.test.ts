// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyPage, resolveChart } from '../src/adapters';
import { buildGarment } from '../src/adapters/garment';
import { kmartAdapter, planKmartChart, readKmartSizeGuide } from '../src/adapters/kmart';
import type { ResolveDeps } from '../src/adapters/types';
import { computeFit } from '../src/fit/engine';
import { findRow } from '../src/fit/sizes';
import type { BodyProfile, ProductFacts } from '../src/types';

const fx = (n: string) => readFileSync(`tests/fixtures/${n}`, 'utf8');
const K1_URL = 'https://www.kmart.com.au/product/oversized-print-t-shirt-s175529/?selectedSwatch=Gry+Taco';

/** K1 page where clicking "Size guide" opens the popup, like the live site. */
function k1Page(opts: { popup?: boolean } = {}): Document {
  const doc = new DOMParser().parseFromString(fx('K1-kmart-men.html'), 'text/html');
  if (opts.popup === false) return doc;
  doc.querySelector('[data-testid=size-guide-btn]')!.addEventListener('click', () => {
    const holder = doc.createElement('div');
    holder.innerHTML = fx('K1-kmart-sizeguide-dialog.html');
    const modal = holder.firstElementChild as HTMLElement;
    modal.querySelector('[data-testid=modal-close]')!.addEventListener('click', () => modal.remove());
    doc.body.appendChild(modal);
  });
  return doc;
}

const facts = (doc: Document) => kmartAdapter.extract(doc, new URL(K1_URL))!.facts;
const now = () => new Date('2026-10-29T00:00:00Z');
const noFetch: ResolveDeps['fetchText'] = async () => { throw new Error('no network'); };

describe('Kmart page classification', () => {
  it('detects product pages and ignores the colour query', () => {
    expect(classifyPage(new URL(K1_URL)).kind).toBe('product');
    expect(classifyPage(new URL('https://www.kmart.com.au/product/some-top-s123/')).kind).toBe('product');
    expect(classifyPage(new URL('https://www.kmart.com.au/category/men/mens-tops/')).kind).toBe('not-product');
    expect(kmartAdapter.isProductPage(new URL('https://www.kmart.com.au/'))).toBe(false);
  });
});

describe('Kmart product facts (K1)', () => {
  it('reads title, breadcrumb, sizes, fit and model size', () => {
    const f = facts(k1Page({ popup: false }));
    expect(f.title).toBe('Oversized Print T-shirt');
    expect(f.url).toBe('https://www.kmart.com.au/product/oversized-print-t-shirt-s175529/');
    expect(f.breadcrumb).toEqual(['Mens', 'Clothing', 'Tops', 'T Shirts']);
    expect(f.sizeLabels).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL']);
    expect(f.fitText).toEqual(['Drop shoulder design', 'Oversized fit']);
    expect(f.modelSize).toBe('M');
    expect(f.brand).toBeUndefined();
    const g = buildGarment(f, { convention: 'body', rows: [{ label: 'M', chestCm: 99 }] });
    expect(g.styleEase).toBe('oversized');
    expect(g.sleeveStyle).toBe('short');
  });

  it('finds the main product photo', () => {
    const r = kmartAdapter.extract(k1Page({ popup: false }), new URL(K1_URL))!;
    expect(r.imageUrl).toBe('https://assets.kmart.com.au/transform/63a7ba14-fa59-4ba3-8a74-e5ccd3b8ff5b/74111084-1');
  });

  it('ignores the site menu lists', () => {
    expect(facts(k1Page({ popup: false })).features.join(' ')).not.toContain('Plus Size');
  });
});

describe('Kmart size guide popup', () => {
  it('reads the men tables, then leaves the page as it was', async () => {
    const doc = k1Page();
    const before = doc.documentElement.innerHTML;
    const charts = (await readKmartSizeGuide(doc, 'men', 1000))!;
    // Pants and underwear tables list a waist only, so they are not top charts and are skipped.
    expect(Object.keys(charts)).toEqual(['Mens Tops & Jackets', 'Mens Shirts', 'Mens Sleepwear Tops']);
    expect(findRow(charts['Mens Tops & Jackets'], 'M')).toMatchObject({ chestCm: 99 });
    expect(findRow(charts['Mens Shirts'], 'M')).toMatchObject({ chestCm: 99 }); // neck column is not chest
    expect(doc.querySelector('[data-testid=size-guide-modal]')).toBeNull();
    expect(doc.documentElement.innerHTML).toBe(before);
  });

  it('reads the women tables with bust, waist and hip', async () => {
    const charts = (await readKmartSizeGuide(k1Page(), 'women', 1000))!;
    expect(findRow(charts['Tops, Bottoms, Dresses & Jackets'], '10')).toMatchObject({ chestCm: 90, waistCm: 71, hipsCm: 96 });
    expect(findRow(charts['Plus size: tops, bottoms, dresses & jackets'], '18')).toMatchObject({ chestCm: 114 });
  });

  it('returns null when there is no button or the popup never opens', async () => {
    expect(await readKmartSizeGuide(new DOMParser().parseFromString('<p>x</p>', 'text/html'), 'men', 100)).toBeNull();
    expect(await readKmartSizeGuide(k1Page({ popup: false }), 'men', 200)).toBeNull();
  });
});

describe('Kmart chart resolver', () => {
  it('K1 resolves Mens Tops & Jackets from the popup (step 4) and every size matches', async () => {
    const doc = k1Page();
    const f = facts(doc);
    const r = await resolveChart(f, { fetchText: noFetch, now, doc, popupTimeoutMs: 1000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toMatchObject({ store: 'kmart', chartName: 'Mens Tops & Jackets', method: 'live', step: 4 });
    expect(r.chart.convention).toBe('body');
    for (const s of f.sizeLabels) expect(findRow(r.chart, s), `size ${s}`).not.toBeNull();
    expect(findRow(r.chart, 'XXL')).toMatchObject({ label: '2XL', chestCm: 117 });
  });

  it('feeds the fit engine: oversized tee on a 99 cm chest in size M', async () => {
    const doc = k1Page();
    const f = facts(doc);
    const r = await resolveChart(f, { fetchText: noFetch, now, doc, popupTimeoutMs: 1000 });
    if (!r.ok) throw new Error('expected chart');
    const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 99, waistCm: 85, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };
    const fit = computeFit(man, buildGarment(f, r.chart), 'M')!;
    expect(fit.garment.chestCm).toBe(123); // 99 + oversized 24
    expect(fit.label.chest).toBe('oversized');
  });

  it('falls back to the paste path when the popup cannot be read', async () => {
    const doc = k1Page({ popup: false });
    const r = await resolveChart(facts(doc), { fetchText: noFetch, now, doc, popupTimeoutMs: 200 });
    expect(r).toMatchObject({ ok: false, reason: 'no-chart' });
    expect(!r.ok && r.message).toMatch(/paste/i);
  });

  it('uses Target rules and data for Target-branded items, flagged as rule (FR-23)', async () => {
    const cms = fx('target-cms-UIRPDPModalSizeChartsPage.json');
    const target: ProductFacts = {
      store: 'kmart', url: 'https://www.kmart.com.au/product/target-curve-plus-size-australian-cotton-long-sleeve-stripe-top-s444233/',
      title: 'Target Curve Plus Size Australian Cotton Long Sleeve Stripe Top', brand: 'Target',
      breadcrumb: ['Womens', 'Clothing', 'Tops'], sizeLabels: ['16+', '18+'], fitText: [], features: [],
    };
    const asked: string[] = [];
    const r = await resolveChart(target, { fetchText: async (u) => { asked.push(u); return cms; }, now });
    expect(asked[0]).toContain('target.com.au');
    expect(r.ok && r.source).toMatchObject({ store: 'target', chartName: "Women's Plus Size / Curve", method: 'rule', step: 5 });
  });

  it('never applies a Target chart to a Kmart-branded item', async () => {
    const doc = k1Page();
    const asked: string[] = [];
    await resolveChart(facts(doc), { fetchText: async (u) => { asked.push(u); return ''; }, now, doc, popupTimeoutMs: 1000 });
    expect(asked).toEqual([]);
  });
});

describe('Kmart rule table', () => {
  const base: ProductFacts = { store: 'kmart', url: '', title: 'Top', breadcrumb: ['Womens', 'Clothing', 'Tops'], sizeLabels: [], fitText: [], features: [] };
  const pick = (o: Partial<ProductFacts>) => { const p = planKmartChart({ ...base, ...o }); return p.ok ? String(p.pick) : p.reason; };

  it('selects the chart', () => {
    expect(pick({})).toBe('/^Tops, Bottoms/i');
    expect(pick({ title: 'Plus Size Tee' })).toBe('/^Plus size/i');
    expect(pick({ title: 'Maternity Tee' })).toBe('/^Maternity/i');
    expect(pick({ breadcrumb: ['Mens', 'Clothing', 'Tops', 'T Shirts'] })).toBe('/^Mens Tops/i');
    expect(pick({ breadcrumb: ['Mens', 'Clothing', 'Tops', 'Shirts'] })).toBe('/^Mens Shirts/i');
    expect(pick({ breadcrumb: ['Mens', 'Sleepwear', 'Tops'], title: 'Pyjama Top' })).toBe('/^Mens Sleepwear Tops/i');
  });

  it('rejects kids and non-tops', () => {
    expect(pick({ breadcrumb: ['Kids', 'Tops'] })).toBe('unsupported-category');
    expect(pick({ breadcrumb: ['Mens', 'Clothing', 'Pants'] })).toBe('not-a-top');
  });
});

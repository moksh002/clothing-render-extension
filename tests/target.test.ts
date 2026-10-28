// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyPage, resolveChart } from '../src/adapters';
import { parseTargetCms, planTargetChart, targetAdapter, targetStyleEase } from '../src/adapters/target';
import { TARGET_SNAPSHOTS } from '../src/adapters/target-snapshots';
import type { ResolveDeps } from '../src/adapters/types';
import { parseNumber, readTable, tableToChart } from '../src/fit/chart-table';
import { computeFit } from '../src/fit/engine';
import { findRow } from '../src/fit/sizes';
import { sleeveStyleFromText } from '../src/fit/style';
import type { BodyProfile, ProductFacts } from '../src/types';

const fx = (name: string) => readFileSync(`tests/fixtures/${name}`, 'utf8');
const cmsJson = fx('target-cms-UIRPDPModalSizeChartsPage.json');
const load = (name: string) => new DOMParser().parseFromString(fx(name), 'text/html');

const liveDeps: ResolveDeps = { fetchText: async () => cmsJson, now: () => new Date('2026-10-29T00:00:00Z') };
const deadDeps: ResolveDeps = { fetchText: async () => { throw new Error('offline'); }, now: liveDeps.now };

const PAGES = {
  T1: { file: 'T1-target-men.html', url: 'https://www.target.com.au/p/australian-cotton-relaxed-t-shirt/73125303' },
  T2: { file: 'T2-target-women.html', url: 'https://www.target.com.au/p/european-linen-3-4-sleeve-femme-popover-blouse/73109822' },
  T3: { file: 'T3-target-plus-business-shirt.html', url: 'https://www.target.com.au/p/plus-size-australian-cotton-business-shirt/73190387' },
  T4: { file: 'T4-target-men-linen-shirt.html', url: 'https://www.target.com.au/p/european-linen-long-sleeve-shirt/73225584' },
  T5: { file: 'T5-target-women-slub-tee.html', url: 'https://www.target.com.au/p/australian-cotton-slub-relaxed-v-neck-t-shirt/73068228' },
} as const;

const facts = (k: keyof typeof PAGES): ProductFacts => {
  const r = targetAdapter.extract(load(PAGES[k].file), new URL(PAGES[k].url));
  expect(r).not.toBeNull();
  return r!.facts;
};

describe('page classification (FR-17, FR-18)', () => {
  it('routes by hostname and path', () => {
    expect(classifyPage(new URL(PAGES.T1.url)).kind).toBe('product');
    expect(classifyPage(new URL('https://www.target.com.au/p/some-top/W4150336344')).kind).toBe('product');
    expect(classifyPage(new URL('https://www.target.com.au/c/men/tops/W133028')).kind).toBe('not-product');
    expect(classifyPage(new URL('https://www.target.com.au/search?q=shirt')).kind).toBe('not-product');
    expect(classifyPage(new URL('https://www.myer.com.au/p/some-tee')).kind).toBe('myer-planned');
    expect(classifyPage(new URL('https://www.example.com/p/x/123')).kind).toBe('unsupported');
  });
});

describe('Target product facts (FR-19)', () => {
  it('T1 men: relaxed tee', () => {
    const f = facts('T1');
    expect(f.title).toContain('Australian Cotton Relaxed T-Shirt');
    expect(f.breadcrumb).toEqual(['Men', 'Tops', 'T-Shirts']);
    expect(f.sizeLabels).toEqual(['S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
    expect(f.fitText).toContain('Relaxed fit');
    expect(f.modelSize).toBe('L');
    expect(targetStyleEase(f)).toBe('relaxed');
    expect(sleeveStyleFromText([f.title, ...f.features])).toBe('short');
  });

  it('T2 women: regular blouse with 3/4 sleeves', () => {
    const f = facts('T2');
    expect(f.breadcrumb).toEqual(['Women', 'Tops', 'Blouses']);
    expect(f.sizeLabels).toEqual(['6', '8', '10', '12', '14', '16', '18', '20']);
    expect(f.modelSize).toBe('10');
    expect(targetStyleEase(f)).toBe('regular');
    expect(sleeveStyleFromText([f.title, ...f.features])).toBe('three-quarter');
  });

  it('reads the product image and the size guide trigger', () => {
    const r = targetAdapter.extract(load(PAGES.T1.file), new URL(PAGES.T1.url))!;
    expect(r.imageUrl).toMatch(/assets\.target\.com\.au\/transform\//);
    // asks for a small size, not the page's 1400x1600
    expect(r.imageUrl).toContain('width%3A320%2Cheight%3A400');
    expect(r.sizeGuideEl?.getAttribute('data-testid')).toBe('size-guide-link');
  });
});

describe('live Size Guide data', () => {
  it('parses every top chart from the CMS payload', () => {
    const charts = parseTargetCms(cmsJson);
    expect(Object.keys(charts).sort()).toEqual(['maternity', 'men-tops', 'petite', 'plus', 'womenswear']);
    // womenswear ranges become midpoints: size 10 bust 89-93 -> 91
    expect(findRow(charts.womenswear!.chart, '10')).toMatchObject({ chestCm: 91, waistCm: 73, hipsCm: 99 });
    // plus chart has single values
    expect(findRow(charts.plus!.chart, '18+')).toMatchObject({ chestCm: 120, waistCm: 108.5 });
  });

  it('keeps XXXL and 3XL as separate rows on the men’s chart (spec open point)', () => {
    const chart = parseTargetCms(cmsJson)['men-tops']!.chart;
    expect(findRow(chart, 'XXXL')).toMatchObject({ label: '40', chestCm: 120 });
    expect(findRow(chart, '3XL')).toMatchObject({ label: '42', chestCm: 122 });
    expect(findRow(chart, 'XXL')).toMatchObject({ label: '38', chestCm: 114 });
  });

  it('bundled snapshots match the saved live payload', () => {
    expect(TARGET_SNAPSHOTS).toEqual(parseTargetCms(cmsJson));
  });
});

describe('chart resolver on saved pages', () => {
  const cases: [keyof typeof PAGES, string][] = [
    ['T1', "Men's - Tops / Shirts / Jackets"],
    ['T2', 'Womenswear'],
    ['T3', "Men's - Tops / Shirts / Jackets"],
    ['T4', "Men's - Tops / Shirts / Jackets"],
    ['T5', 'Womenswear'],
  ];
  for (const [k, name] of cases) {
    it(`${k} resolves ${name} live (step 4) and every size matches a row`, async () => {
      const f = facts(k);
      const r = await resolveChart(f, liveDeps);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.source).toMatchObject({ store: 'target', chartName: name, method: 'live', step: 4, retrievedAt: '2026-10-29' });
      expect(r.chart.convention).toBe('body');
      for (const s of f.sizeLabels) expect(findRow(r.chart, s), `size ${s}`).not.toBeNull();
    });

    it(`${k} falls back to the snapshot (step 6) when the live read fails`, async () => {
      const r = await resolveChart(facts(k), deadDeps);
      expect(r.ok && r.source).toMatchObject({ chartName: name, method: 'snapshot', step: 6, retrievedAt: '2026-10-28' });
    });
  }

  it('T1 sizes map to the expected chest values (XXXL is chest 120)', async () => {
    const r = await resolveChart(facts('T1'), liveDeps);
    if (!r.ok) throw new Error('expected chart');
    const chest = (s: string) => findRow(r.chart, s)!.chestCm;
    expect([chest('S'), chest('M'), chest('L'), chest('XL'), chest('XXL'), chest('XXXL')]).toEqual([92, 97, 102, 108, 114, 120]);
  });

  it('feeds the fit engine end to end', async () => {
    const f = facts('T1');
    const r = await resolveChart(f, liveDeps);
    if (!r.ok) throw new Error('expected chart');
    const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 102, waistCm: 86, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };
    const fit = computeFit(man, { title: f.title, chart: r.chart, styleEase: targetStyleEase(f) }, 'L')!;
    // body chart row L = 102 + relaxed 16 = 118
    expect(fit.garment.chestCm).toBe(118);
    expect(fit.easeCm.chest).toBe(16);
    expect(fit.label.chest).toBe('loose');
  });
});

describe('Target rule table', () => {
  const base: ProductFacts = { store: 'target', url: '', title: 'Top', breadcrumb: ['Women', 'Tops', 'Blouses'], sizeLabels: ['8', '10'], fitText: [], features: [] };
  const key = (o: Partial<ProductFacts>) => { const p = planTargetChart({ ...base, ...o }); return p.ok ? p.key : p.reason; };

  it('picks the chart by signals', () => {
    expect(key({})).toBe('womenswear');
    expect(key({ title: 'Petite Linen Top', sizeLabels: ['8P', '10P'] })).toBe('petite');
    expect(key({ title: 'Curve Cotton Tee', sizeLabels: ['16+', '18+'] })).toBe('plus');
    expect(key({ title: 'Maternity Tee' })).toBe('maternity');
    expect(key({ breadcrumb: ['Men', 'Tops', 'T-Shirts'], sizeLabels: ['S', 'M'] })).toBe('men-tops');
    expect(key({ breadcrumb: ['Men', 'Tops', 'Shirts'], sizeLabels: ['3XL', '4XL'] })).toBe('men-tops');
  });

  it('asks for a chest size when a shirt is sized by collar', () => {
    const p = planTargetChart({ ...base, breadcrumb: ['Men', 'Tops', 'Shirts'], title: 'Business Shirt', sizeLabels: ['38', '40', '42', '44'] });
    expect(p).toMatchObject({ ok: false, reason: 'collar-sizes' });
  });

  it('rejects kids and non-tops', () => {
    expect(key({ breadcrumb: ['Kids', 'Tops'] })).toBe('unsupported-category');
    expect(key({ breadcrumb: ['Men', 'Bottoms', 'Pants'] })).toBe('not-a-top');
  });
});

describe('table parser', () => {
  it('parses ranges, inch columns and group labels', () => {
    expect(parseNumber('77-81')).toBe(79);
    expect(parseNumber('77 – 81')).toBe(79);
    expect(parseNumber('103.5 cm')).toBe(103.5);
    expect(parseNumber('n/a')).toBeUndefined();

    const doc = new DOMParser().parseFromString(
      `<table><thead><tr><th colspan="2">Size</th><th>Chest (in)</th></tr></thead>
       <tbody><tr><td>M</td><td>10/12</td><td>40</td></tr></tbody></table>`, 'text/html');
    const { headers, rows } = readTable(doc.querySelector('table')!);
    const chart = tableToChart(headers, rows, 'garment-circumference')!;
    expect(chart.rows[0]).toEqual({ label: 'M', chestCm: 101.6 });
  });
});

import { readTable, tableToChart } from '../fit/chart-table';
import { styleEaseFromText } from '../fit/style';
import type { ChartSource, ProductFacts, SizeChart } from '../types';
import { TARGET_SNAPSHOTS, TARGET_SNAPSHOT_DATE } from './target-snapshots';
import type { ExtractResult, ResolveDeps, ResolveOutcome, StoreAdapter } from './types';

export const TARGET_CMS_URL =
  'https://www.target.com.au/rest/v2/target/cms/pages?fields=DEFAULT&pageType=ContentPage&pageLabelOrId=UIRPDPModalSizeChartsPage';
/** The human-readable page with the same charts the product page's Size Guide shows. */
export const TARGET_CHART_URL = 'https://www.target.com.au/size-chart/viewallsize';

export type TargetChartKey = 'womenswear' | 'plus' | 'petite' | 'maternity' | 'men-tops';

/** Match a chart's heading on the live Size Guide. */
const HEADING: Record<TargetChartKey, RegExp> = {
  womenswear: /^Womenswear$/i,
  plus: /^Women's Plus Size/i,
  petite: /^Women's Petites?/i,
  maternity: /^Women's Maternity/i,
  'men-tops': /^Men's - Tops/i,
};

const clean = (s: string | null | undefined) => (s ?? '').replace(/[ \s]+/g, ' ').trim();

// ---- Adapter -------------------------------------------------------------

export const targetAdapter: StoreAdapter = {
  store: 'target',

  matches: (url) => url.hostname === 'target.com.au' || url.hostname.endsWith('.target.com.au'),

  // `W` item codes are base-product pages; treat them like colour pages.
  isProductPage: (url) => /^\/p\/[^/]+\/W?\d+$/.test(url.pathname),

  extract(doc, url): ExtractResult | null {
    const title = clean(doc.querySelector('h1')?.textContent);
    if (!title) return null;

    const breadcrumb = [...doc.querySelectorAll('[data-testid=breadcrumb-list] [itemprop=name]')]
      .map((e) => clean(e.textContent))
      .filter((t) => t && t !== 'Homepage');

    const sizeLabels = [...doc.querySelectorAll('[data-testid=product-size-button]')]
      .map((e) => clean(e.textContent))
      .filter(Boolean);

    // Product bullets live in one <ul> inside the product container; the site menus also use <li>.
    const lists = [...doc.querySelectorAll('[data-testid=pdp-container] ul')];
    const bulletList = lists.find((ul) => [...ul.querySelectorAll('li')].some((l) => /model wears|\bfit\b/i.test(l.textContent ?? '')));
    const features = [...new Set([...(bulletList?.querySelectorAll('li') ?? [])].map((l) => clean(l.textContent)))].filter(
      (t) => t.length > 0 && t.length < 160,
    );
    const fitText = features.filter((t) => /\bfit\b|relaxed|oversized|slim|loose|drop shoulder/i.test(t));
    const modelLine = features.find((t) => /model wears/i.test(t));
    const modelSize = modelLine ? /size\s+([^.,]+)/i.exec(modelLine)?.[1]?.trim() : undefined;

    const facts: ProductFacts = {
      store: 'target',
      url: url.origin + url.pathname,
      title,
      breadcrumb,
      sizeLabels,
      fitText,
      features,
      ...(modelSize ? { modelSize } : {}),
    };
    return {
      facts,
      imageUrl: doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? undefined,
      sizeGuideEl: doc.querySelector('[data-testid=size-guide-link]'),
    };
  },
};

// ---- Chart rules ---------------------------------------------------------

const TOP_WORDS = /\btops?\b|t-?shirts?|shirts?|hoodies?|jumpers?|knit|sweat|polos?|singlets?|tanks?|blouses?|tees?/i;

export type PlanOutcome =
  | { ok: true; key: TargetChartKey }
  | { ok: false; reason: 'not-a-top' | 'unsupported-category' | 'collar-sizes'; message: string };

/** The Target rule table: pick which chart applies to a product. */
export function planTargetChart(facts: ProductFacts): PlanOutcome {
  const crumbs = facts.breadcrumb.map((c) => c.toLowerCase());
  const root = crumbs[0];
  if (root !== 'men' && root !== 'women') {
    return {
      ok: false,
      reason: 'unsupported-category',
      message: 'Only adult men’s and women’s tops are supported.',
    };
  }
  if (!facts.breadcrumb.some((c) => TOP_WORDS.test(c))) {
    return { ok: false, reason: 'not-a-top', message: 'This looks like it is not a top. Only tops are supported.' };
  }

  const text = `${facts.title} ${facts.breadcrumb.join(' ')}`;
  const sizes = facts.sizeLabels;

  if (root === 'women') {
    if (/petite/i.test(text) || sizes.some((s) => /^\d+P$/i.test(s))) return { ok: true, key: 'petite' };
    if (/maternity/i.test(text)) return { ok: true, key: 'maternity' };
    if (/curve|plus size/i.test(text) || sizes.some((s) => /^\d+\+$/.test(s))) return { ok: true, key: 'plus' };
    return { ok: true, key: 'womenswear' };
  }

  // Men's business shirts sized by collar (38 to 46) only have a neck chart.
  const numeric = sizes.length > 0 && sizes.every((s) => /^\d+$/.test(s));
  if (numeric && sizes.every((s) => Number(s) >= 36 && Number(s) <= 47) && /shirt/i.test(text)) {
    return {
      ok: false,
      reason: 'collar-sizes',
      message: 'This shirt is sized by collar, so Target publishes no chest chart. Paste a chest size chart instead.',
    };
  }
  return { ok: true, key: 'men-tops' };
}

// ---- Live chart (the Size Guide's own data) --------------------------------

/** Parse the CMS size-chart page into charts keyed by Target chart. Throws on a bad shape. */
export function parseTargetCms(json: string): Partial<Record<TargetChartKey, { name: string; chart: SizeChart }>> {
  const data = JSON.parse(json);
  const slots: { components?: { component?: { content?: string }[] } }[] = data.contentSlots.contentSlot;
  const out: Partial<Record<TargetChartKey, { name: string; chart: SizeChart }>> = {};
  const parser = new DOMParser();
  for (const slot of slots) {
    for (const comp of slot.components?.component ?? []) {
      if (!comp.content) continue;
      const doc = parser.parseFromString(comp.content, 'text/html');
      const name = clean(doc.querySelector('h4')?.textContent);
      const table = doc.querySelector('table');
      if (!name || !table) continue;
      const key = (Object.keys(HEADING) as TargetChartKey[]).find((k) => HEADING[k].test(name));
      if (!key || out[key]) continue;
      const { headers, rows } = readTable(table);
      // All Target tops charts list body measurements.
      const chart = tableToChart(headers, rows, 'body');
      if (chart) out[key] = { name, chart };
    }
  }
  return out;
}

// ---- Resolver ---------------------------------------------------------------

/**
 * Resolve a chart by Target's rules. `live` is how the data is labelled when it is read: 'live' on a
 * Target page (step 4), 'rule' when a Target-branded item is listed on another store (step 5).
 */
export async function resolveTargetChart(
  facts: ProductFacts,
  deps: ResolveDeps,
  liveAs: { method: 'live' | 'rule'; step: 4 | 5 } = { method: 'live', step: 4 },
): Promise<ResolveOutcome> {
  const plan = planTargetChart(facts);
  if (!plan.ok) return plan;

  const live = async (): Promise<{ name: string; chart: SizeChart } | null> => {
    try {
      return parseTargetCms(await deps.fetchText(TARGET_CMS_URL))[plan.key] ?? null;
    } catch {
      return null;
    }
  };

  // Step 4: the chart the page itself points to (the Size Guide's data).
  const hit = await live();
  if (hit) {
    const source: ChartSource = {
      store: 'target',
      chartName: hit.name,
      url: TARGET_CHART_URL,
      method: liveAs.method,
      retrievedAt: deps.now().toISOString().slice(0, 10),
      step: liveAs.step,
    };
    return { ok: true, chart: { ...hit.chart, source }, source };
  }

  // Step 6: bundled snapshot chosen by the same rule.
  const snap = TARGET_SNAPSHOTS[plan.key];
  if (snap) {
    const source: ChartSource = {
      store: 'target',
      chartName: snap.name,
      url: TARGET_CHART_URL,
      method: 'snapshot',
      retrievedAt: TARGET_SNAPSHOT_DATE,
      step: 6,
    };
    return { ok: true, chart: { ...snap.chart, source }, source };
  }

  return { ok: false, reason: 'no-chart', message: 'Could not read this store’s size guide.' };
}

/** Style ease for a Target product (FR-25). */
export const targetStyleEase = (facts: ProductFacts) => styleEaseFromText([...facts.fitText, facts.title]);

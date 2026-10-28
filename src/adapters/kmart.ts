import { readTable, tableToChart } from '../fit/chart-table';
import type { ChartSource, Gender, ProductFacts, SizeChart } from '../types';
import { planTargetChart, resolveTargetChart } from './target';
import type { ExtractResult, ResolveDeps, ResolveOutcome, StoreAdapter } from './types';

const clean = (s: string | null | undefined) => (s ?? '').replace(/[ \s]+/g, ' ').trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil<T>(get: () => T | null | undefined | false, timeoutMs: number): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() >= end) return null;
    await sleep(50);
  }
}

// ---- Adapter -------------------------------------------------------------

/** The main product photo: the first gallery image, outside the "you may also like" tiles. */
function kmartImageUrl(doc: Document): string | undefined {
  const img = [...doc.querySelectorAll<HTMLImageElement>('img[data-testid=product-alt-image]')].find((i) => !i.closest('[data-testid=product-tile]'));
  return img?.currentSrc || img?.getAttribute('src') || undefined;
}

const RELEVANT = /\bfit\b|relaxed|oversized|slim|loose|shoulder|sleeve|model (?:featured )?(?:is )?wearing/i;

export const kmartAdapter: StoreAdapter = {
  store: 'kmart',

  matches: (url) => url.hostname === 'kmart.com.au' || url.hostname.endsWith('.kmart.com.au'),

  // The colour is a query parameter (?selectedSwatch=...), which the path pattern ignores.
  isProductPage: (url) => /^\/product\/[^/]+\/?$/.test(url.pathname),

  extract(doc, url): ExtractResult | null {
    const title = clean((doc.querySelector('[data-testid=product-title]') ?? doc.querySelector('h1'))?.textContent);
    if (!title) return null;

    const breadcrumb = [...doc.querySelectorAll('nav[aria-label=Breadcrumbs] [itemprop=name]')]
      .map((e) => clean(e.textContent))
      .filter((t) => t && t !== 'Home' && t.toLowerCase() !== title.toLowerCase());

    const sizeLabels = [...doc.querySelectorAll('[data-testid=product-size-button]')]
      .map((e) => clean(e.textContent))
      .filter(Boolean);

    // Feature and fit bullets sit in <ul>s on the page; skip the site menus.
    const features = [
      ...new Set(
        [...doc.querySelectorAll('ul')]
          .filter((ul) => !ul.closest('nav, header, footer'))
          .filter((ul) => [...ul.children].some((li) => RELEVANT.test(li.textContent ?? '')))
          .flatMap((ul) => [...ul.children].map((li) => clean(li.textContent))),
      ),
    ].filter((t) => t.length > 0 && t.length < 160);

    const fitText = features.filter((t) => /\bfit\b|relaxed|oversized|slim|loose|drop shoulder/i.test(t));
    const modelLine = features.find((t) => /model (?:featured )?(?:is )?wearing/i.test(t));
    const modelSize = modelLine ? /size\s+(\S+)/i.exec(modelLine)?.[1] : undefined;

    // Kmart also lists Target-branded items; they use Target's size charts.
    const soldByTarget =
      /^target\b/i.test(title) || /sold and shipped by target/i.test(doc.body?.textContent ?? '');

    const facts: ProductFacts = {
      store: 'kmart',
      url: url.origin + url.pathname,
      title,
      ...(soldByTarget ? { brand: 'Target' } : {}),
      breadcrumb,
      sizeLabels,
      fitText,
      features,
      ...(modelSize ? { modelSize } : {}),
    };
    return {
      facts,
      imageUrl: kmartImageUrl(doc),
      sizeGuideEl: doc.querySelector('[data-testid=size-guide-btn]'),
    };
  },
};

// ---- Size guide popup -------------------------------------------------------

const HIDE_CSS = '[data-testid=size-guide-modal]{visibility:hidden !important}';

/**
 * Open the "Size guide" popup, read the tables for one gender and close it again, leaving the page
 * as it was found. Returns charts keyed by their on-page title, or null if the popup never appears.
 * Charts are in cm; the popup's unit switch is forced to centimetres.
 */
export async function readKmartSizeGuide(
  doc: Document,
  gender: Gender,
  timeoutMs = 5000,
): Promise<Record<string, SizeChart> | null> {
  const button = doc.querySelector<HTMLElement>('[data-testid=size-guide-btn]');
  if (!button) return null;

  // Keep the popup invisible while we read it, so the shopper sees no flash.
  const style = doc.createElement('style');
  style.textContent = HIDE_CSS;
  doc.head.appendChild(style);
  try {
    button.click();
    const modal = await waitUntil(() => doc.querySelector('[data-testid=size-guide-modal]'), timeoutMs);
    if (!modal) return null;

    const tabs = [...modal.querySelectorAll<HTMLElement>('[role=tab]')];
    const wanted = gender === 'men' ? /^men/i : /^women/i;
    const idx = tabs.findIndex((t) => wanted.test(clean(t.textContent)));
    if (idx < 0) return null;
    if (tabs[idx].getAttribute('aria-selected') !== 'true') tabs[idx].click();

    const panel = await waitUntil(() => {
      const p = modal.querySelectorAll('[role=tabpanel]')[idx];
      return p?.querySelector('[data-testid=table-title]') ? p : null;
    }, timeoutMs);
    if (!panel) return null;

    // Make sure values are centimetres, not inches.
    const cm = modal.querySelector<HTMLInputElement>('[data-testid=cmUnit] input');
    if (cm && !cm.checked) {
      cm.click();
      await sleep(100);
    }

    const out: Record<string, SizeChart> = {};
    for (const titleEl of panel.querySelectorAll('[data-testid=table-title]')) {
      const table = titleEl.parentElement?.querySelector('table');
      if (!table) continue;
      const { headers, rows } = readTable(table);
      // Kmart's popup does not say whether it lists body or garment sizes; its numbers
      // (e.g. men's M chest 99 cm) are body-sized, so treat it as body and say so in the UI.
      const chart = tableToChart(headers, rows, 'body');
      if (chart) out[clean(titleEl.textContent)] = chart;
    }
    return Object.keys(out).length ? out : null;
  } finally {
    doc.querySelector<HTMLElement>('[data-testid=size-guide-modal] [data-testid=modal-close]')?.click();
    await waitUntil(() => !doc.querySelector('[data-testid=size-guide-modal]'), 1500);
    style.remove();
  }
}

// ---- Chart rules ---------------------------------------------------------

export type KmartPlan =
  | { ok: true; gender: Gender; pick: RegExp }
  | { ok: false; reason: 'not-a-top' | 'unsupported-category'; message: string };

const TOP_WORDS = /\btops?\b|t-?shirts?|shirts?|hoodies?|jumpers?|knit|sweat|polos?|singlets?|tanks?|blouses?|tees?|jackets?|cardigans?|pyjama top|sleepwear/i;

export const kmartGender = (facts: ProductFacts): Gender | null => {
  const root = facts.breadcrumb[0]?.toLowerCase();
  if (root === 'mens' || root === 'men') return 'men';
  if (root === 'womens' || root === 'women') return 'women';
  return null;
};

/** Pick which chart in the popup applies. */
export function planKmartChart(facts: ProductFacts): KmartPlan {
  const gender = kmartGender(facts);
  if (!gender) {
    return { ok: false, reason: 'unsupported-category', message: 'Only adult men’s and women’s tops are supported.' };
  }
  if (!facts.breadcrumb.some((c) => TOP_WORDS.test(c))) {
    return { ok: false, reason: 'not-a-top', message: 'This looks like it is not a top. Only tops are supported.' };
  }
  const text = `${facts.title} ${facts.breadcrumb.join(' ')}`;
  if (gender === 'women') {
    if (/maternity/i.test(text)) return { ok: true, gender, pick: /^Maternity/i };
    if (/plus size|curve/i.test(text)) return { ok: true, gender, pick: /^Plus size/i };
    return { ok: true, gender, pick: /^Tops, Bottoms/i };
  }
  if (/sleepwear|pyjama/i.test(text)) return { ok: true, gender, pick: /^Mens Sleepwear Tops/i };
  // Business shirts (not "T Shirts") have their own chart, which also lists chest.
  if (/(^|[^a-z-])shirts?\b/i.test(facts.breadcrumb.slice(-1)[0] ?? '') && !/t[\s-]?shirt/i.test(facts.breadcrumb.slice(-1)[0] ?? '')) {
    return { ok: true, gender, pick: /^Mens Shirts/i };
  }
  return { ok: true, gender, pick: /^Mens Tops/i };
}

// ---- Resolver -----------------------------------------------------------------

export async function resolveKmartChart(facts: ProductFacts, deps: ResolveDeps): Promise<ResolveOutcome> {
  const gender = kmartGender(facts);

  // FR-23 and the Kmart rule: Target-branded items use Target's rules and data.
  if (facts.brand === 'Target') {
    const asTarget: ProductFacts = {
      ...facts,
      store: 'target',
      breadcrumb: facts.breadcrumb.map((c, i) => (i === 0 && gender ? (gender === 'men' ? 'Men' : 'Women') : c)),
    };
    if (!planTargetChart(asTarget).ok) return planTargetChart(asTarget) as ResolveOutcome;
    return resolveTargetChart(asTarget, deps, { method: 'rule', step: 5 });
  }

  const plan = planKmartChart(facts);
  if (!plan.ok) return plan;

  const charts = deps.doc ? await readKmartSizeGuide(deps.doc, plan.gender, deps.popupTimeoutMs) : null;
  const title = charts && Object.keys(charts).find((t) => plan.pick.test(t));
  if (charts && title) {
    const source: ChartSource = {
      store: 'kmart',
      chartName: title,
      url: facts.url,
      method: 'live',
      retrievedAt: deps.now().toISOString().slice(0, 10),
      step: 4,
    };
    return { ok: true, chart: { ...charts[title], source }, source };
  }

  return {
    ok: false,
    reason: 'no-chart',
    message: 'Could not read Kmart’s size guide popup. Paste a size chart instead.',
  };
}

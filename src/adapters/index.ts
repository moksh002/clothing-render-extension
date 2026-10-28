import type { ProductFacts } from '../types';
import { resolveTargetChart, targetAdapter } from './target';
import type { ResolveDeps, ResolveOutcome, StoreAdapter } from './types';

export const ADAPTERS: StoreAdapter[] = [targetAdapter];

export type PageClass =
  | { kind: 'product'; adapter: StoreAdapter }
  | { kind: 'not-product'; message: string }
  | { kind: 'myer-planned'; message: string }
  | { kind: 'unsupported'; message: string };

/** FR-17 and FR-18: pick the store from the hostname, then check the path is a product page. */
export function classifyPage(url: URL): PageClass {
  const host = url.hostname;
  if (host === 'myer.com.au' || host.endsWith('.myer.com.au')) {
    return { kind: 'myer-planned', message: 'Myer support is planned. For now, Target and Kmart are supported.' };
  }
  const adapter = ADAPTERS.find((a) => a.matches(url));
  if (!adapter) {
    return { kind: 'unsupported', message: 'This store is not supported yet. Open a product page on Target or Kmart.' };
  }
  if (!adapter.isProductPage(url)) {
    return { kind: 'not-product', message: 'Open a product page to see how it fits.' };
  }
  return { kind: 'product', adapter };
}

/** FR-20: resolve the chart for a product, dispatching on the store. */
export function resolveChart(facts: ProductFacts, deps: ResolveDeps): Promise<ResolveOutcome> {
  switch (facts.store) {
    case 'target':
      return resolveTargetChart(facts, deps);
    default:
      return Promise.resolve({ ok: false, reason: 'no-chart', message: 'This store is not supported yet.' });
  }
}

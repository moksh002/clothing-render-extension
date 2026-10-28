import type { ChartSource, ProductFacts, SizeChart, StoreId } from '../types';

export interface ExtractResult {
  facts: ProductFacts;
  /** Reference only (FR-5). */
  imageUrl?: string;
  /** The element that opens or holds the page's own size guide, if any. */
  sizeGuideEl: Element | null;
}

export interface StoreAdapter {
  store: StoreId;
  matches(url: URL): boolean;
  isProductPage(url: URL): boolean;
  /** Read product facts from a rendered product page (FR-19). */
  extract(doc: Document, url: URL): ExtractResult | null;
}

export type ResolveFailureReason =
  | 'not-a-top'
  | 'unsupported-category'
  | 'collar-sizes'
  | 'no-chart';

export interface ResolveDeps {
  /** Fetch a URL as text (may cross sites via the background worker). Injected so tests can use fixtures. */
  fetchText: (url: string) => Promise<string>;
  now: () => Date;
  /** The live page, for stores whose chart sits in a popup the resolver has to open. */
  doc?: Document;
  /** How long to wait for a popup to appear (default 5000 ms). */
  popupTimeoutMs?: number;
}

export type ResolveOutcome =
  | { ok: true; chart: SizeChart; source: ChartSource }
  | { ok: false; reason: ResolveFailureReason; message: string };

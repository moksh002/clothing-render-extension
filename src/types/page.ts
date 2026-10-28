import type { ChartSource, Garment, ProductFacts } from './index';

/** What the content script tells the panel about the page the user is on. */
export type PageState =
  | { kind: 'loading'; url: string }
  | { kind: 'unsupported' | 'not-product' | 'myer-planned'; url: string; message: string }
  | {
      kind: 'product';
      url: string;
      facts: ProductFacts;
      /** Size currently selected on the page, if any. */
      pageSize?: string;
      /** Present when a chart was resolved. */
      garment?: Garment;
      source?: ChartSource;
      /** Present when no chart could be resolved. */
      failure?: { reason: string; message: string };
    };

export type PageMessage = { type: 'page-state'; state: PageState };

export const stateKey = (tabId: number) => `pageState:${tabId}`;

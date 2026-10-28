import type { ChartSource, Garment, ProductFacts } from './index';

/** Appearance read from the product photo. */
export interface PhotoLook {
  colour: string;
  /** PNG data URL of the garment cut out of the photo, when it has a print. */
  textureDataUrl?: string;
}

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
      /** Colour and print from the product photo, when it could be read. */
      look?: PhotoLook;
      imageUrl?: string;
      /** Present when no chart could be resolved. */
      failure?: { reason: string; message: string };
    };

export type PageMessage = { type: 'page-state'; state: PageState };

export const stateKey = (tabId: number) => `pageState:${tabId}`;

/** Result of loading a pasted product link in a background tab. */
export type LinkResult =
  | { status: 'loading' }
  | { status: 'done'; state: PageState }
  | { status: 'error'; message: string };

export type LinkMessage = { type: 'open-link'; url: string };

export const linkResultKey = (url: string) => `linkResult:${url}`;
export const linkTabKey = (tabId: number) => `linkTab:${tabId}`;

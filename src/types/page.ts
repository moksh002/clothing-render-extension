import type { ChartSource, Garment, ProductFacts } from './index';

/** Appearance read from the product photo. */
export interface PhotoLook {
  colour: string;
  /** PNG data URL of the front (and back) garment cut-outs side by side, when the garment has a print. */
  textureDataUrl?: string;
  /** Where each photo sits in the atlas (inner u-range). */
  front?: { u0: number; u1: number };
  back?: { u0: number; u1: number };
  /** Greyscale PNG data URL of the fabric weave, for a bump map. */
  fabricDataUrl?: string;
  /** What each product photo was judged to show, for debugging and the UI. */
  kinds?: string[];
  /** Gallery positions of the photos used for the front and back (-1 when none). */
  picked?: { front: number; back: number };
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
      imageUrl?: string;
      imageUrls?: string[];
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

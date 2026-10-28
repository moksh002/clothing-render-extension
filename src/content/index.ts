// Runs on supported store pages. Reads the product, resolves its size chart and
// tells the side panel what it found. All work happens in the page; nothing leaves the browser
// except fetching the store's own size guide.
import { classifyPage, resolveChart } from '../adapters';
import { buildGarment } from '../adapters/garment';
import type { ExtractResult } from '../adapters/types';
import type { PageMessage, PageState } from '../types/page';

const SIZE_BUTTON = '[data-testid=product-size-button]';
const SELECTED_SIZE = '[data-testid=product-size-button][aria-checked=true]';

function publish(state: PageState) {
  const msg: PageMessage = { type: 'page-state', state };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* panel/background not listening yet */
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Size pickers render client side after load; wait for them. */
async function waitForProduct(timeoutMs = 30000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (document.querySelector('h1') && document.querySelector(SIZE_BUTTON)) return;
    await sleep(300);
  }
}

const pageSize = () => document.querySelector(SELECTED_SIZE)?.textContent?.trim() || undefined;

let currentUrl = '';
let lastPublished: PageState | null = null;
let runId = 0;

async function run() {
  const id = ++runId;
  const url = new URL(location.href);
  currentUrl = location.href;
  const cls = classifyPage(url);

  if (cls.kind !== 'product') {
    publish((lastPublished = { kind: cls.kind, url: url.href, message: cls.message }));
    return;
  }
  publish((lastPublished = { kind: 'loading', url: url.href }));
  await waitForProduct();
  if (id !== runId) return; // navigated away while waiting

  const extracted: ExtractResult | null = cls.adapter.extract(document, url);
  if (!extracted) {
    publish(
      (lastPublished = {
        kind: 'unsupported',
        url: url.href,
        message: 'Could not read this product page.',
      }),
    );
    return;
  }

  const { facts, imageUrl } = extracted;
  const outcome = await resolveChart(facts, {
    fetchText: async (u) => {
      const r = await fetch(u, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    },
    now: () => new Date(),
  });
  if (id !== runId) return;

  publish(
    (lastPublished = outcome.ok
      ? {
          kind: 'product',
          url: url.href,
          facts,
          pageSize: pageSize(),
          garment: buildGarment(facts, outcome.chart, imageUrl),
          source: outcome.source,
        }
      : {
          kind: 'product',
          url: url.href,
          facts,
          pageSize: pageSize(),
          failure: { reason: outcome.reason, message: outcome.message },
        }),
  );
}

// Single-page sites change the URL without reloading, and the shopper can change
// the selected size on the page, so poll cheaply for both.
setInterval(() => {
  if (location.href !== currentUrl) {
    run();
    return;
  }
  if (lastPublished?.kind === 'product' && pageSize() !== lastPublished.pageSize) {
    lastPublished = { ...lastPublished, pageSize: pageSize() };
    publish(lastPublished);
  }
}, 700);

// The panel may open after we published; it asks again.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'request-state' && lastPublished) publish(lastPublished);
});

run();

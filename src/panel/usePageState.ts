import { useEffect, useState } from 'react';
import { classifyPage } from '../adapters';
import { linkResultKey, stateKey, type LinkResult, type PageState } from '../types/page';

const GENERIC_UNSUPPORTED = 'Open a product page on Target or Kmart to see how it fits.';

const sameUrl = (a: string, b: string) => a.split('#')[0] === b.split('#')[0];

/** The page state for the tab the user is looking at. */
/** The page state for the active tab, or for a pasted link when `linkUrl` is given. */
export function usePageState(linkUrl?: string): PageState {
  const [state, setState] = useState<PageState>({ kind: 'loading', url: '' });

  useEffect(() => {
    let cancelled = false;

    async function refreshLink(url: string) {
      const key = linkResultKey(url);
      const r = (await chrome.storage.session.get(key))[key] as LinkResult | undefined;
      if (cancelled) return;
      if (!r || r.status === 'loading') setState({ kind: 'loading', url });
      else if (r.status === 'error') setState({ kind: 'unsupported', url, message: r.message });
      else setState(r.state);
    }

    async function refresh() {
      if (linkUrl) return refreshLink(linkUrl);
      // `?tab=<id>` pins the panel to one tab (used by automated tests).
      const pinned = Number(new URLSearchParams(location.search).get('tab'));
      const [tab] = pinned
        ? [await chrome.tabs.get(pinned)]
        : await chrome.tabs.query({ active: true, currentWindow: true });
      if (cancelled) return;
      // `url` is only visible on hosts the extension has permission for, so
      // anything else is by definition not a supported store.
      if (!tab?.id || !tab.url) {
        setState({ kind: 'unsupported', url: '', message: GENERIC_UNSUPPORTED });
        return;
      }
      const cls = classifyPage(new URL(tab.url));
      if (cls.kind !== 'product') {
        setState({ kind: cls.kind, url: tab.url, message: cls.message });
        return;
      }
      const key = stateKey(tab.id);
      const stored = (await chrome.storage.session.get(key))[key] as PageState | undefined;
      if (cancelled) return;
      if (stored && sameUrl(stored.url, tab.url)) setState(stored);
      else {
        setState({ kind: 'loading', url: tab.url });
        // The content script may have published before the panel opened.
        chrome.tabs.sendMessage(tab.id, { type: 'request-state' }).catch(() => {});
      }
    }

    refresh();
    const onStorage = (_c: unknown, area: string) => area === 'session' && refresh();
    chrome.storage.onChanged.addListener(onStorage);
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(refresh);
    };
  }, [linkUrl]);

  return state;
}

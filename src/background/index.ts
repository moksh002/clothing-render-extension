import { parseProductLink } from '../adapters/link';
import { linkResultKey, linkTabKey, stateKey, type LinkMessage, type LinkResult, type PageMessage, type PageState } from '../types/page';

// Toolbar icon opens the side panel. If the side panel API is unavailable,
// fall back to a small popup window hosting the same panel page.
const PANEL_PATH = 'src/panel/index.html';

if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
} else {
  chrome.action.onClicked.addListener(() => {
    chrome.windows.create({
      url: chrome.runtime.getURL(PANEL_PATH),
      type: 'popup',
      width: 420,
      height: 720,
    });
  });
}

// ---- Pasted links ---------------------------------------------------------------
// A pasted product link is loaded in a background tab so the normal page pipeline (content script,
// chart resolver, photo look) can run on it. Once it has produced a result the tab is closed.

const LINK_TIMEOUT_MIN = 0.75; // alarms must be at least 30 s

async function setLinkResult(url: string, result: LinkResult) {
  await chrome.storage.session.set({ [linkResultKey(url)]: result });
}

async function finishLink(tabId: number, url: string, result: LinkResult) {
  await setLinkResult(url, result);
  await chrome.storage.session.remove(linkTabKey(tabId));
  chrome.alarms.clear(`link:${tabId}`);
  chrome.tabs.remove(tabId).catch(() => {});
}

async function openLink(url: string) {
  const parsed = parseProductLink(url);
  if (!parsed.ok) {
    await setLinkResult(url, { status: 'error', message: parsed.message });
    return;
  }
  await setLinkResult(url, { status: 'loading' });
  const tab = await chrome.tabs.create({ url: parsed.url, active: false });
  if (tab.id == null) return;
  await chrome.storage.session.set({ [linkTabKey(tab.id)]: url });
  chrome.alarms.create(`link:${tab.id}`, { delayInMinutes: LINK_TIMEOUT_MIN });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const tabId = Number(alarm.name.split(':')[1]);
  const k = linkTabKey(tabId);
  const url = (await chrome.storage.session.get(k))[k] as string | undefined;
  if (!url) return;
  // Out of time: use whatever the page produced, else report failure.
  const s = (await chrome.storage.session.get(stateKey(tabId)))[stateKey(tabId)] as PageState | undefined;
  if (s && s.kind === 'product' && (s.garment || s.failure)) await finishLink(tabId, url, { status: 'done', state: s });
  else await finishLink(tabId, url, { status: 'error', message: 'Could not read that product page in time. Try opening it in a tab.' });
});

// Content scripts cannot write session storage, so the worker stores each tab's page state.
chrome.runtime.onMessage.addListener((msg: PageMessage | LinkMessage, sender) => {
  if (msg?.type === 'open-link') {
    openLink(msg.url);
    return false;
  }
  if (msg?.type === 'page-state' && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    chrome.storage.session.set({ [stateKey(tabId)]: msg.state }).then(async () => {
      const k = linkTabKey(tabId);
      const url = (await chrome.storage.session.get(k))[k] as string | undefined;
      if (!url) return;
      const st = msg.state;
      // Wait for the photo look when there is a photo; other states are final.
      const final = st.kind === 'product' ? !!st.look || !st.imageUrl || !!st.failure : st.kind !== 'loading';
      if (final) await finishLink(tabId, url, { status: 'done', state: st });
    });
  }
  return false;
});

// Cross-site fetch for Target size data shown on a Kmart page (content scripts are bound by the page's CORS).
// Only Target's own site is allowed.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'fetch-text') return false;
  try {
    const u = new URL(msg.url);
    if (u.protocol !== 'https:' || !(u.hostname === 'target.com.au' || u.hostname.endsWith('.target.com.au'))) {
      sendResponse({ ok: false, error: 'host not allowed' });
      return false;
    }
  } catch {
    sendResponse({ ok: false, error: 'bad url' });
    return false;
  }
  fetch(msg.url)
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      sendResponse({ ok: true, text: await r.text() });
    })
    .catch((e) => sendResponse({ ok: false, error: String(e) }));
  return true; // async response
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  chrome.storage.session.remove(stateKey(tabId));
  // A link tab closed by hand before it finished.
  const k = linkTabKey(tabId);
  const url = (await chrome.storage.session.get(k))[k] as string | undefined;
  if (url) {
    await setLinkResult(url, { status: 'error', message: 'The page was closed before it finished loading.' });
    chrome.storage.session.remove(k);
    chrome.alarms.clear(`link:${tabId}`);
  }
});

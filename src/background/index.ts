import { stateKey, type PageMessage } from '../types/page';

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

// Content scripts cannot write session storage, so the worker stores each tab's page state.
chrome.runtime.onMessage.addListener((msg: PageMessage, sender) => {
  if (msg?.type === 'page-state' && sender.tab?.id != null) {
    chrome.storage.session.set({ [stateKey(sender.tab.id)]: msg.state });
  }
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

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(stateKey(tabId));
});

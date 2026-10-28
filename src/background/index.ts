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

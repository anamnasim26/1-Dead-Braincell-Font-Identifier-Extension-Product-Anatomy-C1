// MV3 service worker. Owns: injecting the content script, tracking per-tab
// picking state (in-memory, best-effort — fine to lose on SW restart), and
// the session-only Recent Inspections list.

const RECENT_KEY = "fontscopeRecent";
const RECENT_LIMIT = 5;

const activeTabs = new Map(); // tabId -> boolean

async function injectAndStart(tabId) {
  await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["lib/icons.js", "lib/font-detect.js", "lib/storage.js", "content.js"]
  });
}

async function startInspectingOnActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  await injectAndStart(tab.id);
}

async function pushRecent(entry) {
  const { [RECENT_KEY]: list = [] } = await chrome.storage.session.get(RECENT_KEY);
  const next = [entry, ...list.filter((e) => e.name !== entry.name || e.page !== entry.page)].slice(0, RECENT_LIMIT);
  await chrome.storage.session.set({ [RECENT_KEY]: next });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "start-inspecting") {
    startInspectingOnActiveTab();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "START_INSPECTING": {
      startInspectingOnActiveTab().then(() => sendResponse({ ok: true }));
      return true;
    }
    case "GET_STATE": {
      sendResponse({ active: activeTabs.get(message.tabId) || false });
      return false;
    }
    case "STATE_CHANGED": {
      if (sender.tab && sender.tab.id != null) {
        activeTabs.set(sender.tab.id, message.active);
      }
      return false;
    }
    case "FONT_DETECTED": {
      pushRecent(message.payload);
      return false;
    }
    case "GET_RECENT": {
      chrome.storage.session.get(RECENT_KEY).then((res) => {
        sendResponse({ recent: res[RECENT_KEY] || [] });
      });
      return true;
    }
    case "CLEAR_RECENT": {
      chrome.storage.session.set({ [RECENT_KEY]: [] }).then(() => sendResponse({ ok: true }));
      return true;
    }
    default:
      return false;
  }
});

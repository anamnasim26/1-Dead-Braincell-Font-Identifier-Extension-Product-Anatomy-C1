// Local-preview stand-in for the Chrome extension APIs. Never shipped with
// the extension — only loaded by files in preview/. Lets popup.js and
// content.js run unmodified in a plain browser tab, backed by localStorage
// instead of a real background.js service worker.
(function () {
  const RECENT_KEY = "fontscopeRecent";
  const RECENT_LIMIT = 5;
  const activeState = { current: false };

  const DEFAULT_RECENT = [
    { name: "Outfit", page: "https://linear.app/features" },
    { name: "Instrument Serif", page: "https://nytimes.com/creative" },
    { name: "Fragment Mono", page: "https://github.com/trending" }
  ];

  function readRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_RECENT;
    } catch (e) {
      return DEFAULT_RECENT;
    }
  }

  function writeRecent(list) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }

  function pushRecent(entry) {
    const list = readRecent();
    const next = [entry, ...list.filter((e) => e.name !== entry.name || e.page !== entry.page)].slice(0, RECENT_LIMIT);
    writeRecent(next);
  }

  const LOCAL_PREFIX = "fontscopeLocal:";

  function localGet(keys) {
    const keyList = typeof keys === "string" ? [keys] : keys;
    const out = {};
    keyList.forEach((k) => {
      try {
        const raw = localStorage.getItem(LOCAL_PREFIX + k);
        if (raw !== null) out[k] = JSON.parse(raw);
      } catch (e) {
        /* ignore malformed entries */
      }
    });
    return out;
  }

  function localSet(obj) {
    Object.keys(obj).forEach((k) => {
      localStorage.setItem(LOCAL_PREFIX + k, JSON.stringify(obj[k]));
    });
  }

  async function handleMessage(message) {
    switch (message.type) {
      case "START_INSPECTING":
        // No background.js in preview mode — content.js is already loaded
        // directly on the page and starts itself, so this is a no-op here.
        return { ok: true };
      case "GET_STATE":
        return { active: activeState.current };
      case "STATE_CHANGED":
        activeState.current = message.active;
        return undefined;
      case "FONT_DETECTED":
        pushRecent(message.payload);
        return undefined;
      case "GET_RECENT":
        return { recent: readRecent() };
      case "CLEAR_RECENT":
        writeRecent([]);
        return { ok: true };
      default:
        return undefined;
    }
  }

  window.chrome = {
    runtime: {
      getURL: (path) => `../${path}`,
      sendMessage: (message) => handleMessage(message)
    },
    tabs: {
      query: async () => [{ id: 1 }],
      create: async ({ url }) => window.open(url, "_blank")
    },
    storage: {
      session: {
        get: async (key) => ({ [key]: readRecent() }),
        set: async (obj) => writeRecent(obj[RECENT_KEY] || [])
      },
      local: {
        get: async (keys) => localGet(keys),
        set: async (obj) => localSet(obj)
      }
    },
    scripting: {
      insertCSS: async () => {},
      executeScript: async () => {}
    },
    commands: {
      onCommand: { addListener: () => {} }
    }
  };
})();

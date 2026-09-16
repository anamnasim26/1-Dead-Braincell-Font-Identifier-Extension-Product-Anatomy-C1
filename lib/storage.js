// Shared, framework-free persistence helpers — chrome.storage.local, used by
// content.js (save), popup.js (theme), and dashboard.js (list/remove/pair).
// Loaded as a classic script; exposes everything on `self.FontscopeStorage`.
(function () {
  const SAVED_KEY = "fontscopeSaved";
  const THEME_KEY = "fontscopeTheme";

  async function getSaved() {
    const res = await chrome.storage.local.get(SAVED_KEY);
    return res[SAVED_KEY] || [];
  }

  async function saveFont(entry) {
    const list = await getSaved();
    const key = entry.name.toLowerCase();
    const next = list.filter((f) => f.name.toLowerCase() !== key);
    next.unshift({ ...entry, id: entry.id || `${key}-${Date.now()}`, savedAt: new Date().toISOString() });
    await chrome.storage.local.set({ [SAVED_KEY]: next });
    return next;
  }

  async function removeFont(id) {
    const list = await getSaved();
    const next = list.filter((f) => f.id !== id);
    await chrome.storage.local.set({ [SAVED_KEY]: next });
    return next;
  }

  async function isSaved(name) {
    const list = await getSaved();
    return list.some((f) => f.name.toLowerCase() === name.toLowerCase());
  }

  async function getTheme() {
    const res = await chrome.storage.local.get(THEME_KEY);
    return res[THEME_KEY] || "dark";
  }

  async function setTheme(theme) {
    await chrome.storage.local.set({ [THEME_KEY]: theme });
    try {
      // Synchronous mirror so the *next* page load can paint the right
      // theme immediately (see the inline head script in popup/dashboard
      // .html) instead of flashing dark-then-light while the async
      // chrome.storage.local read resolves.
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* localStorage unavailable — the async path in getTheme still works */
    }
    return theme;
  }

  self.FontscopeStorage = { getSaved, saveFont, removeFont, isSaved, getTheme, setTheme };
})();

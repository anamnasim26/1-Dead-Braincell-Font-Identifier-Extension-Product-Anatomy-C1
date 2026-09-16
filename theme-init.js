// Applied synchronously, before first paint, so extension pages never flash
// the default dark theme before switching to a saved light preference.
// lib/storage.js mirrors the async chrome.storage.local value here on every
// change; this is just the fast read-back. Loaded as an external file (not
// inline) because MV3's extension-page CSP (script-src 'self') blocks
// inline <script> tags outright — there's no 'unsafe-inline' opt-in.
(function () {
  try {
    var fsTheme = localStorage.getItem("fontscopeTheme");
    if (fsTheme) document.documentElement.setAttribute("data-theme", fsTheme);
  } catch (e) {}
})();

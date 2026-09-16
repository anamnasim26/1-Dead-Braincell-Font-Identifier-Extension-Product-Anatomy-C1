// Shared, framework-free font-detection logic. Loaded before content.js as a
// classic (non-module) script, so it exposes everything on `self.Fontscope`.
(function () {
  const SYSTEM_FONTS = new Set([
    "arial", "helvetica", "helvetica neue", "times new roman", "times",
    "georgia", "verdana", "tahoma", "trebuchet ms", "courier new", "courier",
    "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui",
    "sans-serif", "serif", "monospace", "cursive", "fantasy", "ui-sans-serif",
    "ui-serif", "ui-monospace"
  ]);

  const WEIGHT_KEYWORDS = {
    100: "Thin", 200: "Extra Light", 300: "Light", 400: "Regular",
    500: "Medium", 600: "SemiBold", 700: "Bold", 800: "Extra Bold", 900: "Black"
  };

  const SERVICE_HOSTS = [
    { test: (h) => h.includes("fonts.googleapis.com"), label: "Google Fonts",
      link: (family) => `https://fonts.google.com/specimen/${encodeURIComponent(family).replace(/%20/g, "+")}` },
    { test: (h) => h.includes("use.typekit.net") || h.includes("p.typekit.net"), label: "Adobe Fonts (Typekit)",
      link: () => "https://fonts.adobe.com" },
    { test: (h) => h.includes("fonts.adobe.com"), label: "Adobe Fonts",
      link: () => "https://fonts.adobe.com" },
    { test: (h) => h.includes("fonts.cdnfonts.com"), label: "CDN Fonts",
      link: () => "https://www.cdnfonts.com" }
  ];

  function normalizeForMatch(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function primaryFamily(fontFamilyStack) {
    const first = fontFamilyStack.split(",")[0] || "";
    return first.trim().replace(/^["']|["']$/g, "");
  }

  function nearestWeightKeyword(weight) {
    const numeric = Math.round(weight / 100) * 100;
    return WEIGHT_KEYWORDS[numeric] || WEIGHT_KEYWORDS[400];
  }

  function rgbToHex(rgbString) {
    const match = rgbString.match(/rgba?\(([^)]+)\)/);
    if (!match) return rgbString;
    const parts = match[1].split(",").map((p) => parseFloat(p.trim()));
    const [r, g, b] = parts;
    if ([r, g, b].some((n) => Number.isNaN(n))) return rgbString;
    const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  function extractComputedStyle(el) {
    const cs = getComputedStyle(el);
    const rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const fontSizePx = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;

    let lineHeightRatio = null;
    let lineHeightPx = null;
    if (cs.lineHeight === "normal") {
      lineHeightRatio = 1.2;
      lineHeightPx = Math.round(fontSizePx * 1.2 * 10) / 10;
    } else {
      lineHeightPx = parseFloat(cs.lineHeight);
      lineHeightRatio = Math.round((lineHeightPx / fontSizePx) * 100) / 100;
    }

    return {
      fontFamilyStack: cs.fontFamily,
      family: primaryFamily(cs.fontFamily),
      weight,
      weightLabel: `${weight} / ${nearestWeightKeyword(weight)}`,
      fontSizePx: Math.round(fontSizePx * 100) / 100,
      fontSizeRem: Math.round((fontSizePx / rootFontSizePx) * 1000) / 1000,
      lineHeightRatio,
      lineHeightPx: Math.round(lineHeightPx * 10) / 10,
      style: cs.fontStyle,
      letterSpacing: cs.letterSpacing,
      color: rgbToHex(cs.color)
    };
  }

  function findFontFaceSrc(family) {
    const target = family.trim().toLowerCase();
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        continue; // cross-origin stylesheet, can't inspect
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule.type === CSSRule.FONT_FACE_RULE) {
          const ruleFamily = rule.style.getPropertyValue("font-family").trim().replace(/^["']|["']$/g, "").toLowerCase();
          if (ruleFamily === target) {
            const src = rule.style.getPropertyValue("src");
            const urlMatch = src.match(/url\(["']?([^"')]+)["']?\)/);
            if (urlMatch) return urlMatch[1];
          }
        }
      }
    }
    return null;
  }

  function findServiceLink(family) {
    const hrefs = [];
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.href) hrefs.push(sheet.href);
      try {
        const rules = sheet.cssRules;
        if (rules) {
          for (const rule of Array.from(rules)) {
            // Catches the common `@import url(fonts.googleapis.com/...)`
            // pattern (e.g. Tailwind's default setup) — the imported
            // font-service URL never appears as its own top-level
            // stylesheet or <link> tag, only inside this rule.
            if (rule.type === CSSRule.IMPORT_RULE && rule.href) {
              hrefs.push(rule.href);
            }
          }
        }
      } catch (e) {
        // Cross-origin stylesheet — can't read its @import rules, but its
        // own .href (pushed above) still gets checked against known hosts.
      }
    }
    document.querySelectorAll("link[href]").forEach((link) => {
      if (link.href) hrefs.push(link.href);
    });

    const target = normalizeForMatch(family);
    for (const href of hrefs) {
      for (const service of SERVICE_HOSTS) {
        // Require the family name to actually appear in this URL (Google
        // Fonts/CDN Fonts encode it in the query/path) before attributing
        // the font to this service — otherwise ANY known-service link
        // anywhere on the page (e.g. a Google Fonts link for a *different*
        // font) would get credited for every font looked up on that page.
        if (service.test(href) && normalizeForMatch(href).includes(target)) {
          return { label: service.label, url: service.link(family) };
        }
      }
    }
    return null;
  }

  function detectSource(family) {
    if (!family) return { type: "unknown" };

    if (SYSTEM_FONTS.has(family.toLowerCase())) {
      return { type: "system" };
    }

    const fontFaceUrl = findFontFaceSrc(family);
    if (fontFaceUrl) {
      return { type: "fontface", url: fontFaceUrl };
    }

    const service = findServiceLink(family);
    if (service) {
      return { type: "service", label: service.label, url: service.url };
    }

    return { type: "unknown" };
  }

  async function loadAlternatives() {
    const url = chrome.runtime.getURL("data/alternatives.json");
    const res = await fetch(url);
    return res.json();
  }

  async function alternativesFor(family) {
    if (!family) return [];
    const table = await loadAlternatives();
    return table[family.toLowerCase()] || [];
  }

  function googleFontsCssUrl(family) {
    const encoded = encodeURIComponent(family).replace(/%20/g, "+");
    return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
  }

  self.Fontscope = {
    extractComputedStyle,
    detectSource,
    alternativesFor,
    googleFontsCssUrl,
    rgbToHex
  };
})();

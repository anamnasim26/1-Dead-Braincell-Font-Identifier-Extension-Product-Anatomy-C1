# Font Identifier — Browser Extension PRD

## Problem
Designers who spot a font they like on a webpage have no fast way to identify it. DevTools works but requires knowing where to look (computed styles, buried in a long panel), and breaks down entirely for text that isn't real DOM text (logos, images, canvas-rendered type).

## Target user
Designers browsing the web who want a one-click way to answer "what font is that?"

## Product principle
Ship the fast, free, always-available path first — reading the page's own CSS, plus a small bundled dataset, gets you name, CSS details, best-effort source, and free alternatives with zero network calls. Layer in the slow/paid/uncertain path (external APIs, visual font-matching) only for the cases the fast path structurally can't cover or can't cover well.

---

## Phase 1 — Core identifier (MVP, building now)
**Goal:** Click any real text on a page and get a complete result card — name, CSS details, best-effort source, and free alternatives — instantly, no DevTools, no network calls.

**Interaction (unchanged):**
- Chrome extension, Manifest V3.
- Toolbar icon toggles "picking mode" on the active tab (no popup window — interaction happens directly on the page).
- While active: hovering outlines the element under the cursor; clicking it reads the element's styles and shows a floating result card near the click point.
- Card dismisses on outside click or Esc. Toggling the icon again turns picking mode off.
- Elements with no real text (`<img>`, `<svg>`, empty containers) show a short "no text here" message instead of a card.
- All injected UI lives in a Shadow DOM root so host-page CSS can't interfere with it (or vice versa).

**Result card — four sections, all resolved client-side, zero network calls:**

1. **Name** — the primary font from `getComputedStyle().fontFamily` (first entry in the stack, quotes stripped). Shown as the card's title. Always present.

2. **CSS details** — a spec table read straight from computed style: `font-family` (full fallback stack), `font-weight` (numeric + common keyword, e.g. "700 · Bold"), `font-size` (px, with rem equivalent), `font-style` (normal/italic), `line-height`, `letter-spacing`. Always present.

3. **Source** — best-effort, detected entirely from the page's own CSS (no API calls):
   - Walk `document.styleSheets` for an `@font-face` rule whose `font-family` matches the detected name; if found, read its `src` and surface the file URL/format directly.
   - Check `<link>`/`@import` hrefs for known font-service domains (`fonts.googleapis.com`, `use.typekit.net`, `fonts.adobe.com`, `fonts.cdnfonts.com`); if matched, identify the service and construct its direct page link (e.g. Google Fonts → `https://fonts.google.com/specimen/<Family+Name>`).
   - If the name matches a small local list of system/web-safe fonts (Arial, Helvetica, system-ui, -apple-system, Times New Roman, etc.), show **"System font — already installed, nothing to download."**
   - If none of the above resolve, show an explicit **"Source unknown"** state rather than hiding the section or showing broken data.

4. **Free alternatives** — looked up in a small bundled offline dataset (~30–50 common proprietary/paid fonts → 1–3 free look-alikes each, e.g. Helvetica → Inter/Arial, Proxima Nova → Montserrat, Futura → Century Gothic/Poppins, Gotham → Montserrat/Poppins). If the detected font isn't in the table, this section simply doesn't render — no empty state needed, since "no known alternative" isn't actionable information worth a line. Ships as a static JSON file bundled with the extension; not fetched at runtime.

**Explicitly out of scope for Phase 1:**
- Any network/API calls — source and alternatives are derived entirely from the page's own loaded CSS plus a bundled static dataset; nothing leaves the browser.
- Text rendered as an image or on `<canvas>` (no real computed style exists).
- Persistence (history, saved lookups), options page, non-Chrome browsers.
- Guaranteed source/alternative resolution — both are explicitly best-effort; "unknown"/absent are expected, valid outcomes, not bugs.

**Success criteria:**
- Reported family/weight/size/style/line-height/letter-spacing match DevTools' Computed panel for the same element, across a handful of real sites with varied typography.
- On pages that load fonts via Google Fonts' `<link>` tag, Source correctly identifies the service and links to the right specimen page.
- A handful of known system fonts (Arial, Helvetica, Times New Roman) correctly show the "system font" state instead of "unknown."
- The alternatives table returns a sensible suggestion for at least the ~10 most common proprietary fonts (Helvetica, Futura, Proxima Nova, Gotham, Avenir, Din, etc.).

---

## Phase 2 — Image/canvas font matching
**Goal:** Cover the case Phase 1 structurally can't — text baked into a logo, screenshot, or canvas element, where there's no DOM text or computed style to read.

**Scope (indicative, to be scoped in detail when we get here):**
- Detect when the clicked target is an `<img>`/`<canvas>`/background-image region rather than text.
- Let the user drag-select a region of the page (screenshot-style) instead of clicking an element.
- Send the cropped image to a font-recognition API (e.g. WhatTheFont-style service) and show the best-guess match(es).
- Needs: an API key/credentials flow, a loading/uncertainty state in the UI (matches are probabilistic), and a privacy note since page content leaves the browser.

**Depends on:** Phase 1's card UI and shadow-DOM overlay (extended, not replaced).

---

## Phase 3 — Live source & alternative matching (upgrade)
**Goal:** Phase 1 ships Source and Free Alternatives as best-effort, CSS-only/offline features. Phase 3 upgrades both from "best-effort" to "comprehensive" using live lookups — same two card sections, no new UI surface.

**Scope (indicative):**
- Call the Google Fonts catalog API to confirm/expand source detection beyond what Phase 1 can see from the page alone (e.g. the font *is* a Google Font, but this particular page self-hosts it rather than loading it from Google's CDN).
- Replace the static ~30–50-entry alternatives table with a live similarity lookup (API or a much larger dataset) covering long-tail fonts Phase 1's table misses.
- Also benefits Phase 2 results — an image-matched font gets the same live source/alternative lookup once identified.
- Needs: API key/credentials flow, request caching (avoid re-querying the same font repeatedly), rate-limit handling, and a loading state on the card while the live lookup resolves.

**Depends on:** Phase 1's Source and Free Alternatives sections (extends them, doesn't replace the card).

---

## Phase 4 — Saved Fonts Library
**Goal:** Let a designer bookmark fonts they like as they browse, and revisit them later in one place — turns one-off lookups into a personal collection. (This replaces the earlier, vaguer "auto-history" idea with explicit, user-curated bookmarking — nothing is saved unless the designer chooses to save it.)

**Scope:**
- Adds a **★ Save** control to the existing result card (next to the font name), plus a **"View saved fonts →"** link/icon that opens the library.
- Saving a font stores a full snapshot of everything the card showed — name, CSS details, source (or "unknown"/"system font"), any matched alternative — plus the page URL/title it was found on and a timestamp. It's a snapshot, not a live re-computation: what's saved reflects the page at save time even if that page's fonts change later.
- Storage: `chrome.storage.local` — device-local, no account, no sync in v1 (see open question below).
- Library view: a full extension page (`chrome-extension://.../library.html`), opened in a new browser tab — a grid of saved-font cards, each showing name, a live type sample, a link back to the source page, save date, and a remove/un-bookmark control.
- Copy a CSS snippet (`font-family`, `font-weight`, `font-size`, etc.) with one click, from either the result card or a saved card.
- Empty state: "No saved fonts yet — click ★ Save on any result to start your collection."

**Explicitly out of scope for Phase 4:**
- Cross-device sync (device-local storage only for v1).
- Editing/annotating saved entries (tags, notes, folders) — flat list only.
- The pairing feature itself (Phase 5, builds on this library).

**Depends on:** Phase 1's result card (adds the Save control to it).

---

## Phase 5 — Font Pairing Preview
**Goal:** Let a designer select two or more saved fonts and see how they look paired together, without leaving the extension.

**Scope:**
- In the Phase 4 Library view, each saved-font card gets a checkbox; selecting 2+ surfaces a **"Preview pairing"** action.
- The preview renders sample text using the selected fonts in different roles — e.g. a headline in the first, body copy in the second (extends to more roles if 3+ are selected).
- Rendering fidelity is tied to how well Source was resolved for each font:
  - If Source resolved to a known Google Fonts URL (via Phase 1's CSS-only detection or Phase 3's live confirmation), dynamically load that exact font file for the preview. **This is the one deliberate exception to the extension's zero-network-call design** — scoped tightly to the Library tab, on-demand only (fires when a pairing preview is opened), and limited to the specific font(s) being previewed.
  - Otherwise (self-hosted/unknown/system source), render with the saved fallback stack or whatever's installed locally, with a visible **"⚠ approximated — source unknown"** note so the designer isn't misled into thinking it's exact.
- No saving/exporting a "pairing" as its own object in v1 — it's a live, disposable preview generated each time.

**Explicitly out of scope for Phase 5:**
- Pairing suggestions/recommendations ("fonts that go well with X") — manual selection only, no algorithmic matching.
- Exporting a pairing as an image, CSS snippet, or shareable link.

**Depends on:** Phase 4's Saved Fonts Library (selection happens there). Benefits from Phase 3's live source confirmation (more pairings render at full fidelity) but works on top of Phase 1 alone.

---

## Open questions to revisit before each later phase
- Phase 1: which ~30–50 fonts go in the launch alternatives table (needs a curated list before build).
- Phase 2: which font-matching API/vendor, cost model, and whether it needs a user-provided API key (ties into "technical/API stuff" you mentioned adding later).
- Phase 3: rate limits / caching for the Google Fonts lookup; how "confirmed via API" is visually distinguished from Phase 1's "detected from page CSS."
- Phase 4: local-only vs. synced storage for saved fonts — local-only is simplest for v1, but means bookmarks don't follow the designer to another machine.
- Phase 5: how many role "slots" to support when 3+ fonts are selected for pairing (headline/body is clear for 2; less obvious beyond that); whether the live-font-loading exception needs its own explicit user-facing note the first time it fires, since it's the one case where something leaves the browser.

We are building **Phase 1 only** right now — the full four-section result card (name, CSS details, best-effort source, offline free alternatives), all without network calls. Phases 4–5 (bookmarking and pairing) are scoped and sequenced but not started.

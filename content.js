(function () {
  // Re-injection guard: executeScript re-runs this whole file on every
  // "Start Inspecting" / Alt+I press. If we've already set up the shadow
  // host once, just (re)start picking instead of rebuilding everything.
  if (window.__fontscopeToggle) {
    window.__fontscopeToggle();
    return;
  }

  const CARD_WIDTH = 330;
  const loadedGoogleFonts = new Set();

  // ---- shadow host setup (once per page load) ----
  const hostEl = document.createElement("div");
  hostEl.id = "fontscope-host";
  Object.assign(hostEl.style, {
    position: "fixed",
    inset: "0",
    width: "0",
    height: "0",
    zIndex: "2147483647",
    pointerEvents: "none"
  });
  document.documentElement.appendChild(hostEl);
  const shadow = hostEl.attachShadow({ mode: "open" });

  const fontsLink = document.createElement("link");
  fontsLink.rel = "stylesheet";
  fontsLink.href = chrome.runtime.getURL("assets/fonts/fonts.css");
  shadow.appendChild(fontsLink);

  const themeLink = document.createElement("link");
  themeLink.rel = "stylesheet";
  themeLink.href = chrome.runtime.getURL("assets/theme.css");
  shadow.appendChild(themeLink);

  const styleLink = document.createElement("link");
  styleLink.rel = "stylesheet";
  styleLink.href = chrome.runtime.getURL("content.css");
  shadow.appendChild(styleLink);

  self.FontscopeStorage.getTheme().then((theme) => hostEl.setAttribute("data-theme", theme));

  const root = document.createElement("div");
  root.id = "fontscope-root";
  shadow.appendChild(root);

  const highlight = document.createElement("div");
  highlight.className = "fs-highlight";
  root.appendChild(highlight);

  const toast = document.createElement("div");
  toast.className = "fs-toast";
  root.appendChild(toast);

  const card = document.createElement("div");
  card.className = "fs-card";
  card.style.pointerEvents = "auto";
  root.appendChild(card);

  // ---- state ----
  let state = "idle"; // idle | picking | card
  let toastTimer = null;

  function icon(name) {
    return (self.FontscopeIcons && self.FontscopeIcons[name]) || "";
  }

  function mountIcons(container) {
    container.querySelectorAll("[data-icon]").forEach((el) => {
      el.innerHTML = icon(el.getAttribute("data-icon"));
    });
  }

  // ---- highlight ----
  function showHighlight(el) {
    const r = el.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: "block",
      top: `${r.top - 2}px`,
      left: `${r.left - 2}px`,
      width: `${r.width + 4}px`,
      height: `${r.height + 4}px`
    });
  }
  function hideHighlight() {
    highlight.style.display = "none";
  }

  // ---- toast ----
  function showToast(text, x, y) {
    toast.textContent = text;
    Object.assign(toast.style, { display: "block", left: `${x + 12}px`, top: `${y + 12}px` });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.display = "none";
    }, 1600);
  }

  // ---- helpers ----
  function hasVisibleText(el) {
    if (["INPUT", "TEXTAREA"].includes(el.tagName)) return true;
    const txt = (el.innerText || el.textContent || "").trim();
    return txt.length > 0;
  }

  function buildCssBlock(data) {
    return [
      `font-family: ${data.fontFamilyStack};`,
      `font-weight: ${data.weight};`,
      `font-size: ${data.fontSizePx}px;`,
      `line-height: ${data.lineHeightPx}px;`,
      `letter-spacing: ${data.letterSpacing};`,
      `color: ${data.color};`
    ].join("\n");
  }

  function ensureGoogleFont(family) {
    if (loadedGoogleFonts.has(family)) return;
    loadedGoogleFonts.add(family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = self.Fontscope.googleFontsCssUrl(family);
    document.head.appendChild(link);
  }

  // ---- card ----
  const CARD_TEMPLATE = `
    <div class="fs-row-between">
      <div class="fs-eyebrow"><span class="fs-icon" data-icon="file_search"></span><span>Identified Font</span></div>
      <div class="fs-header-actions">
        <div class="fs-badge">Detected</div>
        <button class="fs-save-btn" id="fs-save-btn" title="Save this font"><span class="fs-icon" data-icon="bookmark"></span></button>
      </div>
    </div>
    <div class="fs-name-block">
      <p class="fs-font-name" id="fs-font-name"></p>
      <div class="fs-sample" id="fs-sample">The quick brown fox jumps over the lazy dog.</div>
    </div>
    <div class="fs-section">
      <p class="fs-section-label">CSS Properties</p>
      <div>
        <div class="fs-spec-row"><span class="fs-spec-label">Font Family</span><span class="fs-spec-value" id="fs-val-family"></span></div>
        <div class="fs-spec-row"><span class="fs-spec-label">Font Weight</span><span class="fs-spec-value" id="fs-val-weight"></span></div>
        <div class="fs-spec-row"><span class="fs-spec-label">Font Size</span><span class="fs-spec-value" id="fs-val-size"></span></div>
        <div class="fs-spec-row"><span class="fs-spec-label">Line Height</span><span class="fs-spec-value" id="fs-val-lh"></span></div>
        <div class="fs-spec-row"><span class="fs-spec-label">Color</span><span class="fs-spec-value" id="fs-val-color"></span></div>
      </div>
    </div>
    <div class="fs-section">
      <p class="fs-section-label">Distributor</p>
      <div class="fs-distributor-row">
        <div class="fs-distributor-left"><span class="fs-icon" data-icon="type" id="fs-icon-distributor"></span><span id="fs-distributor-label"></span></div>
        <button class="fs-get-font" id="fs-distributor-action"></button>
      </div>
    </div>
    <div class="fs-section fs-section-alt" id="fs-alt-section" style="display:none;">
      <p class="fs-section-label">Free Alternatives</p>
      <div class="fs-alt-list" id="fs-alt-list"></div>
    </div>
    <button class="fs-copy-btn" id="fs-copy-btn"><span class="fs-icon" data-icon="clipboard_check"></span><span id="fs-copy-label">Copy Entire CSS Block</span></button>
  `;

  function renderCard(data, source, x, y) {
    card.innerHTML = CARD_TEMPLATE;
    mountIcons(card);

    const nameEl = card.querySelector("#fs-font-name");
    const sampleEl = card.querySelector("#fs-sample");
    nameEl.textContent = data.family;
    nameEl.style.fontFamily = data.fontFamilyStack;
    sampleEl.style.fontFamily = data.fontFamilyStack;

    card.querySelector("#fs-val-family").textContent = data.fontFamilyStack;
    card.querySelector("#fs-val-weight").textContent = data.weightLabel;
    card.querySelector("#fs-val-size").textContent = `${data.fontSizePx}px / ${data.fontSizeRem}rem`;
    card.querySelector("#fs-val-lh").textContent = `${data.lineHeightRatio} / ${data.lineHeightPx}px`;
    card.querySelector("#fs-val-color").textContent = data.color;

    renderDistributor(source, data.family);
    wireSaveButton(data, source);

    const copyBtn = card.querySelector("#fs-copy-btn");
    const copyLabel = card.querySelector("#fs-copy-label");
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(buildCssBlock(data)).then(() => {
        copyLabel.textContent = "Copied!";
        setTimeout(() => {
          copyLabel.textContent = "Copy Entire CSS Block";
        }, 1400);
      });
    });

    self.Fontscope.alternativesFor(data.family).then((alts) => {
      renderAlternatives(alts, data, nameEl, sampleEl);
    });

    card.style.display = "flex";
    positionCard(x, y);
  }

  async function wireSaveButton(data, source) {
    const btn = card.querySelector("#fs-save-btn");
    const saved = await self.FontscopeStorage.isSaved(data.family);
    btn.classList.toggle("is-saved", saved);

    btn.addEventListener("click", async () => {
      const currentlySaved = btn.classList.contains("is-saved");
      if (currentlySaved) {
        const list = await self.FontscopeStorage.getSaved();
        const match = list.find((f) => f.name.toLowerCase() === data.family.toLowerCase());
        if (match) await self.FontscopeStorage.removeFont(match.id);
        btn.classList.remove("is-saved");
      } else {
        await self.FontscopeStorage.saveFont({
          name: data.family,
          fontFamilyStack: data.fontFamilyStack,
          weight: data.weight,
          weightLabel: data.weightLabel,
          fontSizePx: data.fontSizePx,
          fontSizeRem: data.fontSizeRem,
          lineHeightRatio: data.lineHeightRatio,
          lineHeightPx: data.lineHeightPx,
          style: data.style,
          letterSpacing: data.letterSpacing,
          color: data.color,
          source,
          page: location.href
        });
        btn.classList.add("is-saved");
      }
    });
  }

  function renderDistributor(source, family) {
    const iconEl = card.querySelector("#fs-icon-distributor");
    const labelEl = card.querySelector("#fs-distributor-label");
    const actionEl = card.querySelector("#fs-distributor-action");

    if (source.type === "system") {
      iconEl.setAttribute("data-icon", "lock");
      labelEl.textContent = "System font";
      actionEl.textContent = "Pre-installed";
      actionEl.disabled = true;
    } else if (source.type === "fontface") {
      iconEl.setAttribute("data-icon", "type");
      labelEl.textContent = "Self-hosted";
      actionEl.textContent = "View File";
      actionEl.disabled = false;
      actionEl.addEventListener("click", () => window.open(source.url, "_blank", "noopener"));
    } else if (source.type === "service") {
      iconEl.setAttribute("data-icon", "type");
      labelEl.textContent = source.label;
      actionEl.textContent = "Get Font";
      actionEl.disabled = false;
      actionEl.addEventListener("click", () => window.open(source.url, "_blank", "noopener"));
    } else {
      iconEl.setAttribute("data-icon", "circle_help");
      labelEl.textContent = "Source unknown";
      actionEl.textContent = "—";
      actionEl.disabled = true;
    }
    mountIcons(card.querySelector(".fs-distributor-left"));
  }

  function renderAlternatives(alts, data, nameEl, sampleEl) {
    const section = card.querySelector("#fs-alt-section");
    const list = card.querySelector("#fs-alt-list");
    if (!alts.length) {
      section.style.display = "none";
      return;
    }
    section.style.display = "flex";
    list.innerHTML = "";

    let activeAlt = null;
    const originalStack = data.fontFamilyStack;

    alts.forEach((alt) => {
      const row = document.createElement("div");
      row.className = "fs-alt-item";
      row.innerHTML = `
        <div class="fs-alt-text">
          <p class="fs-alt-name">${alt.name}</p>
          <p class="fs-alt-source">${alt.source}</p>
        </div>
        <button class="fs-preview-btn">Preview</button>
      `;
      const btn = row.querySelector(".fs-preview-btn");
      btn.addEventListener("click", () => {
        const isActive = btn.classList.contains("is-active");
        list.querySelectorAll(".fs-preview-btn").forEach((b) => {
          b.classList.remove("is-active");
          b.textContent = "Preview";
        });
        if (isActive) {
          nameEl.style.fontFamily = originalStack;
          sampleEl.style.fontFamily = originalStack;
          activeAlt = null;
          return;
        }
        if (alt.source === "Google Fonts") ensureGoogleFont(alt.name);
        const previewStack = `'${alt.name}', ${originalStack}`;
        nameEl.style.fontFamily = previewStack;
        sampleEl.style.fontFamily = previewStack;
        btn.classList.add("is-active");
        btn.textContent = "Reset";
        activeAlt = alt.name;
      });
      list.appendChild(row);
    });
  }

  function positionCard(x, y) {
    let left = x + 16;
    if (left + CARD_WIDTH > window.innerWidth) left = window.innerWidth - CARD_WIDTH - 16;
    if (left < 8) left = 8;
    card.style.left = `${left}px`;

    card.style.top = `${Math.min(y + 16, window.innerHeight * 0.15)}px`;
    requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect();
      if (rect.bottom > window.innerHeight - 16) {
        card.style.top = `${Math.max(16, window.innerHeight - rect.height - 16)}px`;
      }
    });
  }

  function closeCard() {
    card.style.display = "none";
    card.innerHTML = "";
  }

  // ---- picking lifecycle ----
  function onMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hostEl) {
      hideHighlight();
      return;
    }
    showHighlight(el);
  }

  function onClick(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hostEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    handleSelection(el, e.clientX, e.clientY);
  }

  function onKeyDown(e) {
    if (e.key !== "Escape") return;
    if (card.style.display === "flex") {
      // First Esc just dismisses the card — picking mode (hover/click)
      // stays active so the user can keep inspecting other elements.
      closeCard();
    } else {
      deactivateAll();
    }
  }

  function handleSelection(el, x, y) {
    if (!hasVisibleText(el)) {
      showToast("No text here — try a different element.", x, y);
      return;
    }
    const data = self.Fontscope.extractComputedStyle(el);
    const source = self.Fontscope.detectSource(data.family);

    hideHighlight();
    renderCard(data, source, x, y);

    chrome.runtime.sendMessage({
      type: "FONT_DETECTED",
      payload: { name: data.family, page: location.href }
    });
  }

  function activatePicking() {
    state = "picking";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown);
    document.body.style.cursor = "crosshair";
    chrome.runtime.sendMessage({ type: "STATE_CHANGED", active: true });
  }

  function deactivateAll() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown);
    document.body.style.cursor = "";
    hideHighlight();
    closeCard();
    state = "idle";
    chrome.runtime.sendMessage({ type: "STATE_CHANGED", active: false });
  }

  function startInspecting() {
    deactivateAll();
    activatePicking();
  }

  window.__fontscopeToggle = startInspecting;
  startInspecting();
})();

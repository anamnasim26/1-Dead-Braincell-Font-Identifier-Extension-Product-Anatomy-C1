function mountIcons(root) {
  root.querySelectorAll("[class*='icon-']").forEach((el) => {
    const match = Array.from(el.classList).find((c) => c.startsWith("icon-"));
    if (!match) return;
    const key = match.replace("icon-", "");
    const svg = self.FontscopeIcons && self.FontscopeIcons[key];
    if (svg) el.innerHTML = svg;
  });
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url || "";
  }
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const selected = new Set();
let cache = [];

function distributorLabel(source) {
  if (!source) return { label: "Unknown", action: null };
  if (source.type === "system") return { label: "System font", action: null };
  if (source.type === "fontface") return { label: "Self-hosted", action: source.url };
  if (source.type === "service") return { label: source.label, action: source.url };
  return { label: "Unknown", action: null };
}

function renderGrid() {
  const grid = document.getElementById("grid");
  const empty = document.getElementById("empty-state");
  const countEl = document.getElementById("saved-count");

  countEl.textContent = cache.length ? `${cache.length} saved font${cache.length === 1 ? "" : "s"}` : "Saved Fonts";

  if (!cache.length) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  grid.innerHTML = "";
  cache.forEach((font) => {
    const dist = distributorLabel(font.source);
    const card = document.createElement("div");
    card.className = "font-card" + (selected.has(font.id) ? " is-selected" : "");
    card.innerHTML = `
      <div class="font-card-top">
        <div>
          <p class="font-card-name" style="font-family: '${font.name.replace(/'/g, "")}', sans-serif;">${font.name}</p>
        </div>
        <div class="font-card-select${selected.has(font.id) ? " is-checked" : ""}" data-id="${font.id}" title="Select for pairing"></div>
      </div>
      <div class="font-card-sample" style="font-family: '${font.name.replace(/'/g, "")}', sans-serif;">The quick brown fox jumps over the lazy dog.</div>
      <div class="font-card-meta">
        <span>${font.weightLabel || ""}</span>
        <span>${font.fontSizePx}px</span>
        <span>${dist.label}</span>
        <span>${hostnameOf(font.page)}</span>
        <span>${timeAgo(font.savedAt)}</span>
      </div>
      <div class="font-card-actions">
        <button class="font-card-link" ${dist.action ? "" : "disabled"}>${dist.action ? "Get Font" : "—"}</button>
        <button class="font-card-delete" title="Remove"><span class="icon icon-trash_2"></span></button>
      </div>
    `;

    card.querySelector(".font-card-select").addEventListener("click", () => toggleSelect(font.id));

    const linkBtn = card.querySelector(".font-card-link");
    if (dist.action) {
      linkBtn.addEventListener("click", () => window.open(dist.action, "_blank", "noopener"));
    }

    card.querySelector(".font-card-delete").addEventListener("click", async () => {
      selected.delete(font.id);
      cache = await self.FontscopeStorage.removeFont(font.id);
      renderGrid();
      updatePairing();
    });

    grid.appendChild(card);
    mountIcons(card);
  });
}

function toggleSelect(id) {
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    if (selected.size >= 2) {
      const [first] = selected;
      selected.delete(first);
    }
    selected.add(id);
  }
  renderGrid();
  updatePairing();
}

function updatePairing() {
  const panel = document.getElementById("pairing-panel");
  const hint = document.getElementById("pairing-hint");
  if (selected.size !== 2) {
    panel.hidden = true;
    hint.hidden = false;
    return;
  }
  hint.hidden = true;
  panel.hidden = false;

  const [idA, idB] = Array.from(selected);
  const fontA = cache.find((f) => f.id === idA);
  const fontB = cache.find((f) => f.id === idB);

  const heading = document.getElementById("pairing-heading");
  const body = document.getElementById("pairing-body");
  heading.style.fontFamily = `'${fontA.name.replace(/'/g, "")}', sans-serif`;
  body.style.fontFamily = `'${fontB.name.replace(/'/g, "")}', sans-serif`;
  document.getElementById("pairing-heading-label").textContent = `Heading: ${fontA.name}`;
  document.getElementById("pairing-body-label").textContent = `Body: ${fontB.name}`;
}

async function loadFonts() {
  cache = await self.FontscopeStorage.getSaved();
  renderGrid();
  updatePairing();
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("theme-toggle");
  toggle.innerHTML = `<span class="icon icon-${theme === "dark" ? "sun" : "moon"}"></span>`;
  mountIcons(toggle);
}

document.addEventListener("DOMContentLoaded", async () => {
  mountIcons(document);
  await loadFonts();

  const theme = await self.FontscopeStorage.getTheme();
  applyTheme(theme);

  document.getElementById("theme-toggle").addEventListener("click", async () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    await self.FontscopeStorage.setTheme(next);
    applyTheme(next);
  });

  document.getElementById("pairing-close").addEventListener("click", () => {
    selected.clear();
    renderGrid();
    updatePairing();
  });
});

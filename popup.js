function mountIcons(root) {
  root.querySelectorAll("[class*='icon-']").forEach((el) => {
    const match = Array.from(el.classList).find((c) => c.startsWith("icon-"));
    if (!match) return;
    const key = match.replace("icon-", "");
    const svg = self.FontscopeIcons && self.FontscopeIcons[key];
    if (svg) el.innerHTML = svg;
  });
}

function hostnameAndPath(url) {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname}${path}`;
  } catch (e) {
    return url || "";
  }
}

function renderRecent(list) {
  const container = document.getElementById("recent-list");
  const empty = document.getElementById("recent-empty");
  container.querySelectorAll(".recent-item").forEach((n) => n.remove());

  if (!list.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  list.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "recent-item" + (index === 0 ? " is-latest" : "");
    row.title = entry.page || "";

    row.innerHTML = `
      <div class="recent-avatar" style="font-family: '${(entry.name || "").replace(/'/g, "")}', sans-serif;">Aa</div>
      <div class="recent-text">
        <p class="recent-name">${entry.name || "Unknown"}</p>
        <p class="recent-source">${hostnameAndPath(entry.page)}</p>
      </div>
      <span class="icon icon-chevron_right" aria-hidden="true"></span>
    `;
    container.appendChild(row);
    mountIcons(row);
  });
}

async function loadRecent() {
  const res = await chrome.runtime.sendMessage({ type: "GET_RECENT" });
  renderRecent((res && res.recent) || []);
}

async function refreshStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const res = await chrome.runtime.sendMessage({ type: "GET_STATE", tabId: tab.id });
  const pill = document.getElementById("status-pill");
  const label = document.getElementById("status-label");
  if (res && res.active) {
    pill.classList.add("inspecting");
    label.textContent = "Inspecting";
  } else {
    pill.classList.remove("inspecting");
    label.textContent = "Ready";
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("theme-toggle");
  toggle.innerHTML = `<span class="icon icon-${theme === "dark" ? "sun" : "moon"}"></span>`;
  mountIcons(toggle);
}

async function initTheme() {
  const theme = await self.FontscopeStorage.getTheme();
  applyTheme(theme);
}

document.addEventListener("DOMContentLoaded", () => {
  mountIcons(document);
  loadRecent();
  refreshStatus();
  initTheme();

  document.getElementById("activate-btn").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "START_INSPECTING" });
    window.close();
  });

  document.getElementById("clear-link").addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "CLEAR_RECENT" });
    renderRecent([]);
  });

  document.getElementById("theme-toggle").addEventListener("click", async () => {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    await self.FontscopeStorage.setTheme(next);
    applyTheme(next);
  });

  document.getElementById("dashboard-btn").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    window.close();
  });
});

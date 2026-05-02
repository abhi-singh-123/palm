// Elements
const saveBtn = document.getElementById("saveBtn");
const dashboardBtn = document.getElementById("dashboardBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const savingState = document.getElementById("savingState");
const mainPanel = document.getElementById("mainPanel");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveApiKey = document.getElementById("saveApiKey");
const searchInput = document.getElementById("searchInput");
const linksList = document.getElementById("linksList");
const emptyState = document.getElementById("emptyState");

// Init
document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get("palmApiKey", ({ palmApiKey }) => {
    if (!palmApiKey) {
      settingsPanel.classList.remove("hidden");
    }
    if (palmApiKey) {
      apiKeyInput.value = palmApiKey;
    }
  });
  chrome.storage.local.get("palmLinks", ({ palmLinks }) => {
    updateBadge((palmLinks || []).length);
  });
  loadLinks();
  refreshUsageDisplay();
});


// Save current page
saveBtn.addEventListener("click", () => {
  chrome.storage.sync.get("palmApiKey", ({ palmApiKey }) => {
    if (!palmApiKey) {
      settingsPanel.classList.remove("hidden");
      showToast("Add your API key first.");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    mainPanel.classList.add("hidden");
    savingState.classList.remove("hidden");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];

      // Grab page content directly via scripting — no content script needed
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => {
            const noiseSelectors = "nav, header, footer, aside, .sidebar, .navigation, .menu, .ad, .advertisement, .related, .comments, .cookie, [class*='sidebar'], [class*='related'], [class*='recommend'], [id*='sidebar']";

            // Clone to avoid mutating the live page DOM
            const clone = document.body.cloneNode(true);
            clone.querySelectorAll(noiseSelectors).forEach(el => el.remove());

            const article = clone.querySelector("article, [role='main'], main, .post-content, .article-body, .entry-content, .content-body, [class*='article'], [class*='post-body']");
            const content = article ? article.innerText : clone.innerText || "";
            return {
              title: document.title || "",
              url: window.location.href,
              content: content.slice(0, 8000)
            };
          }
        },
        (results) => {
          if (chrome.runtime.lastError || !results?.[0]?.result) {
            savingState.classList.add("hidden");
            mainPanel.classList.remove("hidden");
            saveBtn.disabled = false;
            saveBtn.textContent = "Save This Page";
            showToast("Cannot save this page type.");
            return;
          }

          const { title, url, content } = results[0].result;

          // Duplicate detection
          chrome.storage.local.get("palmLinks", ({ palmLinks }) => {
            const existing = (palmLinks || []).find(l => l.url === url);
            if (existing) {
              savingState.classList.add("hidden");
              mainPanel.classList.remove("hidden");
              saveBtn.disabled = false;
              saveBtn.textContent = "Save This Page";
              showToast("Already saved!");
              return;
            }

            chrome.runtime.sendMessage(
              { action: "summarize", data: { title, url, content, selectedText: "" } },
              (response) => {
                savingState.classList.add("hidden");
                mainPanel.classList.remove("hidden");
                saveBtn.disabled = false;
                saveBtn.textContent = "Save This Page";

                if (response?.error) {
                  showToast("Error: " + response.error);
                  return;
                }

                const link = {
                  id: Date.now().toString(36) + Math.random().toString(36).slice(2),
                  title,
                  url,
                  summary: response.summary,
                  tags: response.tags,
                  savedAt: new Date().toISOString()
                };

                const links = [link, ...(palmLinks || [])];
                chrome.storage.local.set({ palmLinks: links }, () => {
                  updateBadge(links.length);
                  incrementUsage();
                  showToast("Saved!");
                  loadLinks();
                });
              }
            );
          });
        }
      );
    });
  });
});

// Open full dashboard
dashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// Toggle settings
settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
  refreshUsageDisplay();
});

// Save API key
saveApiKey.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showToast("Please enter a valid API key.");
    return;
  }
  chrome.storage.sync.set({ palmApiKey: key }, () => {
    settingsPanel.classList.add("hidden");
    showToast("API key saved!");
  });
});

// Search
searchInput.addEventListener("input", () => {
  loadLinks(searchInput.value.trim().toLowerCase());
});

// Load and render links
function loadLinks(query = "") {
  chrome.storage.local.get("palmLinks", ({ palmLinks }) => {
    const links = palmLinks || [];
    const filtered = query
      ? links.filter(l =>
          l.title.toLowerCase().includes(query) ||
          l.summary?.toLowerCase().includes(query) ||
          l.tags?.some(t => t.toLowerCase().includes(query))
        )
      : links;

    linksList.innerHTML = "";

    if (filtered.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    filtered.forEach(link => {
      linksList.appendChild(renderCard(link));
    });
  });
}

// Render a single link card
function renderCard(link) {
  const card = document.createElement("div");
  card.className = "link-card";

  const date = new Date(link.savedAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric"
  });

  card.innerHTML = `
    <div class="link-title" title="${escapeHtml(cleanText(link.title))}">${escapeHtml(cleanText(link.title))}</div>
    <div class="link-summary">${escapeHtml(cleanText(link.summary || ""))}</div>
    <div class="link-footer">
      <div class="link-tags">
        ${(link.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="link-date">${date}</span>
        <button class="link-delete" data-id="${link.id}" title="Delete">×</button>
      </div>
    </div>
  `;

  // Open link on click (not on delete button)
  card.addEventListener("click", (e) => {
    if (e.target.classList.contains("link-delete")) return;
    chrome.tabs.create({ url: link.url });
  });

  // Delete
  card.querySelector(".link-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteLink(link.id);
  });

  return card;
}

function deleteLink(id) {
  chrome.storage.local.get("palmLinks", ({ palmLinks }) => {
    const updated = (palmLinks || []).filter(l => l.id !== id);
    chrome.storage.local.set({ palmLinks: updated }, () => {
      updateBadge(updated.length);
      loadLinks(searchInput.value.trim().toLowerCase());
      showToast("Deleted.");
    });
  });
}

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#2d6a4f" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-05-01"
}

function incrementUsage() {
  const today = getTodayKey();
  chrome.storage.local.get("palmUsage", ({ palmUsage }) => {
    const usage = palmUsage || {};
    const count = usage.date === today ? (usage.count || 0) + 1 : 1;
    chrome.storage.local.set({ palmUsage: { date: today, count } }, refreshUsageDisplay);
  });
}

function refreshUsageDisplay() {
  const today = getTodayKey();
  chrome.storage.local.get("palmUsage", ({ palmUsage }) => {
    const count = (palmUsage?.date === today) ? palmUsage.count : 0;
    const limit = 500;
    const pct = Math.min((count / limit) * 100, 100);

    const countEl = document.getElementById("usageCount");
    const barEl = document.getElementById("usageBar");
    if (!countEl || !barEl) return;

    countEl.textContent = `${count} / ${limit}`;
    barEl.style.width = `${pct}%`;

    const warn = count >= 400;
    const danger = count >= 480;
    countEl.className = "usage-count" + (danger ? " danger" : warn ? " warning" : "");
    barEl.className = "usage-bar" + (danger ? " danger" : warn ? " warning" : "");
  });
}

function cleanText(str) {
  return String(str || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

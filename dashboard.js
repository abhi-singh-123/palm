let allLinks = [];
let activeTag = "all";
let activeGroup = "none";
let searchQuery = "";
let visibleCount = 30;
const PAGE_SIZE = 30;
const collapsedGroups = new Set();

// Tag → color class mapping
const TAG_COLOR = {
  "AI": "tag-blue", "Technology": "tag-blue", "Programming": "tag-blue", "Data": "tag-blue", "Web": "tag-blue",
  "Productivity": "tag-purple", "Tools": "tag-purple", "Learning": "tag-purple",
  "Business": "tag-orange", "Finance": "tag-orange", "Marketing": "tag-orange", "Leadership": "tag-orange", "Career": "tag-orange",
  "Health": "tag-teal", "Science": "tag-teal", "Research": "tag-teal",
  "Security": "tag-red",
  "Design": "tag-pink",
  "News": "", "Other": ""
};

function tagColor(tag) {
  return TAG_COLOR[tag] || "";
}

// Elements
const searchInput  = document.getElementById("searchInput");
const linksGrid    = document.getElementById("linksGrid");
const emptyState   = document.getElementById("emptyState");
const tagList      = document.getElementById("tagList");
const totalCount   = document.getElementById("totalCount");
const resultCount  = document.getElementById("resultCount");
const modal        = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");
const modalClose   = document.getElementById("modalClose");
const exportBtn    = document.getElementById("exportBtn");
const exportMenu   = document.getElementById("exportMenu");

// Init
document.addEventListener("DOMContentLoaded", () => {
  loadLinks();
  tagList.querySelector("[data-tag='all']").addEventListener("click", () => setTag("all"));
});

function loadLinks() {
  chrome.storage.local.get("palmLinks", ({ palmLinks }) => {
    allLinks = palmLinks || [];
    buildTagSidebar();
    render();
  });
}

// Live update while dashboard is open
chrome.storage.onChanged.addListener((changes) => {
  if (changes.palmLinks) {
    allLinks = changes.palmLinks.newValue || [];
    buildTagSidebar();
    render();
  }
});

// ── Sidebar ──
function buildTagSidebar() {
  const tagCounts = {};
  allLinks.forEach(l => (l.tags || []).forEach(t => {
    tagCounts[t] = (tagCounts[t] || 0) + 1;
  }));

  totalCount.textContent = allLinks.length;
  tagList.querySelectorAll(".tag-filter:not([data-tag='all'])").forEach(el => el.remove());

  Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([tag, count]) => {
      const btn = document.createElement("button");
      btn.className = "tag-filter" + (activeTag === tag ? " active" : "");
      btn.dataset.tag = tag;
      btn.innerHTML = `${escapeHtml(tag)} <span class="count">${count}</span>`;
      btn.addEventListener("click", () => setTag(tag));
      tagList.appendChild(btn);
    });

  tagList.querySelector("[data-tag='all']").classList.toggle("active", activeTag === "all");
}

function setTag(tag) {
  activeTag = tag;
  visibleCount = PAGE_SIZE;
  tagList.querySelectorAll(".tag-filter").forEach(b => {
    b.classList.toggle("active", b.dataset.tag === tag);
  });
  render();
}

// ── Group buttons ──
document.querySelectorAll(".group-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    activeGroup = btn.dataset.group;
    visibleCount = PAGE_SIZE;
    document.querySelectorAll(".group-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
});

// ── Search ──
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  visibleCount = PAGE_SIZE;
  render();
});

// ── Render ──
function render() {
  let links = allLinks;

  if (activeTag !== "all") {
    links = links.filter(l => (l.tags || []).includes(activeTag));
  }

  if (searchQuery) {
    links = links.filter(l =>
      l.title?.toLowerCase().includes(searchQuery) ||
      l.summary?.toLowerCase().includes(searchQuery) ||
      (l.tags || []).some(t => t.toLowerCase().includes(searchQuery))
    );
  }

  resultCount.textContent = links.length === allLinks.length
    ? `${links.length} links`
    : `${links.length} of ${allLinks.length}`;

  linksGrid.innerHTML = "";

  if (links.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");

  if (activeTag === "all") {
    renderGrouped(links, l => (l.tags?.[0] || "Untagged"));
  } else if (activeGroup === "date") {
    renderGrouped(links, l => dateGroup(l.savedAt));
  } else {
    // Flat view with pagination
    const visible = links.slice(0, visibleCount);
    visible.forEach(l => linksGrid.appendChild(makeCard(l)));
    if (links.length > visibleCount) {
      addLoadMoreBtn(links.length - visibleCount);
    }
  }
}

function renderGrouped(links, keyFn) {
  const groups = {};
  links.forEach(l => {
    const key = keyFn(l);
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  });

  Object.entries(groups).forEach(([group, groupLinks]) => {
    const isCollapsed = collapsedGroups.has(group);

    const header = document.createElement("div");
    header.className = "group-header";
    header.innerHTML = `
      <span class="group-chevron">${isCollapsed ? "▶" : "▼"}</span>
      <span class="group-header-title">${escapeHtml(group)}</span>
      <div class="group-header-line"></div>
      <span class="group-count">${groupLinks.length}</span>
    `;
    header.addEventListener("click", () => {
      if (collapsedGroups.has(group)) collapsedGroups.delete(group);
      else collapsedGroups.add(group);
      render();
    });
    linksGrid.appendChild(header);

    if (!isCollapsed) {
      const key = `group_${group}`;
      const groupVisible = collapsedGroups.has(key + "_count")
        ? parseInt(collapsedGroups.get(key + "_count"))
        : PAGE_SIZE;

      const visibleLinks = groupLinks.slice(0, groupVisible);
      visibleLinks.forEach(l => linksGrid.appendChild(makeCard(l)));

      if (groupLinks.length > groupVisible) {
        addLoadMoreBtn(groupLinks.length - groupVisible, () => {
          collapsedGroups.set(key + "_count", groupVisible + PAGE_SIZE);
          render();
        });
      }
    }
  });
}

function addLoadMoreBtn(remaining, onClick) {
  const wrap = document.createElement("div");
  wrap.className = "load-more-wrap";
  const btn = document.createElement("button");
  btn.className = "btn-load-more";
  btn.textContent = `Load ${Math.min(remaining, PAGE_SIZE)} more`;
  btn.addEventListener("click", () => {
    if (onClick) {
      onClick();
    } else {
      visibleCount += PAGE_SIZE;
      render();
    }
  });
  wrap.appendChild(btn);
  linksGrid.appendChild(wrap);
}

function dateGroup(iso) {
  const diffDays = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "This Week";
  if (diffDays <= 30) return "This Month";
  return "Older";
}

// ── Card ──
function makeCard(link) {
  const card = document.createElement("div");
  const color = tagColor(link.tags?.[0] || "");
  card.className = "link-card" + (color ? " " + color : "");

  const domain = getDomain(link.url);
  const date = new Date(link.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const hasSummary = link.summary && link.summary.trim().length > 0;

  card.innerHTML = `
    <div class="card-domain">
      <img class="card-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" />
      ${escapeHtml(domain)}
    </div>
    <div class="card-title">${escapeHtml(cleanText(link.title))}</div>
    ${hasSummary
      ? `<div class="card-summary">${escapeHtml(cleanText(link.summary))}</div>`
      : `<div class="card-no-summary">No summary <button class="btn-generate">✦ Generate</button></div>`
    }
    <div class="card-footer">
      <div class="card-tags">
        ${(link.tags || []).map(t => `<span class="tag ${tagColor(t)}">${escapeHtml(t)}</span>`).join("")}
      </div>
      <div class="card-actions">
        <span class="card-date">${date}</span>
        <button class="card-delete" title="Delete">×</button>
      </div>
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.classList.contains("card-delete")) return;
    if (e.target.classList.contains("btn-generate")) return;
    openModal(link);
  });

  card.querySelector(".card-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteLink(link.id);
  });

  const generateBtn = card.querySelector(".btn-generate");
  if (generateBtn) {
    generateBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resimmarize(link, generateBtn);
    });
  }

  return card;
}

// ── Modal ──
function openModal(link) {
  const domain = getDomain(link.url);
  const date = new Date(link.savedAt).toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });

  modalContent.innerHTML = `
    <div class="modal-domain">
      <img class="card-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" />
      ${escapeHtml(domain)} · ${date}
    </div>
    <div class="modal-title-wrap">
      <div class="modal-title" id="modalTitleText">${escapeHtml(cleanText(link.title))}</div>
      <input class="modal-title-editor hidden" id="modalTitleEditor" value="${escapeHtml(cleanText(link.title))}" />
      <div class="title-edit-actions hidden" id="titleEditActions">
        <button class="btn-save-summary" id="saveTitleBtn">Save</button>
        <button class="btn-cancel-summary" id="cancelTitleBtn">Cancel</button>
      </div>
      <button class="btn-edit-summary" id="editTitleBtn">Edit</button>
    </div>
    <div class="modal-summary-wrap">
      <div class="modal-summary-label">
        Summary
        <button class="btn-edit-summary" id="editSummaryBtn">Edit</button>
      </div>
      <div class="modal-summary" id="modalSummaryText">${escapeHtml(cleanText(link.summary || "No summary yet."))}</div>
      <textarea class="modal-summary-editor hidden" id="modalSummaryEditor">${escapeHtml(cleanText(link.summary || ""))}</textarea>
      <div class="summary-edit-actions hidden" id="summaryEditActions">
        <button class="btn-save-summary" id="saveSummaryBtn">Save</button>
        <button class="btn-cancel-summary" id="cancelSummaryBtn">Cancel</button>
      </div>
    </div>
    <div class="modal-tag-label">Tags</div>
    <div class="modal-tags" id="modalTags">
      ${(link.tags || []).map(t => `
        <span class="tag ${tagColor(t)} tag-editable">
          ${escapeHtml(t)}
          <button class="tag-remove" data-tag="${escapeHtml(t)}">×</button>
        </span>`).join("")}
      <div class="tag-add-wrap">
        <input id="tagInput" class="tag-input" placeholder="+ add tag" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-primary" id="modalOpen">Open Link</button>
      <button class="btn-ghost" id="modalDelete">Delete</button>
    </div>
  `;

  document.getElementById("modalOpen").addEventListener("click", () => {
    trackOpen(link.id);
    chrome.tabs.create({ url: link.url });
  });
  document.getElementById("modalDelete").addEventListener("click", () => {
    deleteLink(link.id);
    modal.classList.add("hidden");
  });

  // Edit title
  const editTitleBtn = document.getElementById("editTitleBtn");
  const titleText = document.getElementById("modalTitleText");
  const titleEditor = document.getElementById("modalTitleEditor");
  const titleEditActions = document.getElementById("titleEditActions");

  editTitleBtn.addEventListener("click", () => {
    titleText.classList.add("hidden");
    titleEditor.classList.remove("hidden");
    titleEditActions.classList.remove("hidden");
    editTitleBtn.classList.add("hidden");
    titleEditor.focus(); titleEditor.select();
  });

  document.getElementById("cancelTitleBtn").addEventListener("click", () => {
    titleEditor.value = cleanText(link.title);
    titleText.classList.remove("hidden");
    titleEditor.classList.add("hidden");
    titleEditActions.classList.add("hidden");
    editTitleBtn.classList.remove("hidden");
  });

  document.getElementById("saveTitleBtn").addEventListener("click", () => {
    const newTitle = titleEditor.value.trim();
    if (!newTitle) return;
    link.title = newTitle;
    titleText.textContent = newTitle;
    titleText.classList.remove("hidden");
    titleEditor.classList.add("hidden");
    titleEditActions.classList.add("hidden");
    editTitleBtn.classList.remove("hidden");
    const idx = allLinks.findIndex(l => l.id === link.id);
    if (idx !== -1) allLinks[idx] = link;
    chrome.storage.local.set({ palmLinks: allLinks }, () => render());
  });

  titleEditor.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("saveTitleBtn").click();
    if (e.key === "Escape") document.getElementById("cancelTitleBtn").click();
  });

  // Edit summary
  const editBtn = document.getElementById("editSummaryBtn");
  const summaryText = document.getElementById("modalSummaryText");
  const summaryEditor = document.getElementById("modalSummaryEditor");
  const summaryEditActions = document.getElementById("summaryEditActions");

  editBtn.addEventListener("click", () => {
    summaryText.classList.add("hidden");
    summaryEditor.classList.remove("hidden");
    summaryEditActions.classList.remove("hidden");
    editBtn.classList.add("hidden");
    summaryEditor.focus();
  });

  document.getElementById("cancelSummaryBtn").addEventListener("click", () => {
    summaryEditor.value = link.summary || "";
    summaryText.classList.remove("hidden");
    summaryEditor.classList.add("hidden");
    summaryEditActions.classList.add("hidden");
    editBtn.classList.remove("hidden");
  });

  document.getElementById("saveSummaryBtn").addEventListener("click", () => {
    const newSummary = summaryEditor.value.trim();
    link.summary = newSummary;
    summaryText.textContent = newSummary;
    summaryText.classList.remove("hidden");
    summaryEditor.classList.add("hidden");
    summaryEditActions.classList.add("hidden");
    editBtn.classList.remove("hidden");
    const idx = allLinks.findIndex(l => l.id === link.id);
    if (idx !== -1) allLinks[idx] = link;
    chrome.storage.local.set({ palmLinks: allLinks }, () => render());
  });

  document.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      updateLinkTags(link, link.tags.filter(t => t !== btn.dataset.tag));
    });
  });

  const tagInput = document.getElementById("tagInput");
  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const newTag = tagInput.value.trim();
      if (newTag && !(link.tags || []).map(t => t.toLowerCase()).includes(newTag.toLowerCase())) {
        updateLinkTags(link, [...(link.tags || []), newTag]);
      } else {
        tagInput.value = "";
      }
    }
  });

  modal.classList.remove("hidden");
}

modalClose.addEventListener("click", () => modal.classList.add("hidden"));
document.querySelector(".modal-overlay").addEventListener("click", () => modal.classList.add("hidden"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.add("hidden"); });

// ── Tag editing ──
function updateLinkTags(link, newTags) {
  link.tags = newTags;
  const idx = allLinks.findIndex(l => l.id === link.id);
  if (idx !== -1) allLinks[idx] = link;
  chrome.storage.local.set({ palmLinks: allLinks }, () => {
    buildTagSidebar();
    render();
    openModal(link);
  });
}

// ── Track opens ──
function trackOpen(linkId) {
  const today = new Date().toISOString().slice(0, 10);
  const idx = allLinks.findIndex(l => l.id === linkId);
  if (idx === -1) return;
  const link = allLinks[idx];
  const history = link.openHistory || [];
  history.push(today);
  // Keep last 365 entries max
  if (history.length > 365) history.shift();
  allLinks[idx] = {
    ...link,
    openCount: (link.openCount || 0) + 1,
    lastOpenedAt: new Date().toISOString(),
    openHistory: history
  };
  chrome.storage.local.set({ palmLinks: allLinks });
}

// ── Delete ──
function deleteLink(id) {
  allLinks = allLinks.filter(l => l.id !== id);
  chrome.storage.local.set({ palmLinks: allLinks }, () => {
    buildTagSidebar();
    render();
  });
}

// ── Re-summarize ──
async function resimmarize(link, btn) {
  if (btn) { btn.textContent = "..."; btn.disabled = true; }
  try {
    const tab = await chrome.tabs.create({ url: link.url, active: false });
    await new Promise(resolve => {
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const noiseSelectors = "nav, header, footer, aside, .sidebar, .navigation, .menu, .ad, .advertisement, .related, .comments, .cookie, [class*='sidebar'], [class*='related'], [class*='recommend'], [id*='sidebar']";
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(noiseSelectors).forEach(el => el.remove());
        const article = clone.querySelector("article, [role='main'], main, .post-content, .article-body, .entry-content, .content-body, [class*='article'], [class*='post-body']");
        return {
          title: document.title || "",
          url: window.location.href,
          content: (article ? article.innerText : clone.innerText || "").slice(0, 8000)
        };
      }
    });

    await chrome.tabs.remove(tab.id);
    const pageData = results?.[0]?.result;
    if (!pageData) throw new Error("Could not read page");

    const response = await new Promise(resolve =>
      chrome.runtime.sendMessage({ action: "summarize", data: { ...pageData, selectedText: "" } }, resolve)
    );
    if (response?.error) throw new Error(response.error);

    link.summary = response.summary;
    link.tags = response.tags?.length ? response.tags : link.tags;
    const idx = allLinks.findIndex(l => l.id === link.id);
    if (idx !== -1) allLinks[idx] = link;
    chrome.storage.local.set({ palmLinks: allLinks }, () => {
      buildTagSidebar(); render(); showToast("Summary generated!");
    });
  } catch (err) {
    if (btn) { btn.textContent = "✦ Generate"; btn.disabled = false; }
    showToast("Error: " + err.message);
  }
}

// ── Import ──
const importBtn  = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;
  importFile.value = "";

  const reader = new FileReader();
  reader.onload = (e) => {
    const rows = parseCSV(e.target.result);
    if (rows.length === 0) { showToast("No rows found in file."); return; }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const urlIdx   = headers.findIndex(h => ["url","link","href","address"].includes(h));
    const titleIdx = headers.findIndex(h => ["title","name","label"].includes(h));
    const dataRows = urlIdx >= 0 ? rows.slice(1) : rows;
    const rUrlIdx  = urlIdx >= 0 ? urlIdx : 0;

    const existingUrls = new Set(allLinks.map(l => l.url));
    const toAdd = [];

    dataRows.forEach(row => {
      const url = (row[rUrlIdx] || "").trim();
      if (!url.startsWith("http") || existingUrls.has(url)) return;
      existingUrls.add(url);
      const title = titleIdx >= 0 ? (row[titleIdx] || "").trim() : getDomain(url);
      toAdd.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        title: title || getDomain(url), url,
        summary: "", tags: [],
        savedAt: new Date().toISOString()
      });
    });

    if (toAdd.length === 0) { showToast("No new URLs to import."); return; }

    const updated = [...toAdd, ...allLinks];
    chrome.storage.local.set({ palmLinks: updated }, () => {
      allLinks = updated;
      buildTagSidebar(); render();
      showToast(`Imported ${toAdd.length} link${toAdd.length > 1 ? "s" : ""}.`);
    });
  };
  reader.readAsText(file);
});

function parseCSV(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === "," && !inQ) { cols.push(cur); cur = ""; }
      else cur += ch;
    }
    cols.push(cur); rows.push(cols);
  }
  return rows;
}

function showToast(msg) {
  const existing = document.querySelector(".dash-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "dash-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ── Export ──
exportBtn.addEventListener("click", () => exportMenu.classList.toggle("hidden"));

exportMenu.querySelectorAll("button").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.format === "json") exportJSON();
    if (btn.dataset.format === "csv") exportCSV();
    exportMenu.classList.add("hidden");
  });
});

function exportJSON() {
  download(new Blob([JSON.stringify(allLinks, null, 2)], { type: "application/json" }), "palm-links.json");
}

function exportCSV() {
  const header = ["Title","URL","Summary","Tags","Saved At"].map(csvCell);
  const rows = allLinks.map(l => [
    csvCell(l.title), csvCell(l.url), csvCell(l.summary),
    csvCell((l.tags||[]).join(", ")), csvCell(l.savedAt)
  ]);
  download(new Blob([[header,...rows].map(r=>r.join(",")).join("\n")], {type:"text/csv"}), "palm-links.csv");
}

function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvCell(val) { return `"${String(val||"").replace(/"/g,'""')}"`; }

// ── Helpers ──
function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return url; }
}

function escapeHtml(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function cleanText(str) {
  return String(str||"")
    .replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
    .replace(/!\[.*?\]\(.*?\)/g,"")
    .replace(/\*\*([^*]+)\*\*/g,"$1")
    .replace(/\*([^*]+)\*/g,"$1")
    .replace(/`([^`]+)`/g,"$1")
    .replace(/[#>~]/g,"")
    .replace(/\s+/g," ")
    .trim();
}

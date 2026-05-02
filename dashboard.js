let allLinks = [];
let activeTag = "all";
let activeGroup = "none";
let searchQuery = "";

// Elements
const searchInput = document.getElementById("searchInput");
const linksGrid = document.getElementById("linksGrid");
const emptyState = document.getElementById("emptyState");
const tagList = document.getElementById("tagList");
const totalCount = document.getElementById("totalCount");
const resultCount = document.getElementById("resultCount");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");
const modalClose = document.getElementById("modalClose");
const exportBtn = document.getElementById("exportBtn");
const exportMenu = document.getElementById("exportMenu");

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

// Listen for new saves while dashboard is open
chrome.storage.onChanged.addListener((changes) => {
  if (changes.palmLinks) {
    allLinks = changes.palmLinks.newValue || [];
    buildTagSidebar();
    render();
  }
});

// ── Sidebar tag list ──
function buildTagSidebar() {
  const tagCounts = {};
  allLinks.forEach(l => (l.tags || []).forEach(t => {
    tagCounts[t] = (tagCounts[t] || 0) + 1;
  }));

  totalCount.textContent = allLinks.length;

  // Remove old dynamic tags
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

  // Update "All" active state
  tagList.querySelector("[data-tag='all']").classList.toggle("active", activeTag === "all");
}

function setTag(tag) {
  activeTag = tag;
  tagList.querySelectorAll(".tag-filter").forEach(b => {
    b.classList.toggle("active", b.dataset.tag === tag);
  });
  render();
}

// ── Group buttons ──
document.querySelectorAll(".group-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    activeGroup = btn.dataset.group;
    document.querySelectorAll(".group-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
});

// ── Search ──
searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
});

// ── Render ──
function render() {
  let links = allLinks;

  // Filter by tag
  if (activeTag !== "all") {
    links = links.filter(l => (l.tags || []).includes(activeTag));
  }

  // Filter by search
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
    links.forEach(l => linksGrid.appendChild(makeCard(l)));
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
    const header = document.createElement("div");
    header.className = "group-header";
    header.textContent = `${group} (${groupLinks.length})`;
    linksGrid.appendChild(header);
    groupLinks.forEach(l => linksGrid.appendChild(makeCard(l)));
  });
}

function dateGroup(iso) {
  const now = new Date();
  const date = new Date(iso);
  const diffDays = Math.floor((now - date) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 7) return "This Week";
  if (diffDays <= 30) return "This Month";
  return "Older";
}

// ── Card ──
function makeCard(link) {
  const card = document.createElement("div");
  card.className = "link-card";

  const domain = getDomain(link.url);
  const date = new Date(link.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  card.innerHTML = `
    <div class="card-domain">
      <img class="card-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=16" />
      ${escapeHtml(domain)}
    </div>
    <div class="card-title">${escapeHtml(cleanText(link.title))}</div>
    <div class="card-summary">${escapeHtml(cleanText(link.summary || ""))}</div>
    <div class="card-footer">
      <div class="card-tags">
        ${(link.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
      <div class="card-actions">
        <span class="card-date">${date}</span>
        <button class="card-delete" title="Delete">×</button>
      </div>
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.classList.contains("card-delete")) return;
    openModal(link);
  });

  card.querySelector(".card-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteLink(link.id);
  });

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
      <div class="modal-summary" id="modalSummaryText">${escapeHtml(cleanText(link.summary || ""))}</div>
      <textarea class="modal-summary-editor hidden" id="modalSummaryEditor">${escapeHtml(cleanText(link.summary || ""))}</textarea>
      <div class="summary-edit-actions hidden" id="summaryEditActions">
        <button class="btn-save-summary" id="saveSummaryBtn">Save</button>
        <button class="btn-cancel-summary" id="cancelSummaryBtn">Cancel</button>
      </div>
    </div>
    <div class="modal-tag-label">Tags</div>
    <div class="modal-tags" id="modalTags">
      ${(link.tags || []).map(t => `
        <span class="tag tag-editable">
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

  // Open link
  document.getElementById("modalOpen").addEventListener("click", () => {
    chrome.tabs.create({ url: link.url });
  });

  // Delete link
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
    titleEditor.focus();
    titleEditor.select();
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

  // Save title on Enter key
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

  // Remove tag
  document.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tagToRemove = btn.dataset.tag;
      updateLinkTags(link, link.tags.filter(t => t !== tagToRemove));
    });
  });

  // Add tag on Enter
  const tagInput = document.getElementById("tagInput");
  tagInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const newTag = tagInput.value.trim().toLowerCase();
      if (newTag && !(link.tags || []).includes(newTag)) {
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
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") modal.classList.add("hidden");
});

// ── Tag editing ──
function updateLinkTags(link, newTags) {
  link.tags = newTags;
  const idx = allLinks.findIndex(l => l.id === link.id);
  if (idx !== -1) allLinks[idx] = link;
  chrome.storage.local.set({ palmLinks: allLinks }, () => {
    buildTagSidebar();
    render();
    openModal(link); // re-render modal with updated tags
  });
}

// ── Delete ──
function deleteLink(id) {
  allLinks = allLinks.filter(l => l.id !== id);
  chrome.storage.local.set({ palmLinks: allLinks }, () => {
    buildTagSidebar();
    render();
  });
}

// ── Import ──
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files[0];
  if (!file) return;
  importFile.value = "";

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const rows = parseCSV(text);
    if (rows.length === 0) { showToast("No rows found in file."); return; }

    const headers = rows[0].map(h => h.toLowerCase().trim());
    const urlIdx = headers.findIndex(h => ["url", "link", "href", "address"].includes(h));
    const titleIdx = headers.findIndex(h => ["title", "name", "label"].includes(h));

    const dataRows = urlIdx >= 0 ? rows.slice(1) : rows;
    const resolvedUrlIdx = urlIdx >= 0 ? urlIdx : 0;

    const existingUrls = new Set(allLinks.map(l => l.url));
    const toAdd = [];

    dataRows.forEach(row => {
      const url = (row[resolvedUrlIdx] || "").trim();
      if (!url.startsWith("http")) return;
      if (existingUrls.has(url)) return;
      existingUrls.add(url);

      const title = titleIdx >= 0 ? (row[titleIdx] || "").trim() : getDomain(url);
      toAdd.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        title: title || getDomain(url),
        url,
        summary: "",
        tags: [],
        savedAt: new Date().toISOString()
      });
    });

    if (toAdd.length === 0) { showToast("No new URLs to import."); return; }

    const updated = [...toAdd, ...allLinks];
    chrome.storage.local.set({ palmLinks: updated }, () => {
      allLinks = updated;
      buildTagSidebar();
      render();
      showToast(`Imported ${toAdd.length} link${toAdd.length > 1 ? "s" : ""}.`);
    });
  };
  reader.readAsText(file);
});

function parseCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cols.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    cols.push(cur);
    rows.push(cols);
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
    const format = btn.dataset.format;
    if (format === "json") exportJSON();
    if (format === "csv") exportCSV();
    exportMenu.classList.add("hidden");
  });
});

function exportJSON() {
  const blob = new Blob([JSON.stringify(allLinks, null, 2)], { type: "application/json" });
  download(blob, "palm-links.json");
}

function exportCSV() {
  const header = ["Title", "URL", "Summary", "Tags", "Saved At"].map(csvCell);
  const rows = allLinks.map(l => [
    csvCell(l.title),
    csvCell(l.url),
    csvCell(l.summary),
    csvCell((l.tags || []).join(", ")),
    csvCell(l.savedAt)
  ]);
  const csv = [header, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  download(blob, "palm-links.csv");
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(val) {
  return `"${String(val || "").replace(/"/g, '""')}"`;
}

// ── Helpers ──
function getDomain(url) {
  try { return new URL(url).hostname.replace("www.", ""); }
  catch { return url; }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

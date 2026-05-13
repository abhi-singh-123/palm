// ── Config ──
const FREE_TIER_URL = "https://palm-free-saves.REPLACE_WITH_YOUR_SUBDOMAIN.workers.dev/summarize";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "palm-save",
    title: "Save to PALM",
    contexts: ["page", "selection", "link"]
  });

  // Generate a unique user ID for free tier tracking
  chrome.storage.local.get("palmUserId", ({ palmUserId }) => {
    if (!palmUserId) {
      const id = crypto.randomUUID();
      chrome.storage.local.set({ palmUserId: id });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "palm-save") return;

  const { palmApiKey } = await chrome.storage.sync.get("palmApiKey");
  const { palmUserId } = await chrome.storage.local.get("palmUserId");

  // Grab page content
  let pageData;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (selText) => {
        const noiseSelectors = "nav, header, footer, aside, .sidebar, .navigation, .menu, .ad, .advertisement, .related, .comments, .cookie, [class*='sidebar'], [class*='related'], [class*='recommend'], [id*='sidebar']";
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll(noiseSelectors).forEach(el => el.remove());
        const article = clone.querySelector("article, [role='main'], main, .post-content, .article-body, .entry-content, .content-body, [class*='article'], [class*='post-body']");
        return {
          title: document.title || "",
          url: window.location.href,
          content: (article ? article.innerText : clone.innerText || "").slice(0, 8000),
          selectedText: selText || window.getSelection().toString()
        };
      },
      args: [info.selectionText || ""]
    });
    pageData = results?.[0]?.result;
  } catch (e) {
    injectToast(tab.id, "PALM: Cannot save this page type.", "error");
    return;
  }

  if (!pageData) {
    injectToast(tab.id, "PALM: Could not read page.", "error");
    return;
  }

  // Duplicate check
  const { palmLinks } = await chrome.storage.local.get("palmLinks");
  const existing = (palmLinks || []).find(l => l.url === pageData.url);
  if (existing) {
    injectToast(tab.id, "PALM: Already saved!", "info");
    return;
  }

  injectToast(tab.id, "PALM: Saving...", "info");

  const result = await summarize({ ...pageData, apiKey: palmApiKey, userId: palmUserId });

  if (result.error === "free_limit_reached") {
    injectToast(tab.id, "PALM: Add your free Gemini API key to keep saving.", "info");
    return;
  }

  if (result.error) {
    injectToast(tab.id, "PALM: Error — " + result.error, "error");
    return;
  }

  const link = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    title: pageData.title,
    url: pageData.url,
    summary: result.summary,
    tags: result.tags,
    selectedText: pageData.selectedText,
    savedAt: new Date().toISOString()
  };

  const links = [link, ...(palmLinks || [])];
  await chrome.storage.local.set({ palmLinks: links });
  incrementUsage();
  injectToast(tab.id, "PALM: Saved!", "success");
});

// ── Message listener (from popup) ──
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "summarize") {
    chrome.storage.sync.get("palmApiKey", ({ palmApiKey }) => {
      chrome.storage.local.get("palmUserId", ({ palmUserId }) => {
        summarize({ ...message.data, apiKey: palmApiKey, userId: palmUserId }).then(sendResponse);
      });
    });
    return true;
  }
});

// ── Summarize — tries free tier first, falls back to user key ──
async function summarize({ title, url, content, selectedText, apiKey, userId }) {
  // If user has their own key, use it directly
  if (apiKey) {
    return summarizeWithGemini({ title, url, content, selectedText, apiKey });
  }

  // No key — try free tier
  if (!userId) {
    return { error: "No API key configured. Add your free Gemini key in settings." };
  }

  try {
    const response = await fetch(FREE_TIER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title, url, content, selectedText })
    });

    const data = await response.json();

    if (data.error === "free_limit_reached") {
      return { error: "free_limit_reached" };
    }

    if (data.error) {
      return { error: data.error };
    }

    return { summary: data.summary, tags: data.tags };
  } catch (err) {
    return { error: "Could not connect. Add your Gemini API key to continue." };
  }
}

// ── Toast ──
function injectToast(tabId, msg, type) {
  const colors = { success: "#2d6a4f", error: "#e63946", info: "#555" };
  chrome.scripting.executeScript({
    target: { tabId },
    func: (message, color) => {
      const existing = document.getElementById("palm-toast");
      if (existing) existing.remove();
      const toast = document.createElement("div");
      toast.id = "palm-toast";
      toast.textContent = message;
      Object.assign(toast.style, {
        position: "fixed", bottom: "24px", right: "24px",
        background: color, color: "#fff", padding: "10px 18px",
        borderRadius: "8px", fontSize: "13px", zIndex: "2147483647",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)", transition: "opacity 0.3s"
      });
      document.body.appendChild(toast);
      if (color !== "#555") {
        setTimeout(() => { toast.style.opacity = "0"; }, 2500);
        setTimeout(() => toast.remove(), 2900);
      }
    },
    args: [msg, colors[type] || "#555"]
  });
}

// ── Usage counter ──
function incrementUsage() {
  const today = new Date().toISOString().slice(0, 10);
  chrome.storage.local.get("palmUsage", ({ palmUsage }) => {
    const usage = palmUsage || {};
    const count = usage.date === today ? (usage.count || 0) + 1 : 1;
    chrome.storage.local.set({ palmUsage: { date: today, count } });
  });
}

// ── PALM_TAGS ──
const PALM_TAGS = [
  "AI", "Productivity", "Technology", "Programming", "Career",
  "Business", "Finance", "Health", "Science", "Design",
  "Security", "Learning", "Tools", "Research", "News",
  "Marketing", "Leadership", "Data", "Web", "Other"
];

// ── Gemini (user's own key) ──
async function summarizeWithGemini({ title, url, content, selectedText, apiKey }) {
  const cleanTitle = stripSiteName(stripMarkdown(title));
  const cleanContent = stripMarkdown(selectedText || content.slice(0, 5000));

  const textToSummarize = selectedText
    ? `Selected text: ${cleanContent}\n\nPage title: ${cleanTitle}\nURL: ${url}`
    : `Page title: ${cleanTitle}\nURL: ${url}\n\nContent: ${cleanContent}`;

  const prompt = `Summarize the main article content of this web page for a personal link manager.

Rules:
- Focus only on the actual article body — ignore navigation, sidebars, ads, related articles, and site boilerplate
- Exactly 2 complete sentences, no more, no less
- Be specific — mention actual concepts, tools, techniques, or findings from the article
- Do not be influenced by the website name or domain — focus purely on what the article teaches
- Never start with "This article", "This page", or "The author"
- Plain text only, no markdown, no bullet points
- Both sentences must be fully complete — never cut off mid-sentence

Then on a new line write "TAGS:" followed by exactly 2 tags from this list only — pick the most relevant:
${PALM_TAGS.join(", ")}

${textToSummarize}`;

  try {
    let data;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 1024,
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        }
      );

      data = await response.json();

      if (response.status === 429) {
        const match = data.error?.message?.match(/retry in ([\d.]+)s/);
        const waitMs = match ? Math.ceil(parseFloat(match[1])) * 1000 : 5000;
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        return { error: `Rate limit hit. Please wait ${Math.ceil(waitMs / 1000)}s and try again.` };
      }

      if (!response.ok) {
        return { error: data.error?.message || "Gemini API error" };
      }

      break;
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => !p.thought) || parts[0];
    const text = textPart?.text || "";
    const [summaryPart, tagsPart] = text.split("TAGS:");
    const summary = stripMarkdown(summaryPart.trim());
    const rawTags = tagsPart
      ? tagsPart.split(",").map(t => stripMarkdown(t.trim())).filter(Boolean)
      : [];

    const validTags = rawTags.filter(t =>
      PALM_TAGS.some(pt => pt.toLowerCase() === t.toLowerCase())
    ).map(t => PALM_TAGS.find(pt => pt.toLowerCase() === t.toLowerCase()));

    return { summary, tags: validTags.length > 0 ? validTags : ["Other"] };
  } catch (err) {
    return { error: err.message };
  }
}

function stripSiteName(title) {
  return title.replace(/\s[\-–—|]\s[^-–—|]+$/, "").trim();
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

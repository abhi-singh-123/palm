// PALM Free Tier Worker
// Deploy to Cloudflare Workers
// Requires: KV namespace bound as PALM_KV, secret GEMINI_API_KEY

const FREE_LIMIT = 5;

const PALM_TAGS = [
  "AI", "Productivity", "Technology", "Programming", "Career",
  "Business", "Finance", "Health", "Science", "Design",
  "Security", "Learning", "Tools", "Research", "News",
  "Marketing", "Leadership", "Data", "Web", "Other"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return respond({ error: "Method not allowed" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return respond({ error: "Invalid JSON" }, 400);
    }

    const { userId, title, url, content, selectedText } = body;

    if (!userId || typeof userId !== "string" || userId.length < 8) {
      return respond({ error: "Invalid user ID" }, 400);
    }

    if (!url) {
      return respond({ error: "Missing URL" }, 400);
    }

    // Check usage from KV
    const usageKey = `usage:${userId}`;
    const usageRaw = await env.PALM_KV.get(usageKey);
    const usage = parseInt(usageRaw || "0", 10);

    if (usage >= FREE_LIMIT) {
      return respond({
        error: "free_limit_reached",
        used: usage,
        limit: FREE_LIMIT
      }, 429);
    }

    // Call Gemini
    const result = await summarizeWithGemini(
      { title, url, content, selectedText },
      env.GEMINI_API_KEY
    );

    if (result.error) {
      return respond({ error: result.error }, 500);
    }

    // Increment usage
    await env.PALM_KV.put(usageKey, String(usage + 1), {
      expirationTtl: 60 * 60 * 24 * 365 // 1 year
    });

    return respond({
      summary: result.summary,
      tags: result.tags,
      freeSavesUsed: usage + 1,
      freeSavesTotal: FREE_LIMIT
    }, 200);
  }
};

function respond(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

async function summarizeWithGemini({ title, url, content, selectedText }, apiKey) {
  const cleanTitle = stripSiteName(stripMarkdown(title || ""));
  const cleanContent = stripMarkdown(selectedText || (content || "").slice(0, 5000));

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
        return { error: "Rate limit hit. Please try again shortly." };
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

    const validTags = rawTags
      .filter(t => PALM_TAGS.some(pt => pt.toLowerCase() === t.toLowerCase()))
      .map(t => PALM_TAGS.find(pt => pt.toLowerCase() === t.toLowerCase()));

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

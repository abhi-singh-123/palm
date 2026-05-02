# 🌴 PALM — Personal AI Link Manager

> Save any link. AI summarizes it instantly. Everything stays private on your device.

PALM is a Chrome extension that turns your scattered saved links into an organized, searchable, AI-powered personal library. **No account. No sign-up. No data ever leaves your device** — except to the Gemini API for summarization, using your own API key.

---

## Why PALM?

Most people save links in 5 different places — browser bookmarks, Slack messages, email stars, notes apps — and never go back to them. PALM fixes this with one-click saving and instant AI summaries so every link is actually useful when you need it.

**PALM vs other tools:**

| Tool | AI Summary | Local Storage | Free | Auto Tags | Export | No Account |
|---|---|---|---|---|---|---|
| **PALM** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pocket | ❌ | ❌ | Partial | Manual | Paid | ❌ |
| Instapaper | ❌ | ❌ | Partial | Manual | Paid | ❌ |
| Raindrop.io | ❌ | ❌ | Partial | Manual | Partial | ❌ |
| Browser Bookmarks | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |

**No Account Required** is the key difference. Every alternative requires sign-up and stores your data on their servers. PALM works instantly — install, add your API key, start saving.

---

## Features

### Save Links
- **One-click save** — click the PALM icon in your toolbar → Save This Page
- **Right-click save** — right-click anywhere on a page → Save to PALM
- **Highlight & save** — select text on any page → right-click → Save to PALM (saves with context)
- **Duplicate detection** — warns you if you've already saved a page

### AI Summaries
- Every saved link gets an instant 2-sentence AI summary
- Summary focuses on the actual article content, ignoring ads and navigation
- Powered by Gemini 2.5 Flash — fast and free

### Smart Tags
- Automatically assigned from a fixed taxonomy of 20 categories:
  `AI, Productivity, Technology, Programming, Career, Business, Finance, Health, Science, Design, Security, Learning, Tools, Research, News, Marketing, Leadership, Data, Web, Other`
- Consistent tags = clean filters (no tag explosion)

### Full Dashboard
- Opens in a full browser tab for browsing your entire library
- **Filter by tag** — sidebar shows all your tags with link counts
- **Group by tag or date** — organize your view
- **Search** — find any link by title, summary, or tag instantly
- **Expand any link** — click a card to see full summary and details

### Edit Everything
- **Edit title** — fix auto-generated titles
- **Edit summary** — rewrite AI summaries in your own words
- **Edit tags** — add or remove tags on any saved link

### Export
- **Export as JSON** — full data backup
- **Export as CSV** — open in Excel or Google Sheets

### Privacy
- All links stored locally in your browser (IndexedDB)
- Nothing is stored on any server
- Only the page title and content are sent to Gemini API for summarization
- You control your own API key

---

## How It Works

```
You click Save
      ↓
PALM extracts the article text from the page
(removes nav, ads, sidebars automatically)
      ↓
Sends title + content to Gemini API
      ↓
Gemini returns a 2-sentence summary + 2 tags
      ↓
Saved locally in your browser (IndexedDB)
      ↓
Appears in your popup and dashboard instantly
```

---

## Installation

### Step 1 — Get a free Gemini API key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click **Get API Key** in the top left
4. Click **Create API key**
5. Copy the key (starts with `AIza...`)

> The Gemini API free tier allows 15 requests per minute and 1,500 requests per day — more than enough for personal use. No credit card required.

### Step 2 — Install PALM

**Option A — Chrome Web Store** — [Install PALM](https://chrome.google.com/webstore/detail/palm)

**Option B — Load manually (developer mode)**

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer mode** (toggle in top right)
4. Click **Load unpacked**
5. Select the `palm` folder
6. The 🌴 PALM icon appears in your Chrome toolbar

### Step 3 — Add your API key

1. Click the 🌴 PALM icon in your toolbar
2. Click the ⚙️ settings icon
3. Paste your Gemini API key
4. Click **Save Key**

You're ready to save links.

---

## Usage

### Saving a link

**From the popup:**
1. Navigate to any webpage
2. Click the 🌴 PALM icon in your toolbar
3. Click **Save This Page**
4. Wait ~3 seconds for the AI summary
5. Link appears in your inbox with summary and tags

**From the right-click menu:**
1. Right-click anywhere on a page
2. Click **Save to PALM**
3. A toast notification confirms the save

**Saving highlighted text:**
1. Select any text on a page
2. Right-click → **Save to PALM**
3. PALM saves the page with your highlighted text as additional context

### Browsing your library

**Popup** — quick view of recent links, search bar, click any card to open

**Dashboard** — click 📋 in the popup for the full experience:
- Use the left sidebar to filter by tag
- Switch between Group by Tag / Group by Date / No grouping
- Click any card to see the full summary
- Edit title, summary, or tags inline

### Editing a saved link

1. Open the dashboard (📋 button)
2. Click any link card
3. In the modal:
   - Hover over the title → click **Edit** to rename
   - Click **Edit** next to Summary to rewrite it
   - Click **×** on a tag to remove it
   - Type in the tag input field → press **Enter** to add a custom tag

### Exporting your data

1. Open the dashboard
2. Click **Export** in the bottom left sidebar
3. Choose **Export as JSON** or **Export as CSV**

---

## Project Structure

```
palm/
├── manifest.json      — Extension config and permissions
├── background.js      — Service worker: context menu, Gemini API calls
├── content.js         — Page content extraction for right-click saves
├── popup.html         — Toolbar popup UI
├── popup.css          — Popup styles
├── popup.js           — Popup logic: save, search, settings
├── dashboard.html     — Full-page dashboard
├── dashboard.css      — Dashboard styles
├── dashboard.js       — Dashboard logic: filter, group, edit, export
└── icons/             — Extension icons (16px, 48px, 128px)
```

---

## Tech Stack

- **Chrome Extension** — Manifest V3
- **Gemini 2.5 Flash API** — AI summarization
- **IndexedDB / chrome.storage.local** — Local data storage
- **Plain HTML / CSS / JavaScript** — No frameworks, no build step

---

## Roadmap

- [ ] Weekly digest — Sunday summary of your best saved links
- [ ] Related links — surface saved links while browsing similar content
- [ ] Firefox support
- [ ] Mobile companion app
- [ ] Team shared inbox

---

## License

MIT — free to use, modify, and distribute.

---

*Built with ❤️ by Kumar Abhishek*

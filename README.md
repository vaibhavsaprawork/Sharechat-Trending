# ShareChat Trending Tags

> APM Assignment Submission | Built by Vaibhav

A mobile-first trending tags system for India's Hindi-speaking audience — automatically identifying what's trending in India today and surfacing it through a polished, native-feeling app prototype.

---

## 🔗 Submission Links

| | |
|---|---|
| **Live Prototype** | https://sharechat-trending-zeta.vercel.app/ |
| **GitHub Repo** | https://github.com/vaibhavsaprawork/Sharechat-Trending |
| **Loom Walkthrough** | [Add Loom URL here] |
| **Screenshot** | See `/screenshot.png` in this repo |

---

## Part 1 — How the Trending Tags System Works

### Data Sources

The pipeline pulls from two live sources on every request — no caching, always fresh:

**1. Google Trends India (RSS)**
```
https://trends.google.com/trends/trendingsearches/daily/rss?geo=IN
```
No API key required. Returns the top daily trending searches in India. Strongest signal for active search intent. Falls back to Google News India RSS if the Trends endpoint returns 404.

**2. NewsAPI — India Headlines**
```
https://newsapi.org/v2/top-headlines?country=in&pageSize=30
```
Returns top 30 headlines from Indian sources (NDTV, Times of India, Hindustan Times, Aaj Tak) with title, description, source name, publish time, and `urlToImage` — which powers hero images in the feed. Optional — if no key is set, only RSS signals are used.

### Why These Two Sources

| Signal | What it tells us | Weight |
|---|---|---|
| Google Trends | Active search intent — people are looking this up right now | High |
| NewsAPI headlines | Editorial importance — journalists are covering it | Medium-High |
| Cross-signal overlap | Topic appears in both → confirmed, widespread trend | 1.25× bonus |

**What I considered and rejected:**
- Twitter/X API — now paid ($100/month minimum), not feasible
- Reddit India — good signal but skews urban/English, not representative of ShareChat's Tier 2/3 audience
- YouTube Trending — good for entertainment but requires OAuth, too complex for v1

---

### Scoring & Ranking Logic

There is **no** separate numeric “composite score” computed in code before the LLM. RSS headlines and NewsAPI articles are **deduped, trimmed, and merged into the user prompt**; the **LLM assigns rank order, `heatScore` (1–100), and `heatLabel`**, and `api/trending.js` then **normalizes** those fields (sane defaults, allowed labels, category resolution, quality filters for placeholder titles, optional JSON salvage for truncated Ollama output).

---

### LLM Enrichment Layer

After raw signals are collected, they're sent to the LLM in a structured prompt. The LLM does the heavy lifting:

1. **Merges and deduplicates** — "IPL Final" and "MI vs CSK" become one tag
2. **Final ranking** — ordered list of 10 trending topics
3. **Generates Hindi output** — hashtag, display name, 2-sentence description
4. **AI Summary** *(bonus)* — 3-4 sentence Hindi analysis of why this is trending
5. **Classifies** — one of **10** Hindi categories: खेल, समाचार, मनोरंजन, मौसम, वित्त, त्योहार, राजनीति, तकनीक, शिक्षा, स्वास्थ्य
6. **Heat score** — 1-100 numeric score with Hindi label
7. **Filters** — removes topics irrelevant to Hindi-speaking Indian audience

**LLM options supported:**

| Provider | When to use | Config |
|---|---|---|
| **Gemini** (default) | Cloud deploy, Vercel | `GEMINI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-2.0-flash`) |
| **Anthropic Claude** (optional cloud) | Tried **before** Gemini when the key is set | `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL` |
| **Ollama** (local) | `LLM_PROVIDER=ollama` | `OLLAMA_HOST`, `OLLAMA_MODEL`, `OLLAMA_NUM_CTX`, etc. |

**Why Gemini as default:** Free tier via Google AI Studio, fast on Vercel serverless, strong Hindi output. If a model name returns HTTP 404, set `GEMINI_MODEL` manually in env (there is **no** automatic fallback to another model in code).

**Ollama note:** Local Llama on Mac is significantly slower than Gemini. Each article is sent individually rather than all at once — avoids context overload and timeouts. `num_ctx` set to 8192 to prevent long prompts being truncated. For speed: use a smaller model (`llama3.2:1b`) or reduce `TRENDING_TOPIC_COUNT`.

---

### Output Schema

```json
{
  "rank": 1,
  "hashtag": "#IPL2026Final",
  "hindiName": "IPL 2026 फाइनल",
  "description": "MI बनाम CSK का महामुकाबला आज वानखेड़े में।",
  "aiSummary": "IPL 2026 का फाइनल मुकाबला आज मुंबई के वानखेड़े स्टेडियम में खेला जाएगा...",
  "category": "खेल",
  "heatScore": 98,
  "heatLabel": "बहुत गर्म",
  "sources": ["Google Trends India — #1", "NewsAPI — 340 articles"],
  "imageUrl": "https://...",
  "relatedTags": ["#MIvsCSK", "#Rohit", "#Dhoni"]
}
```

---

### Pipeline Diagram

```
┌─────────────────────────────────────────────────────────┐
│                   ON EVERY REQUEST                      │
│                   (no cache, live)                      │
└─────────────────────────────────────────────────────────┘
          │                             │
          ▼                             ▼
┌──────────────────┐          ┌──────────────────┐
│  Google Trends   │          │    NewsAPI        │
│  India RSS       │          │  /top-headlines   │
│  (no key needed) │          │  ?country=in      │
└────────┬─────────┘          └────────┬──────────┘
         │ trending searches           │ 30 articles
         │ + positions                 │ + images + sources
         └─────────────┬───────────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │   Merge & pack prompt │
           │                       │
           │  • Dedupe articles      │
           │  • RSS + News payload   │
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │   LLM Layer           │
           │                       │
           │  Anthropic (opt.) OR  │
           │  Gemini (cloud) OR    │
           │  Ollama (local)       │
           │                       │
           │  • Final ranking      │
           │  • Hindi generation   │
           │  • Category tagging   │
           │  • Heat score         │
           │  • AI summary (bonus) │
           │  • Related hashtags   │
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │   Output Filter       │
           │                       │
           │  • Remove unknowns    │
           │  • Validate schema    │
           │  • Trim to k tags     │
           │  • Fallback if error  │
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │  /api/trending        │
           │  JSON response        │
           │  + CORS headers       │
           │  + X-LLM-Provider     │
           └───────────┬───────────┘
                       │
                       ▼
           ┌───────────────────────┐
           │   React Frontend      │
           │                       │
           │  Feed View            │
           │  → Detail View        │
           │  → Posts/Videos/Reels │
           └───────────────────────┘
```

---

## Part 2 — App Prototype

### Research: ShareChat Today vs This Redesign

Before designing anything, I used the ShareChat app extensively. Here's what I found and how I responded:

| Problem in ShareChat today | What I designed instead |
|---|---|
| Trending tags use emojis as category indicators (🏏🎬) — feels cheap and inconsistent | Proper Lucide icons with colored rounded squares — systematic and scalable |
| No visual hierarchy — all tags look identical in weight | Hero images + heat badges + rank numbers — instant visual priority |
| Tag detail view is thin — just a list of posts | Full detail: AI analysis, signal sources, trend pulse chart, tabbed Posts/Videos/Reels |
| No freshness signal — can't tell if trend is 2 hrs or 2 days old | Heat score (1-100) + label (बहुत गर्म / वायरल) + "Updated moments ago" |
| English-only UI chrome even for Hindi content | Full Hindi UI with EN toggle — content stays Hindi, chrome translates |
| Single fixed theme | Dark theme (ShareChat-native) + Light theme (Google News-inspired) |
| No way to save or revisit content | Bookmark on every post, Saved tab in detail view |

---

### UX Rationale

**Why dark theme as default?**
ShareChat's primary users are on mid-range Android devices, many with AMOLED screens. Dark themes save battery — black pixels are off pixels. It also matches ShareChat's existing visual language so the prototype feels immediately native.

**Why hero images on feed cards?**
Images dramatically increase tap-through rates in Indian content consumption patterns. The image communicates what a trend is about before a single word is read — critical for fast-scrolling users and lower-literacy audiences that ShareChat specifically serves.

**Why the heat badge design?**
A plain number (98) means nothing. "बहुत गर्म" alone has no scale. Together — `🔥 98 | बहुत गर्म` in a colored pill — they communicate urgency immediately. Color shifts by score: red for 90+, amber for 75+, green for 60+. This borrows from Groww and Zerodha's color-as-urgency pattern, already a learned signal for Indian users.

**Why Posts / Videos / Reels tabs in detail view?**
ShareChat users primarily consume video and short-form content. A dedicated Reels tab acknowledges this reality. Posts give depth, Videos give context, Reels give entertainment — matching how Indian users actually engage with trends rather than forcing a text-first, Western news pattern.

**Why Hindi content but toggleable UI language?**
ShareChat's content is Hindi-first — translating trend descriptions would break authenticity. But many urban users (heavy trending feature users) are bilingual and more comfortable with English UI chrome. The toggle respects both without compromising either.

**Why category filter pills at the top?**
Users arrive at trending with intent — a cricket fan wants खेल, not politics. The filter is the first interaction after opening. Top placement minimises scroll distance to relevant content. Borrowed from Google News's tab pattern which has strong usage evidence in India.

**Why light theme follows Google News's design language?**
Google News is the most-used news app in India. Its card-based, typography-first light theme is a familiar, trusted pattern. Using the same visual grammar (white cards, shadow instead of borders, Roboto typography, black active pills) makes the light theme feel immediately credible and readable.

**What I considered and rejected:**
- Infinite scroll — rejected because trending is finite and curated. Artificial infinite scroll would devalue the curation signal
- Search within trending — category filter covers 80% of intent without the complexity
- Swipe gesture between trends — conflicts with vertical scroll, too easy to trigger accidentally

**Why the prototype doesn't start from ShareChat's home page:**
The assignment scopes specifically to the Trending Tags feature. Starting from the trending feed directly shows focused product thinking. The bottom navigation bar provides enough app context that this clearly sits within a larger product. A full implementation would embed this as a tab within ShareChat's existing navigation.

**Bonus — AI विश्लेषण:**
Every trend detail view shows a 3-4 sentence Hindi AI summary: what is this trend, why today specifically, what's the broader context, how fast it's spreading. This gives users genuine value beyond a headline — especially for finance and politics where context matters deeply. This is the explicit bonus requirement from the assignment.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Vite | Fast build, easy Vercel deploy |
| Styling | CSS Variables + plain CSS | Full theme control, no Tailwind overhead |
| Icons | Lucide React | Consistent, lightweight, tree-shakeable |
| Font | Noto Sans Devanagari + Roboto | Best Hindi rendering + Google News feel |
| Backend | Node.js Vercel serverless | Same repo, zero config deploy |
| Trends source | Google Trends RSS | Free, no key, reliable |
| News source | NewsAPI | Free tier, India-specific, returns images |
| LLM (cloud, default) | Gemini 2.0 Flash | Free via AI Studio, fast, good Hindi |
| LLM (cloud, optional) | Anthropic Claude | When `ANTHROPIC_API_KEY` is set, API tries Claude before Gemini |
| LLM (local) | Ollama + LLaMA 3.2 | Free local inference, no API key needed |
| Hosting | Vercel | Free tier, instant deploy, edge CDN |

**AI tools used to build this:**
- Claude (Anthropic) — system design, prompt engineering, component architecture, README
- Cursor — code generation and iteration throughout
- Gemini / optional Anthropic Claude — LLM enrichment in production API paths
- All code was reviewed, understood, and modified throughout

---

## Running Locally

### Recommended (one command)

Add `.env.local` to the project root, then:

```bash
npm install
npm run dev:stack
```

Runs the local API and Vite together. If port 3000 is busy, an open port is chosen automatically and the proxy syncs to match.

### Environment Variables

**Gemini (default — cloud):**
```bash
GEMINI_API_KEY=your_key_here        # free at aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.0-flash       # optional, this is the default
NEWSAPI_KEY=your_key_here           # optional, free at newsapi.org/register
TRENDING_TOPIC_COUNT=10             # optional, 1-10, default 10
```

**Anthropic (optional — cloud, tried before Gemini when set):**
```bash
ANTHROPIC_API_KEY=your_key_here
# ANTHROPIC_MODEL=claude-3-5-haiku-20241022   # optional
```

**Ollama (local Mac, no API key):**
```bash
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2               # must match output of `ollama list`
OLLAMA_NUM_CTX=8192                 # default, prevents prompt truncation
OLLAMA_NUM_PREDICT=2800             # default
# OLLAMA_HOST=http://127.0.0.1:11434  # default, usually not needed
```

Make sure `ollama serve` is running before starting the dev server.

See `.env.example` for the full list.

### All Scripts

```bash
npm run dev:stack    # API + Vite together — recommended for local dev
npm run dev          # Vite only (need separate API terminal)
npm run dev:api      # Local API only (port 3000 or $PORT)
npm run dev:vercel   # API via Vercel CLI (optional)
npm run build        # Production build
npm run preview      # Preview production build
```

---

## Deploy to Vercel

1. Connect this repo to Vercel
2. Set in Vercel dashboard → Environment Variables:
   - `GEMINI_API_KEY` (required for cloud unless you use Anthropic only)
   - `ANTHROPIC_API_KEY` (optional — if set, API tries Claude before Gemini)
   - `NEWSAPI_KEY` (optional but recommended)
3. Build command: `npm run build`, output directory: `dist`

> **Note:** Ollama at `127.0.0.1` is not reachable from Vercel serverless. Use Gemini or Anthropic for cloud deploy.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `EADDRINUSE` / port 3000 busy | Use `npm run dev:stack` — auto-picks an open port |
| `ECONNREFUSED` / request failed | Only Vite is running — use `npm run dev:stack` |
| NewsAPI error in 200 response | Key wrong, quota hit, or datacenter IP blocked on free plan |
| Gemini 404 / model not found | Confirm key at [AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_MODEL` to a model your project can call (no automatic model fallback in code) |
| Ollama timeout | Reduce `TRENDING_TOPIC_COUNT`, use `llama3.2:1b`, ensure `ollama serve` is running |
| "अज्ञात विषय" appearing | LLM couldn't identify topic — filtered out automatically; more NewsAPI coverage helps |

---

## What I'd Build Next (4 more weeks)

**Week 1 — Better signals**
- Add Reddit India (r/india, r/cricket, r/bollywood) as third source
- Add YouTube Trending India — top 20 videos
- Weight by source credibility (NDTV > random blog)
- Time-decay so older trends rank lower

**Week 2 — Personalisation**
- User interest graph based on which trends they tap and save
- "Trending for you" vs "Trending in India" split feed
- Location-aware trends: Mumbai users see Mumbai Barish higher
- Hinglish vs pure Hindi preference detection

**Week 3 — Creator side**
- "Create on this trend" — opens post composer pre-tagged with the hashtag
- Trend velocity alerts — notify creators when a trend is just starting to spike
- Creator leaderboard per trend — who's getting the most engagement

**Week 4 — Analytics & trust**
- Trend accuracy score — post-hoc validation of predictions
- Source transparency — show exactly which outlets drove a trend
- Misinformation filter — flag trends spreading false information
- A/B test: card layout vs horizontal scroll vs stories format

---

## Project Structure

```
/
├── api/
│   ├── trending.js              # Vercel serverless function (trending pipeline)
│   └── llm-health.js            # Optional GET /api/llm-health connectivity checks
├── scripts/
│   ├── local-api.mjs            # Local API runner (no Vercel CLI needed)
│   └── dev-stack.mjs            # Runs API + Vite together (npm run dev:stack)
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── components/
│   │   ├── FeedView.jsx         # Feed + category pills + bottom nav + bottom sheets
│   │   ├── DetailView.jsx
│   │   ├── TagCard.jsx
│   │   ├── HeatBadge.jsx
│   │   ├── LoadingSkeleton.jsx
│   │   ├── BottomSheet.jsx
│   │   └── StreamingFeedLoader.jsx
│   ├── context/
│   │   └── AppChromeContext.jsx # Theme, locale (hi/en), saved posts
│   ├── lib/
│   │   ├── translations.jsx
│   │   ├── categories.jsx
│   │   └── detailDemoContent.js
│   └── styles/
│       ├── global.css
│       ├── App.module.css
│       ├── FeedView.module.css
│       ├── DetailView.module.css
│       ├── TagCard.module.css
│       ├── HeatBadge.module.css
│       ├── LoadingSkeleton.module.css
│       ├── BottomSheet.module.css
│       └── StreamingFeedLoader.module.css
├── public/
│   └── screenshot.png
├── .env.example
├── vercel.json
├── vite.config.js
└── README.md
```

---

## Assumptions

- Post counts shown are estimates derived from heat score — ShareChat's actual counts are not publicly available
- Mock posts/videos/reels in detail tabs are illustrative — a real implementation would call ShareChat's internal content API filtered by hashtag
- Images sourced from NewsAPI `urlToImage`; fallback to curated category images when unavailable
- Trend freshness guaranteed by live API calls on every page load with no server-side caching

---

*Built in ~12 hours. Designed for Bharat. Made with curiosity.*
# arinjilley? — Hackathon Board: v1 Spec

_Status: approved · 16 Oct 2026 · Site name: **arinjilley?** (lowercase, with the question mark) · Hosting: Cloudflare (confirmed)_

## 1. What we're building

A **Telegram bot** where club admins post hackathons. The bot pulls out the details, makes a **boarding-pass poster** and returns a **ready-to-paste WhatsApp post**. Once approved, the hackathon goes live on a **website**: a dark-grey, Luma-style timeline sorted by **registration deadline**. A web **admin page** does the same job from a browser: add or edit hackathons by hand and upload images.

**Cost: ₹0 hosting, no credit card, no unofficial WhatsApp tools. AI runs on the club's existing $50 OpenAI credit (estimated well under $1/month).**

```
Admin (Telegram) ──► Bot ──► queue ──► extract details (AI → backup AI → rules)
                                            │
                     preview + poster ◄─────┘
                          │  Approve
              ┌───────────┴────────────┐
              ▼                        ▼
   Poster + WhatsApp text        Database ──► Website (timeline, details, archive)
   → admin posts to group
```

## 2. People

| Role | Who | Can do |
|---|---|---|
| Owner | Abhineeth | Everything + add/remove admins |
| Admin | Up to ~4 (Asil + others, TBD) | Post, edit, approve, delete hackathons |
| Visitor | Anyone | Browse the website (no login) |

## 3. The bot

### 3.1 Main flow: post a hackathon
1. An admin sends **text**, a **registration link**, an **image**, or any mix. Messages from the same admin within ~60 s are **merged** into one draft. This handles "link first, then text" posts.
2. The bot replies right away: _"Got it — processing (2 in queue)"_.
3. The bot pulls out the details (§4). If the text is thin (e.g. just a link), it also reads the link's page title, description, image and text.
4. The bot sends a **preview**: all the details it understood + the generated poster.
   Buttons: **Approve · Edit · Shuffle style · Use my image · Discard**
5. On **Approve**, the hackathon goes live, and the bot replies with:
   - the **poster** (PNG, 1080×1350)
   - the **WhatsApp text** (§6), ready to copy
   - the hackathon's website link

The same flow works when **forwarding an existing WhatsApp post**.

### 3.2 Edge cases
- **Already on the site** (same registration link): _"Already live: <link>"_ + Edit button. No duplicate is created.
- **Not a hackathon** (chit-chat, "deadline today!!"): _"Doesn't look like a hackathon"_ + **Make it one anyway**.
- **Lists with several hackathons in one message** (rare): treated as a single listing. No special handling.
- **Image only**: draft with the image attached. The admin fills in the details via Edit.

### 3.3 Editing
**Edit** → pick a field (Title, Deadline, Dates, Mode, Location, Team, Fee, Prize, Themes, Link, Description) → type the new value → the preview and poster refresh. This works on live listings too, via `/events`.

### 3.4 Commands
`/start` · `/help` · `/events` (live listings → edit/delete) · `/cancel`
Owner only: `/addadmin` · `/removeadmin` · `/admins`

## 4. Extracting details

1. **Clean**: remove phone numbers, other groups' WhatsApp links, sender names, "join our group" footers.
2. **AI extraction** into a fixed set of fields (§5) with **OpenAI**, using the cheapest current "nano"-class model (e.g. `gpt-5-nano`, roughly $0.05 / $0.40 per million input/output tokens as of Sep 2026; confirmed against OpenAI's pricing page at build time). The model name is a single setting, so switching is a one-line change. Structured JSON output, checked against a schema.
   - Cost: roughly 3K tokens per message, about **$0.0005 per hackathon**. Even 50 a day stays under $1/month.
   - Fallback if OpenAI fails or the credit runs out: **Cloudflare Workers AI** (free, built in).
3. **Rule fallback** if both fail: reads the emoji labels the club already uses (📅 📍 ⏰ 👥 💸 🏆 🔗) + a date library.
4. **Dates** are read in **IST**, relative to when the message was sent. Every date is shown in full in the preview (_"Sun 25 Oct, 11:59 PM"_) so a person checks it before anything goes live.
5. A **queue** handles bursts (e.g. 20 messages at once) and retries failures.
6. A **monthly spending cap** is set in the OpenAI dashboard as a safety net.

## 5. Data: one hackathon

| Field | Example | Notes |
|---|---|---|
| title | COLOSSUS 3.0 | required |
| organiser | Dr. AIT, Bengaluru | |
| summary | Build a real solution in 24 hrs… | 1–2 sentences, rewritten cleanly |
| how_it_works | Round 1 online → Round 2 on campus | optional, short list |
| mode | offline / online / hybrid | |
| location | Bengaluru | city; venue optional |
| reg_deadline | 2026-10-25 23:59 IST | empty = **Rolling** |
| event_start / event_end | 13–14 Nov | |
| team_min / team_max | 2 / 4 | solo = 1 / 1 |
| eligibility | UG/PG students | short text |
| fee | Free / ₹800 per team (finals) | text + `is_free` flag |
| prize | ₹1 Lakh+ | text |
| themes | AgriTech, FinTech, … | tags |
| register_url | https://www.colossus3.tech | **unique**, used to spot duplicates |
| more_info_url, brochure_url | | optional |
| poster | generated / custom / organiser + style id | |
| status | draft / live / discarded | |
| created_by, timestamps | | admin's Telegram ID only |

## 6. WhatsApp text template (no emojis)

```
*COLOSSUS 3.0 | 24-Hour Hackathon*
Dr. Ambedkar Institute of Technology, Bengaluru

Build a real solution in 24 hours on campus, with mentors from industry and faculty.

*Registration closes:* Sun 25 Oct, 11:59 PM
*Hackathon:* 13–14 Nov, offline at Dr. AIT, Bengaluru
*Team:* 2–4 (inter-college allowed)
*Who can join:* UG/PG students with a valid college ID
*Fee:* Round 1 free, ₹800 per team for finalists
*Prize pool:* ₹1 Lakh+
*Tracks:* AgriTech, FinTech, Cybersecurity, HealthTech, Hardware/IoT, Open Innovation

*How it works*
1. Round 1 (online): submit your idea on the official template (max 6 slides)
2. Round 2 (offline, 24 hrs): top 60 teams build and pitch with a live demo

Register: https://www.colossus3.tech
Details: <site>/h/colossus-3
Join our group: <WhatsApp group link>
```
Lines with no data are left out. Only WhatsApp formatting (`*bold*`) is used.

## 7. Poster generator

- **Boarding-pass layout** matching the current club posters, **1080×1350** (4:5, works well on WhatsApp and Instagram).
- Filled from the hackathon's details: organiser, title, tagline, deadline stamp, dates, team, fee, prize, tracks, link.
- **8 colour themes × 3 artwork variants**. A new style is picked for each hackathon, and **Shuffle style** re-rolls it.
- **Use my image** replaces it with a custom (e.g. ChatGPT) or organiser poster.
- Text comes straight from the approved details, so **no AI typos on posters**.
- Editing a field re-generates the poster.

## 8. Website

### 8.1 Pages
| Page | URL | Contents |
|---|---|---|
| Home | `/` | Upcoming timeline + filters + search |
| Hackathon | `/h/<slug>` | Full details (side panel on desktop, full page on mobile; always has its own link) |
| Archive | `/archive` | Past listings, newest first, marked DEPARTED |
| About | `/about` | What arinjilley? is, who runs it, group link, "Know a hackathon we missed? Message us" |
| 404 | any unknown URL | Same style ("This flight doesn't exist"), link back to the board |
| Admin | `/admin` | Private. See §8.5 |

### 8.2 Home
- **Top bar**: logo · live IST clock · **Join the group** button.
- **Hero (compact)**: club name, one line about the club, floating tilted posters (our own).
- **Closing soon** strip: up to 4 compact tiles for deadlines in the next 7 days.
- **Board header**: "Upcoming / Archive" as large Sentient tabs with counts, plus a search icon that expands into a field (`/` shortcut). Searches title, organiser, city, themes.
- **Filters as an editable sentence** (no pill rows): _"Hackathons **anywhere**, **free or paid**, **any team size**, about **anything**."_ Each bold word opens a small menu with counts (desktop: dropdown; mobile: bottom sheet). Options: where (anywhere / online / in person / in Kerala), fee (free or paid / free to enter), team (any / solo-friendly / for teams), theme (themes used by 2+ listings). Changed words turn the accent colour, and a "Reset" link appears.
- **Timeline**, grouped by **registration deadline date** (left column: "25 Oct / Sunday"). Each card has the same layout: closing time → **title** → organiser · city · mode → team · prize · fee → status label, with the poster thumbnail on the right.
- **Rolling** group at the end for listings with no deadline.
- **Upcoming | Archive** toggle, like Luma's Upcoming | Past.

### 8.3 Status rules (IST)
| Status | When |
|---|---|
| OPEN (green) | deadline > 48 h away |
| LAST CALL (amber) | deadline within 48 h |
| CLOSED (grey) | deadline passed today |
| → Archive | the **day after** the deadline. Rolling listings: the day after the hackathon ends. No dates at all: stays until an admin removes it. |

Sorted by deadline (soonest first), ties broken by event start.

### 8.4 Hackathon detail
Poster → title → "by Organiser" → icon tiles: **Deadline · Dates · Location/Online · Team · Prize · Fee · Who can join** → countdown pill _"Registration closes in **2d 5h**"_ → summary, how it works, themes.
Actions: **Register ↗** (sticky at the bottom on mobile) · **Add deadline to Google Calendar** · Add event dates · Copy link / Share.
Desktop side panel: ↑ ↓ to move to the next/previous hackathon, Esc to close.
Link previews (WhatsApp, etc.) use the **poster** as the image.

### 8.5 Admin page (`/admin`)
- **Login with Telegram** (Telegram's official login button). Only accounts on the admin list get in, so it's the same list as the bot and there are no extra passwords. Sessions last 30 days.
- **Dashboard**: tabs for Drafts · Live · Archive, search, and a "New hackathon" button. Drafts from the bot show up here, and the other way round.
- **Add / edit form** with every field from §5:
  - **Paste text or a link → "Fill with AI"** fills the form. Every field is still editable.
  - **Poster**: upload an image (drag and drop, or pick from a phone), **or** use the generated boarding-pass poster with a live preview and **Shuffle style**.
  - **Live WhatsApp-text preview** with a Copy button, plus **Download poster** (PNG).
  - Actions: Save draft · Publish · Unpublish · Delete (with confirmation).
- **Admins** (owner only): add or remove admins by Telegram ID.
- Same design system as the public site and fully usable on a phone. Not indexed by search engines.

## 9. Design system: "dark grey, done really well"

**Principles** (from the Luma screenshots): every card has the same layout; hierarchy comes from size and shades of grey; colour only where it means something; icon tile + two lines; calm surfaces; you never lose your place.

**Never**: purple/blue gradients, glows, frosted glass, gradient text, sparkle icons, emoji bullets, everything fading in on scroll, unstyled shadcn defaults.

| Token | Value (starting point) |
|---|---|
| Background | `#161618` |
| Surface (cards) | `#1E1E21` |
| Surface raised (tiles, hover) | `#26262A` |
| Border | `rgba(255,255,255,0.07)` |
| Text: primary / secondary / muted | `#F2F2F3` / `#A3A3AB` / `#6F6F78` |
| Open / Last call / Closed | `#3DD68C` / `#F5A524` / `#8A8A93` |
| Brand accent | **random per visit** from Lime `#C8F560` · Sky `#7CC4FF` · Lilac `#B4A7FF` · Rose `#FF7AA2` · Coral `#FF8E72` · Ivory `#EDE6D6`. Picked once per browser tab session (stays the same while browsing), never the same as the previous visit, set before first paint. |

- **Type**: **Sentient** (serif, Fontshare) for big titles and the hero · **General Sans** (Fontshare) for all UI and body text · **JetBrains Mono** for times, countdowns and labels ("CLOSES 11:59 PM"). Self-hosted.
- **Shape**: 12 px card corners, 8 px for chips/tiles, 4-pt spacing scale, max content width ~720 px for the timeline.
- **Icons**: Phosphor (regular weight).
- **Motion**: 150–250 ms, only on interaction (side panel slide, hover). The split-flap clock/countdown is the one decorative touch. Respects reduced-motion settings.
- **Responsive**: mobile-first from 360 px. On mobile, filters live in a bottom sheet and details open as a full page.
- **Quality bar**: WCAG AA contrast, full keyboard navigation, fast on 4G.

## 10. Privacy and security
- No phone numbers, sender names or other groups' links are stored or shown.
- The original message text is stored only after cleaning (for re-processing).
- Only the owner can add admins. Only admins can use the bot. The bot's webhook verifies a secret token.
- Posters may contain whatever the organiser printed on them. Accepted for v1.

## 11. Tech stack
| Part | Choice |
|---|---|
| Language / repo | TypeScript, npm workspaces monorepo: `apps/bot`, `apps/web`, `packages/core`. GitHub: `AbhineethVS/arinjilley-web` |
| Bot | Cloudflare Worker + **grammY**. Telegram webhook, plus a cron every minute for the queue and message merging |
| Database | **Cloudflare D1** (SQLite) + **Drizzle** for queries and migrations |
| Website + admin | **Astro**, server-rendered on a Cloudflare Worker, reading D1, edge-cached. No React. Interactive bits are small scripts |
| Admin login | Telegram Login Widget, signature checked on the server, signed session cookie |
| AI | **OpenAI** (cheapest nano-class model) → Cloudflare Workers AI → rules (chrono-node). Output validated with **Zod** |
| Reading links | Cloudflare's built-in HTMLRewriter (page title, description, image, text) |
| Posters | The boarding-pass poster is an HTML/CSS page (same code as the mock-up), screenshotted by **Cloudflare Browser Rendering** (free: 10 browser-minutes/day, about 7–15 s per poster). Rendering inside the Worker (Satori + resvg) was tested and exceeds the free plan's 10 ms CPU limit (error 1102) |
| Images | Stored in **Telegram** (uploaded posters and generated ones). We keep the file ID and serve images through our own `/img/...` link with long caching. No R2 needed |
| Fonts / icons | Sentient, General Sans, JetBrains Mono and the Phosphor icons we use, all self-hosted |
| Tooling | Wrangler (local dev + deploy), Vitest, Biome |
| Domain | `*.workers.dev` for free; optional custom domain (~₹800/yr) |
| Secrets | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `OPENAI_API_KEY`, `SESSION_SECRET`: set with `wrangler secret put` or a git-ignored `.dev.vars` file, never committed

**Poster rendering (tested 17 Oct):** generating PNGs inside the Worker exceeded the free CPU limit on every request, so posters are rendered by Cloudflare Browser Rendering instead. Free limits: 10 browser-minutes/day, 1 new browser per 20 s (sessions are reused for 60 s). If the daily limit is ever hit, the poster is retried later; listings still go live without waiting.

## 12. Not in v1
Automatic WhatsApp capture · reading text inside posters/PDFs · special handling for lists · repost/bump feature · light mode · visitor accounts or notifications.

## 13. Build order
1. ~~Clickable design mock-up~~ ✅ approved 17 Oct
2. Project setup, database, bot answers `/start` (deployed) + **poster CPU test**
3. Queue, AI extraction, preview / edit / approve, admin commands
4. Poster generator + WhatsApp text
5. Public website from the mock-up (home, hackathon, archive, about, 404)
6. Admin page (Telegram login, dashboard, add/edit form, image upload, Fill with AI)
7. Polish, test with real posts, onboard admins

## 14. Open items
- The other 3 admins (later)
- The WhatsApp group link to use in the footer

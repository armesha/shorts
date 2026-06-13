# Architecture & Stack

Automated YouTube Shorts factory: on a schedule, generate a "N facts" image from an
HTML template, turn it into a 5–6s vertical video with copyright-free audio, and upload
it (scheduled) to one of several YouTube channels — fully unattended. Managed via a web UI.

## Stack (chosen)

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 22 LTS + TypeScript** (run via `tsx`, no build step) | One language end-to-end; best ecosystem for every integration below; easy/fast to iterate. |
| HTML → image | **puppeteer-core + system Chrome** | Pixel-perfect full CSS (the marker-highlight look). `puppeteer-core` = no bundled Chromium download → light. |
| image → video | **ffmpeg** (`ffmpeg-static` binary) | Standard, portable, no system dependency. |
| LLM | **Claude Code headless** (`claude -p`) | User's chosen engine — paid Claude subscription, **no fallback**. |
| YouTube | **googleapis** (Data API v3) | Official client; resumable upload + scheduled publish. |
| Web/dashboard | **Fastify** + light frontend | Fast, low-overhead; manage accounts/timings/themes/logs. |
| Scheduler | **node-cron** (→ BullMQ+Redis only if scaling) | Per-account timings without extra infra. |
| DB | **node:sqlite** (built-in) | Zero dependency, zero config; stores accounts, encrypted tokens, schedule, content history. |
| Validation | **zod** | Validates LLM JSON; catches bad output before render. |

Heaviest piece is Chrome, and it only runs for the ~1–2s render, a few times/day.

## Pipeline (per scheduled run, per account)

1. Scheduler fires (e.g. 00:00/06:00/12:00/18:00) for account X.
2. **LLM** (Claude Code headless) generates: `title`, 6 `facts` (each ~2 lines, one **bold** key phrase),
   plus YouTube `title`/`description`/`tags`. Prompt includes the account's recent angles → avoids repeats.
3. **Render** fills `templates/short.html` → screenshot 1080×1920 (PNG/JPG). Shrink-to-fit keeps text evenly distributed.
4. **Video** = still image looped 5–6s + copyright-free audio → MP4 (H.264, yuv420p, 1080×1920, AAC 48k, faststart).
5. **Upload** via YouTube Data API with `status.privacyStatus=private` + `publishAt` (scheduled), or immediate.
6. **History** records the topic/angle to keep future content unique.
7. **Log** result to the dashboard.

## Key research findings (2026) that shape the design

### Claude Code as the LLM (the user's choice)
- `claude -p "<prompt>"` headless **works** (verified in this repo: full DE generation in ~27s).
- Subscription (Pro/Max) powering an **unattended** pipeline is allowed **only for your own use on your own
  subscription**, via the **Agent SDK monthly credit** (~$20 / $100 / $200 by plan); past that it bills per-token.
  It is **not "unlimited free"**, and offering it as a service to third parties requires an **API key** (Commercial Terms).
- ⇒ Decision: **Claude subscription only, no fallback** (the user pays the subscription). Keep prompts lean to stay within the monthly Agent SDK credit.

### YouTube Data API
- **Quota is ~100 uploads/day per project** (since 2026-06-01: `videos.insert` = 1 unit in a separate "Video Uploads"
  bucket, capped 100/day) — NOT the old ~6/day.
- **No API flag makes a "Short"** — vertical (1080×1920) + ≤3 min ⇒ auto-classified. `#Shorts` not required.
- **Scheduling:** must set `privacyStatus=private` **and** `publishAt` (RFC3339 UTC) together, on a never-published video.
- **Multiple channels:** ONE OAuth client (one Client ID/Secret) authorizes many channels — run consent once per
  channel, store **one refresh token per channel**. One Google account manages up to 100 channels (Brand Accounts).
- ⚠️ **Sharding is banned:** you may NOT spin up extra Cloud projects to multiply quota (ToS) — one project per use case.
- ⚠️ **Two audits needed for production:** (a) OAuth sensitive-scope verification (else refresh tokens **die after 7 days**
  in Testing mode — fatal for a bot); (b) YouTube upload audit (else **every upload is forced private**, breaking scheduling).
  Both need a public homepage + privacy policy URL + a demo video; ~days to ~2 weeks.
- ⚠️ **Biggest business risk:** YouTube's **"inauthentic / mass-produced repetitive content"** policy can demonetize or
  terminate channels. Mitigation is built into the spec: maximize per-video variation (different templates, angles, topics,
  audio) and the uniqueness/history check.

### Media
- Renderer: Puppeteer (full CSS) > Satori for our marker-highlight look. Wait for `document.fonts.ready` before capture.
- On a fresh VPS install fonts: `fonts-liberation fonts-noto-core fonts-noto-color-emoji` (+ our serif/handwriting fonts).
- Audio: **YouTube Audio Library "no attribution"** tracks are the only Content-ID-safe, monetizable, zero-text option.
  Pixabay/Mixkit are secondary (Pixabay can occasionally be claimed).
- 5–6s loop is legit: since 2025-03-31 each replay counts as a view, and Shorts ranks on completion %.

## Status
- [x] Project scaffold (Node+TS, tests)
- [x] HTML template matching reference Shorts (marker title + 6 even facts + handwritten signature)
- [x] Renderer: HTML → 1080×1920 image (system Chrome)
- [x] LLM: Claude Code headless → validated JSON (title/facts/video meta), uniqueness-aware prompt
- [x] Unit tests (JSON extraction + schema)
- [ ] Video assembly (ffmpeg) + audio library
- [ ] YouTube OAuth (multi-channel) + resumable upload + scheduled publish
- [ ] SQLite store (accounts, tokens, history) + scheduler (node-cron)
- [ ] Fastify dashboard (accounts, per-account theme/timings, logs)

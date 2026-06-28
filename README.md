# Shorts Factory

Automated YouTube Shorts pipeline: an LLM generates "N facts" / quote / joke / verse content →
fills an HTML template → 1080×1920 image → short vertical video → scheduled upload to multiple
YouTube channels, unattended, all managed from a web dashboard.

## Quick start

```bash
npm run setup      # install root + web deps
npm start          # API (:8080) + web dev (:5173) together

# or run the pieces separately:
npm run server     # Fastify API on :8080  (needs the Google client-secret file present)
npm run web        # Vite dev server on :5173 (proxies /api → :8080)
npm run web:build  # build the dashboard into web/dist (served by the API in prod)
npm run server:restart  # safe prod restart: stop stale :8080 pids, start shorts.service, health-check
npm run deploy:refresh  # web:build + safe prod restart + public smoke check for shareboard.live
```

Checks: `npm test` (node:test) · `npm run typecheck` (tsc --noEmit, src + server).

Production uses systemd units from `systemd/`: `shorts.service` serves the API and scheduler with
`GEN_QUEUE_RUNNER=external`, while `shorts-gen-worker.service` renders the SQLite-backed generation
queue. `npm run server:restart` restarts both when the worker unit is installed; without systemd it
falls back to the old embedded `npm run server` mode.

## Layout

| Path | What |
|------|------|
| `src/`       | core pipeline — render (HTML→image via Chrome), video (ffmpeg), per-deck modules, deck registry |
| `server/`    | Fastify API — routes, SQLite data layer (`db.ts`), auth, scheduler, YouTube/Telegram services |
| `web/`       | Vite + React + TS + Tailwind/DaisyUI dashboard (the site) |
| `data/`      | generated decks + runtime DB/output (gitignored) |
| `assets/`    | backgrounds, audio, avatars, prebuilt video packs |
| `templates/` | HTML render templates |
| `docs/`      | architecture, pack-generation, reorg plan, ops notes |

## Stack

TypeScript · Node + Fastify (run via `tsx`, no build step) · SQLite (`node:sqlite`) ·
React + Vite · Tailwind + daisyUI · puppeteer-core + system Chrome · ffmpeg ·
YouTube Data/Analytics API · Telegram Bot API.

## For agents / contributors

- **`CLAUDE.md`** — mandatory working rules (language, 24h time format, server-restart regimen,
  security, git workflow). Read it first.
- **`docs/REORG-PLAN.md`** — repository layout map + the SOLID monolith-split & cleanup plan.
- **`docs/STACK.md`** — architecture & research.
- **`docs/pack-generation.md`** — how every built-in deck / video pack / template-pack is built,
  generated, and replenished.

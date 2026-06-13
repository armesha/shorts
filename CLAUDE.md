# shorts-factory

Automated YouTube Shorts pipeline: LLM generates "N facts" content → fills a template →
1080×1920 image → 5–6s vertical video → scheduled upload to multiple YouTube channels,
unattended, managed from a web dashboard. Spec: `ТЗ.pdf`. Architecture & research: `docs/STACK.md`.

## Язык общения (MANDATORY)
- Отвечай пользователю **ТОЛЬКО на русском** (always reply to the user in Russian), независимо от языка кода, логов и т.п.

## 🔒 Security rules (MANDATORY)
- **NEVER read, cat, open, print, grep, or otherwise access** the Google OAuth client-secret file:
  `/home/davtian/Documents/shorts/client_secret_735991879461-lcvblrn3co3hlrrqi1ljvik2ih68oarp.apps.googleusercontent.com.json`
  — nor any `client_secret_*.json` / `*.apps.googleusercontent.com.json`.
  The running app loads it at runtime via fs; the agent must never touch its contents.
  A hard deny rule is set in `.claude/settings.json`.
- These files are git-ignored. Never commit secrets. The user always passes the full path to this file.

## Git workflow (MANDATORY)
- Remote `origin` = `https://github.com/armesha/shorts.git`, default branch `main`.
- **After finishing each feature/fix: commit AND push** (`git add -A && git commit -m "…" && git push`). Don't leave work uncommitted.
- Веди **CHANGELOG.md** (Добавлено/Изменено/Убрано/Исправлено) — обновляй его перед коммитом каждой фичи.
- NEVER commit secrets — `client_secret_*.json`, `.env`, tokens, `corpora/`, `data/output`, DBs are gitignored. Verify staging before committing.
- Cross-platform: code must run on Windows + macOS + Linux. One-command start = `npm start`.
- End commit messages with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## LLM
- Generation uses **Claude Code headless** (`claude -p`) ONLY — no fallback. Paid Claude subscription.

## Stack
- Backend: Node + TypeScript, **Fastify** (run via `tsx`). DB: built-in `node:sqlite`. Scheduler: node-cron.
- Frontend: **Vite + React + TypeScript + Tailwind + DaisyUI**, **light theme** (it's a website, not a dark dashboard).
- Render: puppeteer-core + system Chrome. Video: ffmpeg. YouTube: googleapis.
- The app **REQUIRES** the client-secret file to start: env `GOOGLE_CLIENT_SECRET_FILE=<full path>`.
  If the file is missing/unreadable, the server **fails fast** and does not start.

## Layout
- `src/`      — core pipeline (render, llm, …)
- `server/`   — Fastify API (loads creds, runs the pipeline, scheduler)
- `web/`      — Vite React frontend (the dashboard site)
- `docs/`     — STACK.md and notes
- `untitled.pen` — Pencil design file with the chosen Short templates

## Commands
- `npm test` — unit tests (node:test)
- `npm run render:preview` / `npm run gen:preview` — pipeline smoke tests (HTML→image, Claude→image)
- `npm run server` — Fastify API on :8080 (uses `--experimental-sqlite`). Creds path is hardcoded in `server/config.ts` (`DEFAULT_CLIENT_SECRET_FILE`); env `GOOGLE_CLIENT_SECRET_FILE` overrides. Fails fast if the file is missing.
- `npm run web` — Vite dev (frontend on :5173, proxies `/api` → :8080)
- Verify the UI headlessly: `npm run server` + `npm run web`, then `tsx src/scripts/screenshot-url.ts <url> <out.png>`.

## Notes for myself (keep updated)
- **Subagent/workflow MODEL policy (user rule):** anecdote formatting & titling → use **Claude Haiku** (bulk, cheap/fast). For ALL other subagents/workflows → inherit the **main session model** (don't override `model`).
- Frontend uses DaisyUI v5 + Tailwind v4 (`@plugin "daisyui"` in `web/src/index.css`); theme forced light via `data-theme="light"` on `<html>`.
- `lucide-react` has no `Chrome` icon — use `MonitorPlay`/`Globe` instead.
- Pencil templates live in `untitled.pen`; never use Read/Grep on `.pen` files (encrypted) — only the `pencil` MCP tools.
- Backend DB = `node:sqlite` → run with `--experimental-sqlite` (already in `npm run server`). DB file `data/app.db` (gitignored via `data/`). Schema/helpers in `server/db.ts`.
- Templates: 8 textured ones in Pencil (1 Kraft, 2 Slate, 3 Parchment, 4 Marble, 5 Linen, 6 Concrete, 7 Walnut, 8 Newsprint); the first 5 flat ones were deleted. TODO: convert the chosen template(s) into the real HTML render template (`src/render.ts` currently has no template file — `templates/` was removed).
- Each account stores a chosen `template` (UI dropdown on the account page).
- First generator = **Русские анекдоты (no AI)**: `src/anecdotes/build.ts` parses `Русские анекдоты/anek_djvu.txt` (split on `<|startoftext|>`; drop mat/@-censored/dupes) → packs of 1000 in `data/anecdotes/` (currently 54,954 in range 100–350 chars). Runtime picks random via `src/anecdotes/library.ts`.
- Anecdote render: `templates/anecdote.html` + `src/anecdotes/render.ts` — binary-search auto-fit fills the frame and checks BOTH vertical AND horizontal overflow (long words must never clip — that's a hard user requirement). Random light bg from `BACKGROUNDS`.
- Studio: `POST /api/generate/anecdote {text?,title?}` → preview PNG served at `/files/...`; frontend `web/src/pages/Studio.tsx`. Anecdote title one-line limit ≈ 28 Cyrillic chars.
- E2E: `node --import tsx src/scripts/e2e.ts` (Playwright via `channel:'chrome'`) drives the live site; needs `npm run server` + `npm run web` up.
- TODO requested: editable Google client-secret path in Settings UI (hardcoded default stays for now). AI/subagent titling of anecdotes (currently generic titles).
- **Auth (Этап 1 готов):** вход в панель обязателен. `server/auth.ts` = scrypt-хэш + токены сессий + политика блокировки; таблицы `users`/`sessions` в `server/db.ts`; гейт всего `/api/*` + роуты `/api/auth/{login,logout,me}` в `server/index.ts`. Юзеры сидятся из `.env`: `ADMIN_USERNAME`/`ADMIN_PASSWORD` (admin) + `SEED_USERS="name:pass,…"` (user), идемпотентно (создаёт, если нет — пароль не перезатирает). Сессия = httpOnly-кука `sid`; блокировка после `AUTH_MAX_ATTEMPTS`(10) на `AUTH_LOCK_MINUTES`(15) мин. Фронт: `web/src/lib/auth.tsx` (AuthProvider/useAuth), `web/src/pages/Login.tsx`, гейт в `App.tsx`, выход в `Layout.tsx`. **Этап 2 TODO:** `user_id` у каналов (изоляция — свои каналы/ключ видит только владелец), свой Google client-secret на юзера, общий пул анекдотов, учёт «использованных» per-user, UI создания юзеров вместо `.env`.

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

## Сервер / процессы (MANDATORY)
- **НЕ перезапускай, не останавливай и не «убивай»** backend-сервер (`npm run server`, процесс на
  порту :8080) — как и другие общие долгоживущие dev-процессы (Vite `npm run web` на :5173) —
  **без явного разрешения пользователя**. Сервер ОБЩИЙ: над проектом параллельно работают другие
  агенты, которым он нужен; рестарт оборвёт их и текущие генерации/выкладки.
- После правок бэкенда изменения вступают в силу только после перезапуска (`tsx` не перечитывает код
  на лету). Если перезапуск нужен — **сначала спроси разрешение и объясни зачем**, сам не перезапускай.
  Фронт в dev/при пересборке подхватывается без рестарта сервера.

## Git workflow (MANDATORY)
- Remote `origin` = `https://github.com/armesha/shorts.git`, default branch `main`.
- **After finishing each feature/fix: commit AND push** (`git add -A && git commit -m "…" && git push`). Don't leave work uncommitted.
- Веди **CHANGELOG.md** (Добавлено/Изменено/Убрано/Исправлено) — обновляй его перед коммитом каждой фичи.
- NEVER commit secrets — `client_secret_*.json`, `.env`, tokens, `corpora/`, `data/output`, DBs are gitignored. Verify staging before committing.
- Cross-platform: code must run on Windows + macOS + Linux. One-command start = `npm start`.
- End commit messages with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Параллельные агенты (MANDATORY):** если над ОБЩИМ файлом (`server/index.ts`, `server/db.ts`,
  `web/src/lib/api.ts`, `web/src/App.tsx`, `Layout.tsx`, `CHANGELOG.md`, `CLAUDE.md` и т.п.) в это же
  время работает другой агент — **НЕ изолируй свой коммит через `git stash` / частичный стейджинг**.
  Коммить только СВОИ отдельные/новые файлы; общий файл пусть закоммитит тот агент, который его ведёт
  (или дождись его). Свои правки в общий файл просто оставь в рабочем дереве — они уедут с его коммитом.

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
- **Subagent/workflow MODEL policy (user rule):** anecdote formatting & titling, AND **lifehacks/tips generation** → use **Claude Haiku** (bulk, cheap/fast). For ALL other subagents/workflows → inherit the **main session model** (don't override `model`).
- Frontend uses DaisyUI v5 + Tailwind v4 (`@plugin "daisyui"` in `web/src/index.css`); theme forced light via `data-theme="light"` on `<html>`.
- `lucide-react` has no `Chrome` icon — use `MonitorPlay`/`Globe` instead.
- Pencil templates live in `untitled.pen`; never use Read/Grep on `.pen` files (encrypted) — only the `pencil` MCP tools.
- Backend DB = `node:sqlite` → run with `--experimental-sqlite` (already in `npm run server`). DB file `data/app.db` (gitignored via `data/`). Schema/helpers in `server/db.ts`.
- Templates: 8 textured ones in Pencil (1 Kraft, 2 Slate, 3 Parchment, 4 Marble, 5 Linen, 6 Concrete, 7 Walnut, 8 Newsprint); the first 5 flat ones were deleted. TODO: convert the chosen template(s) into the real HTML render template (`src/render.ts` currently has no template file — `templates/` was removed).
- Each account stores a chosen `template` (UI dropdown on the account page).
- First generator = **Русские анекдоты (no AI)**: `src/anecdotes/build.ts` parses `Русские анекдоты/anek_djvu.txt` (split on `<|startoftext|>`; drop mat/@-censored/dupes) → packs of 1000 in `data/anecdotes/` (currently 54,954 in range 100–350 chars). Runtime picks random via `src/anecdotes/library.ts`.
- Anecdote render: `templates/anecdote.html` + `src/anecdotes/render.ts` — binary-search auto-fit fills the frame and checks BOTH vertical AND horizontal overflow (long words must never clip — that's a hard user requirement). Random light bg from `BACKGROUNDS`. Font ≤72px, line-height grow capped ≤1.9 (no big gaps), title auto-shrinks to one line.
- **IT-дека — плотная (переделка через Haiku):** `src/anecdotes/it-mine.ts` (добыча длинных 330–620 из `corpora/it-*.jsonl`, источник ~152k) → Haiku-воркфлоу чистки (акценты `e'→è`, юзнет-мусор, mojibake, не-шутки) → `src/anecdotes/build-it-dense.ts` (NSFW-фильтр + дедуп + паки) → 1169 плотных (медиана 424), 2 прохода Haiku (`IT_OFFSET` берёт непересекающиеся кандидаты). Ещё ~3k в полосе не использовано.
- Studio: `POST /api/generate/anecdote {text?,title?}` → preview PNG served at `/files/...`; frontend `web/src/pages/Studio.tsx`. Anecdote title one-line limit ≈ 28 Cyrillic chars.
- E2E: `node --import tsx src/scripts/e2e.ts` (Playwright via `channel:'chrome'`) drives the live site; needs `npm run server` + `npm run web` up.
- **Лайфхаки (дека `tips`):** 979 русских советов по 10 профессиям, сгенерированы Haiku-воркфлоу
  (60 партий → `corpora/tips-gen/<prof>-<n>.json` → `src/anecdotes/build-tips.ts` → `data/tips/titled.json` + `index.json`).
  Свой рендер: `templates/lifehack.html` + `renderLifehack()` в `render.ts` (диспетч по флагу `deck.lifehack`);
  фон = `assets/backgrounds/lifehacks/profession_<key>.jpg`, заголовок в красную плашку, текст Г-образно
  обтекает фигуру через `shape-outside` (без «растягивания» межстрочного — оно ломало низ). `item.profession`
  лежит в titled.json и протянут через `pipeline.ts` + 4 точки `server/index.ts`. Фронт деко-агностичен
  (язык `tips` в `LANGS`, генераторы из `/api/generators`). Перегенерация — повторный Haiku-воркфлоу
  (правило: лайфхаки → Haiku). Тесты: `src/scripts/render-lifehack-test.ts`, `src/scripts/tips-e2e.ts`.
- **Немецкие лайфхаки (дека `tips-de`, «Deutsche Lifehacks»):** 1319 советов, та же структура.
  Фоны — усатый вариант `profession_<key>_chaplin.jpg` (поле `lifehackVariant: "chaplin"` в `decks.ts`;
  русская `tips` — без усов, `profession_<key>.jpg`); `lifehackBgFile(profession, variant)` в `render.ts`.
  Ключи англ. Сборка `src/anecdotes/build-tips-de.ts`
  (длина 300–500; `parseItems` чинит немецкие кавычки `„…"` с прямой `"`). Любая lifehack-дека
  помечается `lifehack: true` в `decks.ts` → один диспетч на все. Серверных правок не нужно.
- **Статистика каналов (вкладка `/statistics`, видна ВСЕМ юзерам):** снимки YouTube-метрик во времени.
  Таблица `channel_stats` (account_id, subscribers, views, videos, taken_at) + хелперы в `db.ts`
  (`addChannelSnapshot`/`twoLatestSnapshots`/`listChannelSnapshots`). `server/stats.ts` =
  `fetchChannelStats()` через `channels.list(part=statistics)` — **тот же scope `youtube.readonly`,
  переподключать каналы НЕ нужно**, стороннего сервиса нет. Роуты в `index.ts`:
  `GET /api/stats?scope=mine|all`, `POST /api/stats/refresh` (опрос YouTube ключом ВЛАДЕЛЬЦА канала
  + снимок + дельты), `GET /api/stats/:id/history`. Дельта = latest−prev снимок. Каждый юзер видит
  свои каналы; админ + `scope=all` → все каналы всех. Фронт `web/src/pages/Statistics.tsx` (Recharts,
  кнопка «Обновить данные» = снять снимок; график строится из ≥2 снимков). `taken_at` из SQLite — UTC
  без зоны, на фронте парсится как UTC (`parseUtc`).
- **Исламская дека (`islamic`, «آيات وأذكار» / Ислам · Коран и хадисы):** 500 карточек на арабском
  (аяты Корана + хадисы ан-Навави/кудси + дуа Хиснуль-Муслим), **точный** текст. Пайплайн добычи:
  `src/scripts/islamic-fetch-corpus.mjs` (тянет точный арабский из `api.alquran.cloud`,
  `cdn.jsdelivr.net/gh/fawazahmed0/hadith-api`, `hisnmuslim.com` → `corpora/islamic/*` — gitignored) →
  `islamic-split.mjs` (слайсы) → **ultracode-воркфлоу, агенты на Sonnet** (правило-исключение по просьбе
  юзера: тут Sonnet, не Haiku/Opus) выбирают важные id из локальных файлов (не из гугла) →
  `islamic-assemble.mjs` подставляет точный арабский по id из `corpora/islamic/pool.json` →
  `data/islamic/cards.json` (+ index.json). Карточка = `{type,arabic,ref,ref_en,theme}` (как psych —
  весь объект JSON в `text`). Рендер: `templates/islamic.html` + `src/islamic/render.ts`, диспетч по
  флагу `islamic:true` в `decks.ts`; фоны `assets/backgrounds/islamic_templates/` (10 тёмно-золотых),
  у каждого своя safe-зона (карта `SAFE` в render.ts) + авто-подгон шрифта. `ytMeta` для islamic =
  читаемый арабский + ссылка (не JSON). Заголовок видео (title) = арабская ссылка `ref`.
- **⚠️ GOTCHA рендера арабского (headless Chrome 149):** НИКОГДА не ставь `dir="rtl"` на `<html>` —
  это гасит **весь** текст в скриншоте (чёрный кадр, даже латиница/кириллица). RTL делай через CSS
  `direction:rtl` на самих текстовых элементах (bidi и так разворачивает арабский). Шрифт — **системный
  `Noto Naskh Arabic`** (веб-Amiri/Scheherazade тоже не рисуются). И НЕ добавляй `--disable-gpu` — в этом
  Chrome он тоже гасит текст; дефолтные флаги `captureCard` работают.
- **TODO (просьба юзера):** для исламских видео — НЕ инструментальная музыка; нужен короткий (5–7с)
  бесплатный не-инструментальный звук (нашид-вокал / эмбиент), отдельно от общего музыкального пула.
- TODO requested: editable Google client-secret path in Settings UI (hardcoded default stays for now). AI/subagent titling of anecdotes (currently generic titles).
- **Auth (Этап 1 готов):** вход в панель обязателен. `server/auth.ts` = scrypt-хэш + токены сессий + политика блокировки; таблицы `users`/`sessions` в `server/db.ts`; гейт всего `/api/*` + роуты `/api/auth/{login,logout,me}` в `server/index.ts`. Юзеры сидятся из `.env`: `ADMIN_USERNAME`/`ADMIN_PASSWORD` (admin) + `SEED_USERS="name:pass,…"` (user), идемпотентно (создаёт, если нет — пароль не перезатирает). Сессия = httpOnly-кука `sid`; блокировка после `AUTH_MAX_ATTEMPTS`(10) на `AUTH_LOCK_MINUTES`(15) мин. Фронт: `web/src/lib/auth.tsx` (AuthProvider/useAuth), `web/src/pages/Login.tsx`, гейт в `App.tsx`, выход в `Layout.tsx`. **Этап 2 TODO:** `user_id` у каналов (изоляция — свои каналы/ключ видит только владелец), свой Google client-secret на юзера, общий пул анекдотов, учёт «использованных» per-user, UI создания юзеров вместо `.env`.

# shorts-factory

Automated YouTube Shorts pipeline: LLM generates "N facts" content → fills a template →
1080×1920 image → 5–6s vertical video → scheduled upload to multiple YouTube channels,
unattended, managed from a web dashboard. Architecture & research: `docs/STACK.md`.

## Язык общения (MANDATORY)
- Отвечай пользователю **ТОЛЬКО на русском** (always reply to the user in Russian), независимо от языка кода, логов и т.п.

## 🕒 Время — ТОЛЬКО 24 часа (MANDATORY)
- **ВСЁ отображаемое время — строго 24-часовой формат. НИКОГДА AM/PM.** (Агенты уже не раз возвращали AM/PM — это баг, не делай так.)
- **НЕ используй `<input type="time">` / `type="datetime-local">`:** нативный виджет Chrome показывает AM/PM в 12-часовой локали браузера, и атрибут `lang` это НЕ переопределяет. Для ввода времени — обычный текстовый инпут «ЧЧ:ММ» с валидацией `^([01]\d|2[0-3]):[0-5]\d$` (образец — расписание в `web/src/pages/AccountDetail.tsx`).
- **Для дат/времени ВСЕГДА передавай локаль `"ru-RU"`** (для времени при необходимости ещё `hour12: false`). НИКОГДА не вызывай `toLocaleString()/toLocaleTimeString()/toLocaleDateString()` без аргумента локали — на машине зрителя с локалью en-US это даёт AM/PM и формат M/D/Y.

## 🔁 Перезапуск сервера (MANDATORY — сообщай в конце задания)
- **В конце КАЖДОГО задания одной строкой пиши, нужен ли перезапуск сервера** (и сделал ли ты его уже).
- Правило: правки backend (`server/**` и `src/**` — всё, что импортит работающий `server/index.ts`) → **перезапуск НУЖЕН** (`npm run server`; tsx читает TS при старте, на лету не подхватывает). Только фронт (`web/src/**`) → **НЕ нужен**, достаточно `npm run web:build` + Ctrl+F5 (сервер отдаёт `web/dist` статикой). Данные (`data/**`) — обычно не нужен (есть `resetDeckCache`); сомневаешься — перезапусти.
- Если пользователь явно разрешил/попросил перезапуск (например, «не забудь перезапустить», «можешь перезапустить», «перезапусти») — **делай его сам** по регламенту ниже и в ответе укажи, что уже перезапустил.

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
  на лету). Если разрешения ещё нет — **сначала спроси разрешение и объясни зачем**.
  Фронт в dev/при пересборке подхватывается без рестарта сервера.

### Регламент перезапуска shareboard.live / backend :8080 (MANDATORY)
- **Цель:** после backend-правок должен остаться ровно один живой backend-процесс на `:8080`, а
  `https://shareboard.live/` должен обслуживаться новым кодом.
- **Сначала найти реальный процесс на порту, а не гадать по `pgrep`:**
  `ss -ltnp sport = :8080`
- Если `:8080` слушает `node` с PID `<pid>`, остановить именно его:
  `kill <pid>`
- Подождать освобождения порта:
  `sleep 1 && ss -ltnp sport = :8080`
- Запустить backend из корня проекта:
  `nohup npm run server >/tmp/shorts-server.log 2>&1 &`
- Проверить, что поднялся новый процесс и порт слушает:
  `ss -ltnp sport = :8080`
- Проверить health:
  `curl -sS http://localhost:8080/api/health`
  Ожидаемый ответ: JSON с `"ok":true`.
- Проверить лог старта:
  `tail -80 /tmp/shorts-server.log`
  В логе должны быть `Server listening ... :8080`, `Shorts Factory API on :8080`, без stack trace.
- Если после запуска видны **два** backend-процесса/две npm-цепочки, оставить только PID, который
  реально слушает `:8080`; старые `npm run server` / `sh -c node ...` / `node ... server/index.ts`
  убрать через `kill`.
- Не использовать shell-pipe в `pgrep` вида `pgrep -af "node|tsx|..."`: это не regex для процессов,
  а shell pipe. Для диагностики достаточно `ss -ltnp sport = :8080`, затем точечный `ps -fp <pid>`.

### Caddy-«дверь» перед приложением — страница обслуживания вместо 502 (MANDATORY знать)
- cloudflared теперь ведёт `shareboard.live` + `www` → **Caddy** `http://127.0.0.1:8090` → приложение
  `:8080`. (`code.shareboard.live` по-прежнему напрямую на `:8443` — не трогать.) Пока приложение
  перезапускается, Caddy отдаёт страницу **«Обновляемся»** (HTTP 503 + `Retry-After`, авто-рефреш
  каждые 15с) вместо сырого Cloudflare «502 Bad Gateway».
- **Приложение осталось на :8080 — весь регламент рестарта выше без изменений.** Рестарт app теперь
  просто показывает заглушку, а не ошибку; cloudflared трогать НЕ нужно.
- Конфиг Caddy: `/etc/caddy/Caddyfile` (бэкап дефолта — `/etc/caddy/Caddyfile.orig`). Caddy = systemd
  сервис `caddy` (enabled, слушает loopback `127.0.0.1:8090`, admin на `127.0.0.1:2019`).
- Поменять текст/вид страницы: править `/etc/caddy/Caddyfile`, затем
  `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` и
  `sudo systemctl reload caddy` (graceful, тоннель не рвётся). ВАЖНО: адрес сайта — `http://:8090`
  (с `http://`, иначе Caddy поднимет HTTPS и cloudflared получит 502; и `bind 127.0.0.1` для loopback);
  host НЕ фиксировать (cloudflared шлёт `Host: shareboard.live`).
- cloudflared-ingress: `/etc/cloudflared/config.yml` (бэкап до Caddy — `config.yml.bak.pre-caddy`);
  флаг `--config` у cloudflared глобальный, ДО подкоманды.

## 🚧 Другие проекты на машине — НЕ трогай `casino` (MANDATORY)
- На этой машине живёт ОТДЕЛЬНЫЙ, несвязанный проект **`casino`** (`~/Documents/casino`); над ним
  работает другой агент. **Ты занимаешься ТОЛЬКО `shorts`.**
- **НИКОГДА не читай-для-правки, не редактируй, не перемещай, не удаляй и не коммить** ничего внутри
  `~/Documents/casino` (или любого другого проекта). Не запускай его скрипты/сборки/миграции/тесты.
- **НЕ убивай чужие процессы.** Не делай массовых kill по порту/имени (`pkill -f`, `fuser -k`,
  `kill-port`, `kill %`) — так можно прибить процессы `casino`. Останавливай только процессы
  `shorts`, точечно по PID (как в регламенте `:8080` выше).
- Порты: `shorts` держит **:8080** (backend) и **:5173** (Vite). Чтобы не конфликтовать, `casino`
  работает на ДРУГИХ портах — **:8137** (backend), **:5180** (Vite), **:9100** (ops) — плюс свой
  ngrok-агент. Не занимай эти порты `casino` и не трогай эти процессы.

## Git workflow (MANDATORY)
- Remote `origin` = `https://github.com/armesha/shorts.git`, default branch `main`.
- **After finishing each feature/fix: commit AND push** (`git add -A && git commit -m "…" && git push`). Don't leave work uncommitted.
- Веди **CHANGELOG.md** (Добавлено/Изменено/Убрано/Исправлено) — обновляй его перед коммитом каждой фичи.
  **КРАТКО (MANDATORY):** каждый пункт — ОДНА короткая строка (≈до 12–15 слов), как заголовок: что появилось, без
  абзацев, без перечисления всех деталей/механики. Подробное описание — лишнее, оно засоряет страницу «Обновления».
  Образец — текущий `CHANGELOG.md` (одна строка на фичу). Не разворачивай старые пункты обратно в абзацы.
  **ТОЛЬКО ОБЩИЕ ФИЧИ (MANDATORY):** CHANGELOG («Обновления») виден всем — пиши ТОЛЬКО фичи для всех
  пользователей. Admin-only фичи (вкладка «Сервер», Админка, admin-only деки, пороги/отчёты у админа
  и т.п.) в CHANGELOG НЕ упоминай; из общих пунктов убирай скобки вида «(только админ)».
- NEVER commit secrets — `client_secret_*.json`, `.env`, tokens, `corpora/`, `data/output`, DBs are gitignored. Verify staging before committing.
- Cross-platform: code must run on Windows + macOS + Linux. One-command start = `npm start`.
- End commit messages with: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Параллельные агенты (MANDATORY):** коммитить можно файлы **целиком** — даже общие
  (`server/index.ts`, `server/db.ts`, `web/src/lib/api.ts`, `App.tsx`, `Layout.tsx`, `CHANGELOG.md` и т.п.),
  которые правил и другой агент. Это нормально — просто **в теле коммита в скобках укажи, что это
  совместная работа** (напр. «(включает завершённую работу другого агента: Telegram-вход)»). НЕ изолируй
  через `git stash` / частичный стейджинг. В `CHANGELOG.md` добавляй свои строки, чужие не трогай.

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
- **Subagent/workflow MODEL policy (user rule):** before launching ANY LLM/subagent/workflow that generates, cleans, ranks, formats, or titles pack content, ask the user which model to use. Do not hardcode Haiku/Sonnet/Opus and do not inherit silently when the workflow model choice affects cost/quality. Local parsers/builders/checks can run without asking.
- **Pack generation docs:** detailed source/generation/replenishment instructions for every built-in deck and template-pack live in `docs/pack-generation.md`. Read it before touching `data/anecdotes*`, `data/tips*`, `data/islamic`, `data/christian`, `data/*/videos.json`, `assets/template-packs/*`, or `data/packs/*`.
- **New/manual pack rule:** whenever you create a new built-in deck, prebuilt video pack, template-pack, or live `data/packs/*` pack manually, also add/update `docs/pack-generation.md` with how to create it, how content is generated, how to add new cards/videos later, and how to verify it. Future agents must be able to replenish the pack from docs without reverse-engineering the code.
- **Voiceover rule:** if any generated or rebuilt video needs narration, use ElevenLabs keys already configured in `.env`/`.env.local` (`ELEVENLABS_API_KEYS`, `ELEVENLABS_API_KEY`, or numbered keys). **ElevenLabs is the ONLY TTS** — never use local/offline engines (`edge-tts`, Piper, Coqui, espeak), not even for previews. For word/subtitle timing read ElevenLabs timestamps (the `with-timestamps` endpoint / `alignment` field), not local `whisper`. Never print or commit real keys; logs may show only key index/last4.
- **Добавление чужого/«дружеского» ElevenLabs-ключа (ПРАВИЛО):** прежде чем добавлять любой сторонний ключ в `ELEVENLABS_API_KEYS`, СНАЧАЛА проверь, что он реально генерит — недостаточно `GET /v1/user/subscription` = 200; нужен настоящий TTS-вызов (премейд-голос, напр. Roger `CwhRBWXzGAHq8TQ4Fs17`). Free-tier ключи часто помечены `detected_unusual_activity` (триггер — датацентр/VPN-IP сервера или несколько free-аккаунтов) и отдают **401 на генерации**, хотя подписка «ok» (на `/limits` статус `blocked`). **Если ключ заблокирован / исчерпан / невалиден — НЕ добавляй его** (а если уже добавил — удали из `.env`). Премейд/Default-голоса доступны на free-tier; Voice-Library голоса дают `402 payment_required` (Charlotte и т.п.). Рабочий free-ключ = 10000 символов/мес.
- Frontend uses DaisyUI v5 + Tailwind v4 (`@plugin "daisyui"` in `web/src/index.css`); theme forced light via `data-theme="light"` on `<html>`.
- `lucide-react` has no `Chrome` icon — use `MonitorPlay`/`Globe` instead.
- Pencil templates live in `untitled.pen`; never use Read/Grep on `.pen` files (encrypted) — only the `pencil` MCP tools.
- Backend DB = `node:sqlite` → run with `--experimental-sqlite` (already in `npm run server`). DB file `data/app.db` (gitignored via `data/`). Schema/helpers in `server/db.ts`.
- Templates: 8 textured ones in Pencil (1 Kraft, 2 Slate, 3 Parchment, 4 Marble, 5 Linen, 6 Concrete, 7 Walnut, 8 Newsprint); the first 5 flat ones were deleted. TODO: convert the chosen template(s) into the real HTML render template (`src/render.ts` currently has no template file — `templates/` was removed).
- Each account stores a chosen `template` (UI dropdown on the account page).
- **Редактор шаблонов (эксперимент, виден всем):** vanilla-конструктор карточек в `web/public/template-editor/`
  (`index.html`+`editor.js`+`editor.css`+`renderer.js`, без зависимостей), показывается через `<iframe>` на
  React-странице `web/src/pages/TemplateEditor.tsx` (роут `/editor`, пункт меню в `Layout.tsx` — без `adminOnly`).
  Формат — JSON `{canvas, elements:[killbox|text|image]}` (см. вдохновение `/home/davtian/Downloads/new-feature`).
  Лимит текста на killbox: `fitMin`/`fitMax` (пол/потолок шрифта при авто-подгоне) + `maxChars` (0 = авто-оценка
  `estimateCapacity()` по геометрии и `fitMin`); `renderer.js` обрезает контент сверх лимита «…», шрифт не падает
  ниже `fitMin`. Полностью изолировано от пайплайна; **серверу правок не нужно** — статику отдаёт Vite (dev) и
  `@fastify/static` с prefix `/` (prod). Сборка фронта обязательна: `npm run web:build` (Vite копирует `public/` → `dist/`).
- **Кастомные («ручные») паки (хаб «Паки и карточки» = `/cards`, для всех юзеров):** пак =
  `{id,userId,name,lang,templates[],cards[]}` в `data/packs/<id>.json` (gitignored, изоляция по userId).
  Хранилище+валидация — `src/packs/store.ts`: правила добавления карточек (роли + min/max символов +
  список) **выводятся из шаблона** (`deriveRules`), карточки = `{role→значение}` (то же ест
  `renderTemplateCard`). Роуты — `server/packs-routes.ts` (`registerPacksRoutes(app, db)`): `/api/packs`
  CRUD, `/api/packs/:id/preview?i=` (рендер мостом), `/api/packs/:id/cards/:i/video` (сборка
  `assembleStillVideo` + опц. сохранение в библиотеку канала). UI: `web/src/components/CustomPacks.tsx`
  (создание пака из JSON-шаблона редактора, добавление JSON-карточек, превью, удаление) + Студия
  (`Studio.tsx`: deck=`pack:<id>` → превью/сборка/сохранение через pack-эндпоинты, любой канал).
  `getDeck("pack:*")` → синтетическая дека (`decks.ts`, `isPackDeckId`) — вменяемые метаданные для
  библиотеки/истории/выкладки, ядро (`randomAnecdote/renderAnecdote`) НЕ трогаем. Сид «психология mgs»:
  `src/scripts/seed-psychology-mgs.ts`. **Старые паки read-only, psych-загрузка (`/cards`) цела.**
  **Доступ vs правка (новое):** `canAccess` (админ/владелец/грант) = читать+генерить; `canEdit` (только
  админ/владелец) = менять имя/язык/карточки/удаление. Грант даёт лишь использование — гранчёный пак
  редактировать НЕ может (бэкенд: `addCards`/`deleteCard`/`/lang`/`/name` гейтят `canEdit`; фронт
  `PackDetail` прячет правки и шлёт read-only пометку). Имя/язык владелец правит на `/cards` (роут
  `POST /api/packs/:id/name` + существующий `/lang`). Админ назначает владельца: `PUT
  /api/admin/packs/:id/owner` (`setPackOwner`, новый владелец чистится из grants) → таблица «Владельцы
  паков» в Админке (`Users.tsx`).
  TODO: привязка шаблона к паку прямо из /editor (сейчас вставкой JSON); расписание-автопостинг паков
  идёт через сохранение видео в библиотеку (синтет-дека → generic YouTube-метаданные).
- First generator = **Русские анекдоты (base no-AI parser + current paired pipeline)**: `src/anecdotes/build.ts` parses `Русские анекдоты/anek_djvu.txt` (split on `<|startoftext|>`; drop mat/@-censored/dupes) for baseline analysis/builds. Current dense RU deck also uses `src/scripts/ru-mine.ts` → LLM-workflow keep/theme files in `corpora/ru-gen` (ask user which model first) → `ru-partition.ts` → `ru-pairs-build.ts`, which writes `data/anecdotes/` and one live `data/packs/...` pack. Details: `docs/pack-generation.md`. Runtime picks random via `src/anecdotes/library.ts`.
- Anecdote render: `templates/anecdote.html` + `src/anecdotes/render.ts` — binary-search auto-fit fills the frame and checks BOTH vertical AND horizontal overflow (long words must never clip — that's a hard user requirement). Random light bg from `BACKGROUNDS`. Font ≤72px, line-height grow capped ≤1.9 (no big gaps), title auto-shrinks to one line.
- **IT-дека — плотная:** `src/anecdotes/it-mine.ts` (добыча длинных 330–620 из `corpora/it-*.jsonl`, источник ~152k) → LLM-workflow чистки (модель сначала спросить у пользователя; чистка акцентов `e'→è`, usenet-мусора, mojibake, не-шуток) → `src/anecdotes/build-it-dense.ts` (NSFW-фильтр + дедуп + паки) → `data/anecdotes-it/`. Ещё ~3k в полосе не использовано.
- Studio: `POST /api/generate/anecdote {text?,title?}` → preview PNG served at `/files/...`; frontend `web/src/pages/Studio.tsx`. Anecdote title one-line limit ≈ 28 Cyrillic chars.
- E2E: `node --import tsx src/scripts/e2e.ts` (Playwright via `channel:'chrome'`) drives the live site; needs `npm run server` + `npm run web` up.
- **Лайфхаки (дека `tips`):** 979 русских советов по 10 профессиям, сгенерированы LLM-workflow
  (60 партий → `corpora/tips-gen/<prof>-<n>.json` → `src/anecdotes/build-tips.ts` → `data/tips/titled.json` + `index.json`).
  Свой рендер: `templates/lifehack.html` + `renderLifehack()` в `render.ts` (диспетч по флагу `deck.lifehack`);
  фон = `assets/backgrounds/lifehacks/profession_<key>.jpg`, заголовок в красную плашку, текст Г-образно
  обтекает фигуру через `shape-outside` (без «растягивания» межстрочного — оно ломало низ). `item.profession`
  лежит в titled.json и протянут через `pipeline.ts` + 4 точки `server/index.ts`. Фронт деко-агностичен
  (язык `tips` в `LANGS`, генераторы из `/api/generators`). Перед перегенерацией спроси пользователя,
  какой моделью запускать workflow. Тесты: `src/scripts/render-lifehack-test.ts`, `src/scripts/tips-e2e.ts`.
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
  `islamic-split.mjs` (слайсы) → LLM-workflow выбирает важные id из локальных файлов (не из гугла);
  модель workflow сначала спросить у пользователя →
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
- **Музыка исламской деки (сделано):** НЕ инструментальная — природный эмбиент (ветер/дождь),
  сгенерирован `src/scripts/islamic-gen-audio.mjs` (ffmpeg-static, синтез из шума → 100% свободно, без
  атрибуции) → `assets/audio/islamic/*.mp3`. `pickIslamicAudio()` в `src/video.ts`; `listAudio()`
  исключает `islamic/` из общего (инструментального) пула; в обоих местах сборки `server/index.ts`
  (`buildLibraryVideo` + `/api/generate/anecdote-video`) для `deck.islamic` форсится эмбиент
  (явный «none» = тишина уважается). Викисклад давал только CC BY (атрибуция) — поэтому сгенерировали.
- **Христианская дека (`christian`, «Holy Bible · KJV», admin-only):** 1000 карточек на английском —
  точные стихи **KJV** (public domain), отрывки по 2–3 стиха ~350–400 симв. Пайплайн добычи (всё в
  `corpora/christian/`, gitignored): `christian-fetch-corpus.mjs` (полный KJV из `aruljohn/Bible-kjv`
  через jsDelivr → `pool.json`/`verses.jsonl`) → `christian-build-candidates.mjs` (окна стихов внутри
  главы, банд 320–450, дроп генеалогий/списков; тайлит «богатые» книги + FAMOUS-ссылки из остальных →
  `cand-pool.json` + слайсы + `manifest.json`) → LLM-workflow (модель сначала спросить у пользователя;
  агенты читают слайсы с диска, выбирают лучшие id+theme) → `selection.json` →
  `christian-assemble.mjs` (дедуп по id+overlap, топ-ап до 1000 из остатка по «хорошим» книгам, баланс,
  каноничный порядок) → `data/christian/cards.json` (+ index.json). Карточка = `{type,text,ref,theme,
  book,testament}` (весь объект JSON в `text`, как islamic/psych). Рендер: `templates/christian.html` +
  `src/christian/render.ts`, диспетч по флагу `christian:true` в `decks.ts`; LTR сериф (Liberation Serif),
  кремовый текст на тёмном, скрим, авто-подгон; фоны `assets/backgrounds/christian_protestant_templates/`
  (15 шт.), у каждого своя safe-зона (карта `SAFE` в render.ts — выверена по 15 рендер-сэмплам). `ytMeta`
  christian = читаемый стих + ссылка + (KJV); title = ссылка `ref`. Музыка: **сакральный синт-пад
  орган/хор**, `christian-gen-audio.mjs` (ffmpeg, синтез сумм синусов+ревёрб → 100% свободно) →
  `assets/audio/christian/*.mp3`; `pickChristianAudio()` в `video.ts`; `listAudio()` исключает `christian/`;
  форсится в обоих местах сборки `server/index.ts` для `deck.christian`.
- **Admin-only паки (новое):** флаг `adminOnly?: boolean` у деки (`decks.ts`). `deckAllowed()` →
  `false` для не-админа на adminOnly-деке; `/api/generators` фильтрует их у не-админов; backstop в
  `buildLibraryVideo` тоже. Фронт деко-агностичен: язык в `LANGS` (AccountDetail) и метка в `DECK_RU`
  (Studio) есть, но дропдаун строится из `/api/generators` → не-админ их просто не видит.
- TODO requested: editable Google client-secret path in Settings UI (hardcoded default stays for now). AI/subagent titling of anecdotes (currently generic titles).
- **Auth (Этап 1 готов):** вход в панель обязателен. `server/auth.ts` = scrypt-хэш + токены сессий + политика блокировки; таблицы `users`/`sessions` в `server/db.ts`; гейт всего `/api/*` + роуты `/api/auth/{login,logout,me}` в `server/index.ts`. Юзеры сидятся из `.env`: `ADMIN_USERNAME`/`ADMIN_PASSWORD` (admin) + `SEED_USERS="name:pass,…"` (user), идемпотентно (создаёт, если нет — пароль не перезатирает). Сессия = httpOnly-кука `sid`; блокировка после `AUTH_MAX_ATTEMPTS`(10) на `AUTH_LOCK_MINUTES`(15) мин. Фронт: `web/src/lib/auth.tsx` (AuthProvider/useAuth), `web/src/pages/Login.tsx`, гейт в `App.tsx`, выход в `Layout.tsx`. **Этап 2 TODO:** `user_id` у каналов (изоляция — свои каналы/ключ видит только владелец), свой Google client-secret на юзера, общий пул анекдотов, учёт «использованных» per-user, UI создания юзеров вместо `.env`.
- **Telegram-вход + восстановление пароля (готово, 2026-06-15):** бот **@shotsrecoverybot**. Реализовано
  **бот-диплинком + webhook** (Login Widget заменён — БЕЗ `/setdomain`, без ввода телефона, не зависит от
  виджет-домена). `.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (пусто → `getMe`), **`PUBLIC_BASE_URL=
  https://shareboard.live`** (нужен, чтобы `setWebhook` зарегался на старте). Поток: сайт чеканит токен →
  юзер открывает `t.me/<bot>?start=<token>` и жмёт **Start** → Telegram ПУШИТ апдейт в
  **`POST /api/telegram/webhook`** (секрет-заголовок `sha256(token+":webhook").slice(0,40)`) → бэкенд
  привязывает/логинит; браузер опрашивает крошечный status-роут (2.5с, кап 3 мин — НЕ бесконечно). Бот
  событийный (push), не опрашивается → нагрузка ~0; `telegram_links` авто-GC >1ч. `server/telegram.ts` =
  `sendBotMessage/getBotUsername/setBotWebhook/botStartLink` (+ legacy `verifyTelegramAuth`, не used).
  `server/telegram-routes.ts` = webhook + `/api/auth/telegram/{info,me,unbind}`, `/bind/{start,status}`
  (гейт), `/login/{start,status}` (public), `/recover/{start,complete}`; публичные — в `PUBLIC_API`. БД:
  `telegram_links` + `users.telegram_id/telegram_username` + `password_resets`. UI:
  `web/src/components/TelegramConnect.tsx` («Открыть бота → Start» + опрос; старый `TelegramLoginButton`
  удалён), в `Login.tsx` + `Settings.tsx`; «Забыли пароль?» → код из бота (6 цифр, TTL 10 мин, generic-ответ).
  Регистрации нет → Telegram = доп-ключ к аккаунту (привязка в Настройках). Бэкенд-правки → рестарт
  (`sudo systemctl restart shorts.service`, он же перерегистрирует webhook). Тест крипты:
  `tsx src/scripts/telegram-verify-test.ts`. Заодно «Движок генерации»/«Рендерер» переехали из Настроек
  на `/system` (видит только админ).

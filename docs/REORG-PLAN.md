# План реорганизации репозитория (SOLID, без поломки сайта)

> Источник: мультиагентный аудит 2026-06-22 (6 зон + страж ограничений + синтез).
> Цель: (а) агенту/человеку легко ориентироваться, (б) распилить монолиты по SRP — **не сломав
> живой `:8080`**. Делать строго в порядке риск→ценность; каждая фаза — отдельный коммит, обратимый.

## Что нашли (карта проблем)

| Файл / зона | Строк | Проблема |
|---|---|---|
| `server/index.ts` | **2762** | 72 роута в 11 доменах + boot + миграции + auth + ~40 хелперов + shutdown в одном файле |
| `server/db.ts` | **1886** | god-object: фабрика `openDb()` с ~90 методами на ~10 доменов |
| `web/src/pages/Statistics.tsx` | 1512 | страница + 13 под-компонентов + 125-стр. редьюсер `buildOverview` + 10 форматтеров |
| `web/src/pages/AccountDetail.tsx` | 1356 | ~30 useState + 9 effect + 12 хендлеров + 2 модалки в одном компоненте |
| `web/src/lib/api.ts` | 1033 | один плоский `apiClient` на ~90 эндпоинтов / 12 доменов + ~50 inline-типов |
| `web/src/pages/AdminAnalytics.tsx` | 846 | экспортит `SystemOverview` (вкладка внутри Statistics) — имя вводит в заблуждение |
| `web/src/components/Layout.tsx` | 708 | внутри — самостоятельная фича `NotificationDropdown` (~225 стр.) |
| корень репо | — | ~18 одноразовых артефактов (5 `.py`, 6 `strike-audit-*`, `temp/ images/ .playwright-mcp/`) |

**Реальный баг (не косметика):** папка `Генератор мемов/` (**214 МБ** бинарей) **НЕ в `.gitignore`**,
хотя сосед `Русские анекдоты/` — в нём. Кодом не читается. `git add -A` (его же рекомендует CLAUDE.md)
затащит 214 МБ в историю. **Чинится первой строкой.**

## Железное правило проверки — гейт после КАЖДОЙ фазы

`tsx` не делает hot-reload → недоделанный переезд **не доходит** до `:8080` до рестарта; рестарт делает
только владелец. Поэтому «работает» = **доказываем** статикой + изолированным прогоном, не предполагаем.

0. **Baseline до правок:** инвентарь эндпоинтов + ответы + скриншоты всех страниц — для diff «до/после».
1. **Статика:** `npm run typecheck` (= `tsc --noEmit`, тот же tsconfig — ловит битый relative-путь так же,
   как tsx на старте) + `npm run web:build` (= `tsc -b && vite build`; **только он** ловит
   `verbatimModuleSyntax`/`noUnusedLocals` в проде) + `npm test`.
2. **Boot-smoke на изолированном `:8099`** (копия `data/app.db`, scheduler `enabled=0`): `GET /api/health`
   → `{ok:true}`, затем по одному эндпоинту из **каждой** перенесённой группы — это ловит потерянный
   `register*()` (тихий 404, который typecheck НЕ видит).
3. **UI-регрессия:** Playwright проходит каждую страницу меню, логин через минченную сессию в копии БД,
   проверка «нет error-boundary + ключевые действия отвечают», diff с baseline.
4. **Гейт:** один домен/один коммит; не двигаемся дальше, пока фаза не зелёная по всем слоям. Живой
   `:8080` и боевую `data/app.db` не трогаем; рестарт — `sudo systemctl restart shorts.service`.

## Инварианты безопасности

- **Публичный API двух god-файлов остаётся byte-identical:**
  - `index.ts` остаётся entrypoint (захардкожен в `package.json`), получает лишь столбец вызовов
    `registerXRoutes(app, db, deps)`. Паттерн уже доказан 4× (`packs-routes.ts`, `telegram-routes.ts`,
    `psych-cards-routes.ts`, `password-routes.ts`).
  - `db.ts` остаётся файлом `server/db.ts` (импорты с явным `.ts`) и становится тонким **barrel**:
    `const store = { db, ...accountMethods(db), ...videoMethods(db), … }` — все ~90 методов на ОДНОМ
    объекте, чтобы ~13 внутренних `this.`-вызовов работали; `export type Db = ReturnType<typeof openDb>`
    не меняется. Методы — **object-literal shorthand, НЕ стрелки** (стрелка замораживает `this`).
- **Backend-импорты** — relative + явный `.ts`/`.json`. При переезде файла: пересчитать `../` глубину у
  него и у всех, кто его импортит, и `git mv` соседний `.test.ts`. (Аномалия: `server/stats.ts:2`
  `from "./youtube"` без `.ts` — нормализовать.)
- **Глобальный auth-hook гейтит по PATH, не по файлу** → перенос роута в модуль сохраняет защиту
  автоматически; но **публичный** роут надо добавить в `PUBLIC_API` set, иначе 401.
- **3 stateful-синглтона = ровно один экземпляр, инжектить через `deps`:** `notificationStreams` Set
  (дублирование → колокольчик молча перестаёт обновляться), `buildLibraryVideo` (дублирование → обход
  фикса двойного списания/двойной выгрузки), `galleryChain` + preview/video счётчики.
- **Вся схема БД** — в одном упорядоченном `applySchema(db)` (CREATE → ALTER+backfill → INDEX → legacy-OAuth
  миграция → user_version v2), порядок не менять; `addColumn` глотает «duplicate column» для идемпотентности.
- **Frontend:** Vite резолвит без расширений (147/148) — НЕ копировать backend-правило «добавь `.ts`».
  Страница = leaf, импортится только из `App.tsx` дефолт-экспортом → папка-с-`index.tsx` сохраняет импорт.

## DO-NOT-TOUCH (читается кодом по фикс-пути или особое)

- `server/index.ts` и `server/db.ts` **как файлы** не двигать — вынимать СОДЕРЖИМОЕ.
- `data/**`, `assets/**`, `templates/*.html`, `web/dist`, `.env`, `corpora/**` — таргеты хардкод-литералов
  (`decks.ts` dir/source, `render.ts` шаблоны, `index.ts` static-roots, `config.ts` .env).
- `data/quotes-de-{1,2,3}` — **не дубликаты**, а живые tracked-деки (`decks.ts`).
- `Русские анекдоты/anek_djvu.txt` — читается `build.ts` по литералу, уже gitignored.
- НЕ создавать новый top-level код-каталог (`lib/`, `core/` в корне) под backend — он не в tsconfig
  `include ['src/**','server/**']` → молча выпадет из typecheck+тестов. Перемещения держать под `src/**`/`server/**`.
- `client_secret_*.json` — не читать (security-правило). `web/src/locales/{ru,en}.ts` — оставить (таблицы переводов).

---

## Фаза 1 — нулевой риск: чистка корня, фикс gitignore, индексация доков

Ничего из этого не читается кодом → нулевой runtime-риск.

- [ ] **Фикс бага:** добавить `Генератор мемов/` в `.gitignore` рядом с `Русские анекдоты/`.
- [ ] `mkdir audits/`, перенести 6 `strike-audit-*` туда; в `.gitignore` заменить `strike-audit-*.{md,json}` → `audits/`.
- [ ] Удалить мёртвое: 5 `process_anecdotes*.py`, каталоги `images/` `temp/` `.playwright-mcp/` (все ignored, ~19 МБ).
- [ ] Прибрать `data/`-корень (НЕ трогая деки и `data/app.db`/`data/output`): scratch-БД
      `app.db.bak-codex-e2e-admin-del`, `e2e-account-ui.db`, `shorts.db`, `server.log`; пустой tracked `data/output-e2e/`.
- [ ] **Индексировать CLAUDE.md** (контент не урезать): 117-строчный блок «Notes for myself» → `###`-подзаголовки
      (Decks / Render gotchas / Auth-Telegram / Infra & restart / Pack system) + короткий TOC; редкие
      infra-runbook'и (Caddy, регламент рестарта `:8080`) вынести в `docs/ops-runbook.md` со ссылкой.
- [ ] Разбить `docs/pack-generation.md` (79 КБ, 30 секций) → `docs/packs/<deck>.md` + `README.md`-индекс +
      `_conventions.md`; починить мёртвую ссылку `temp/meme-recheck/catalog.json`.
- [ ] Расширить `README.md` (263 Б) до тонкого онбординг-указателя (что это, quickstart, карта `src/server/web/docs`, ссылки).

**Verify:** `git add -A --dry-run` больше не стейджит `Генератор мемов/`; деки/`app.db`/`client_secret` не тронуты; сайт не трогаем.

## Фаза 2 — низкий риск: фронт (api-barrel, god-страницы → папки, общие форматтеры)

Только `web/src/**` → **рестарт сервера НЕ нужен**, деплой = `npm run web:build` + Ctrl+F5.

- [ ] **Первым** — `lib/api.ts` → `lib/api/` (`http.ts` ядро + `accounts/genQueue/packs/stats/admin/auth/notifications.ts`),
      `lib/api/index.ts` = barrel (`export const apiClient = { ...authApi, ... }`). Путь `../lib/api` сохранить →
      все 23 импортёра byte-identical. Каждый ре-экспорт типа — `export type`; не импортить неиспользуемый тип.
- [ ] `lib/statsFormat.ts` — общие форматтеры; удалить дубли в `Statistics.tsx` и `AdminAnalytics.tsx`; `parseUtc`/`compactNumber` брать из `lib/format.ts`.
- [ ] `Statistics.tsx` → `pages/Statistics/`: `index.tsx` (оболочка) + `overview.ts` (чистый `buildOverview`+типы, юнит-тестируемо) + `StatsOverview.tsx` + `ChannelCard.tsx`.
- [ ] `AdminAnalytics.tsx` → `pages/Statistics/SystemOverview.tsx` (+`adminCharts.tsx`+`adminTables.tsx`), правильное имя.
- [ ] `AccountDetail.tsx` → `pages/AccountDetail/`: `useAccountDetail.ts` (всё состояние/эффекты/хендлеры одним блоком — порядок эффектов не менять), `schedule.ts`, `sources.ts`, `VideoPreviewModal.tsx`, `AvatarPickerModal.tsx`, `index.tsx`. Старый файл рядом с папкой НЕ оставлять.
- [ ] `Layout.tsx` → вынести `components/layout/`: `NotificationDropdown.tsx`, `navConfig.ts`, `widgets.tsx`.

**Verify:** `npm run web:build` зелёный (реальный гейт); Ctrl+F5 на `/statistics`, `/accounts/:id`, вкладке «Сводка», колокольчике; network-tab без изменений тайминга.

## Фаза 3 — средний риск: перегруппировка `server/` (routes/ services/ infra/)

Импорт-граф уже строгий DAG routes→services→infra (циклов нет). Риск средний только из-за runtime-резолва путей.

- [ ] Нормализовать `server/stats.ts:2` → `"./youtube.ts"`.
- [ ] **Оставить `index.ts` и `db.ts` в корне `server/`** (entrypoint и data-hub; их же импортят 3 e2e-скрипта).
- [ ] `server/routes/` ← 4 существующих `*-routes.ts`.
- [ ] `server/services/` ← `youtube/` (youtube, youtube-analytics, stats, stats-refresh), `telegram/` (telegram, telegram-stats), `analytics/` (admin-analytics, user-analytics), `gen/` (pack-gen, pack-audio, fact-gen, gen-queue).
- [ ] `server/infra/` ← auth, scheduler, shutdown, metrics, rate-limits, account-limits, output-access, media, config.
- [ ] По playbook на КАЖДЫЙ файл: `git mv` → починить outbound `.ts`-глубину → починить все inbound (в т.ч. ~25 в `index.ts`) → `git mv` соседний `.test.ts`.
- [ ] **Главный риск:** 5 `src/scripts/{library-e2e,account-ui-e2e,avatar-e2e,telegram-verify-test,ru-rerender-broken}.ts` импортят `../../server/{config,db,auth,telegram}.ts`. db/config/auth остаются в корне → остаётся только `telegram.ts` (→`services/telegram/`): репойнтить в ТОМ ЖЕ коммите (или тонкий re-export shim).
- [ ] `server/ARCHITECTURE.md`: «routes/ = только Fastify register*; services/ = доменная логика/внешние API; infra/ = cross-cutting. Зависимости вниз: routes→services→infra».

**Verify:** `npm run typecheck` + `npm test` зелёные; `grep -rn` каждого basename по `server/ src/ web/ scripts/ docs/`; владелец рестартит → `/api/health` `{ok:true}`, лог без stack trace.

## Фаза 4 — высокая ценность: распил `index.ts` → роут-модули, `db.ts` → barrel

Главный приз SRP. Публичная поверхность не меняется. Шаги — по одному коммиту, в порядке риска:

- [ ] **A (риск none):** вынести ЧИСТЫЕ хелперы → `output-files.ts`, `youtube-errors.ts`, `oauth-clients-view.ts`, `analytics-range.ts`, и весь блок ElevenLabs (575-710) → `server/elevenlabs-limits.ts`. Минус ~350 строк, диффы тел 1:1.
- [ ] **B (lynchpin, low):** `server/deck-access.ts` = `makeDeckAccess(db)` (deckAllowed, builtinDeckVisibleForUser, validateAccountSourceDeck, …). Самое переиспользуемое правило (9 групп + воркер). Перенести ВЕРБАТИМ — правка логики молча меняет права на паки.
- [ ] **C (реальные hazard'ы, ДО их роутов):** `server/notify-stream.ts` = один `makeNotifier(db)` (Set + emit/notify*); `server/library-build.ts` = `buildLibraryVideo` (общий для /api/videos, /batch и воркера — сохраняет фикс claim-race). `galleryChain`+счётчики оставить локально в studio-модуле.
- [ ] **D (security):** `server/http/auth-session.ts` (cookie-билдеры, validSessionUser, requireAdmin, uid, `PUBLIC_API`, `makeAuthGate(db)`) + `server/routes/auth.ts`. `COOKIE_SECURE` и `PUBLIC_API` — byte-identical (дрейф = разлогинило всех / открыло гейт / сломало OAuth-callback).
- [ ] **E:** оставшиеся 10 доменов → `server/routes/*.ts` (files, settings-keys, youtube-oauth [callback в PUBLIC_API!], accounts, stats, notifications, videos, gen-queue, studio-gallery, admin-users-decks). `index.ts` → ~300 строк: boot + plugins/static/SPA + auth-gate + setErrorHandler + столбец `register*()` + listen/scheduler/shutdown.
- [ ] **db PR1 (pure):** `server/db/types.ts` + `server/db/mappers.ts` + `server/db/schema.ts` (один `applySchema(db)`, порядок фаз сохранён).
- [ ] **db PR2 (assembler):** 8 доменных фабрик методов; `server/db.ts` → ~60 строк barrel со spread-merge на один объект; ре-экспорт всех интерфейсов/констант/`parseCredMeta`/`MAX_OAUTH_CLIENTS_PER_USER`.

**Verify (после каждого коммита):** `npm run typecheck` + `npm test` (3 in-memory `openDb`-теста — гарант публичной поверхности БД); **route-count = 72** (`grep -cE 'app\.(get|post|put|patch|delete)\('`), никаких дублей путей; `grep -rln 'notificationStreams|buildLibraryVideo'` = по одному файлу; boot на копии БД; владелец рестартит → `/api/health`, non-admin `/api/generators` (права не изменились), login+`/api/auth/me`+неаутентиф. `/api/youtube/callback`.

## Фаза 5 — средний риск: общий render-core + граница core-vs-scripts в `src/`

6 per-deck render-модулей — реальный copy-paste (вербатим-равные Chrome-проба, bg-инлайнер, `esc()`, SAFE-карты, 4 разошедшихся копии puppeteer-цикла). Риск средний: их дёргает живой диспетчер `anecdotes/render.ts`, нужна per-deck визуальная QA.

- [ ] **Low:** удалить мёртвый «N facts» pipeline (`fillTemplate/renderToImage/ShortContent/ShortTheme` + ссылка на отсутствующий `templates/short.html`) из `src/render.ts`; живой `chromePath()` → `src/core/chrome.ts` (тонкий re-export на релиз).
- [ ] **Low:** перенести CLI-билдеры из `src/anecdotes/` в `src/scripts/` (build-de/fr/it/it-dense/tips/tips-de, apply-titles/format, pair-de, it-mine; `build.ts`: общие `SRC/BLOCK` → `src/anecdotes/source.ts`). Обновить команды в `docs/packs/`.
- [ ] **Low:** `src/template/render.ts` → `validate.ts` (~150 стр. валидатор недоверенного ввода) + `render.ts` (barrel-реэкспорт валидатора).
- [ ] **Higher:** `src/core/render/` (`chrome.ts`/`capture.ts`=канонический `captureCard`/`assets.ts`/`html.ts`); per-deck модули оставляют ТОЛЬКО данные (SAFE-карта, форма cards.json, путь шаблона, refLine/caption) и зовут core. Сигнатуры `buildXHtml`/`pickXBg` — byte-identical. По одной деке.
- [ ] Распилить `src/anecdotes/decks.ts` (445): реестр оставить, `ytMeta()`/`psychDescription()`+JSON-unwrap → `src/anecdotes/yt-meta.ts`.
- [ ] **Осторожно** с `__dirname`-якорными рендерами (`src/render.ts`, `anecdotes/render.ts ../../templates/*.html`, `template/render.ts ../../web/public/...`): смена ГЛУБИНЫ молча ломает загрузку шаблона в рантайме рендера. Безопаснее — перевести на `process.cwd()`-якорь. НИКОГДА не двигать core-код В `src/scripts/**`.

**Verify:** `npm run typecheck`+`npm test`; **per-deck визуальная QA до/после** (RU paper safe-zone, арабский RTL — без чёрного кадра, KJV serif, meme caption, psych) на изолированном инстансе; сигнатуры `buildXHtml`/`pickXBg` не изменились.

---

## Рекомендованный порядок и принцип

Делать **1 → 2 → 3 → 4 → 5**. Ценность концентрируется в Фазе 4, но безопасность — в том, чтобы сначала
посадить 1-3 и наработать «мышечную память» гейта. Каждая фаза самодостаточна, обратима и проверяется
изолированно до любого рестарта живого `:8080`.

# Генерация и пополнение паков

Этот документ нужен будущим агентам как рабочая инструкция: где лежит каждый пак, откуда берется
контент, когда нужен LLM-workflow, когда достаточно локального скрипта, и чем проверить результат.

## Главное правило про модель workflow

Перед любым LLM/subagent/workflow, который генерирует, чистит, ранжирует или озаглавливает контент,
сначала спроси пользователя, какой моделью запускать workflow. Не выбирай Haiku/Sonnet/Opus молча.

Вопрос должен быть коротким: "Какой моделью запускать workflow для этого пака?". Если пользователь
не уточнил, не запускай LLM-workflow. Локальные парсеры, сборщики, рендер-тесты и проверки JSON можно
запускать без такого вопроса.

Для интернет-источников отдельно проверяй лицензию и происхождение данных перед скачиванием или
пополнением. Не называй источник свободным только потому, что файл доступен в сети.

## Обязательное правило для новых ручных паков

Если агент вручную создает новый пак любого типа, он обязан сразу добавить сюда инструкцию по этому
паку. Это касается:

- встроенной деки в `src/anecdotes/decks.ts`;
- prebuilt video pack с `videos.json` и MP4;
- template-pack в `assets/template-packs/*`;
- живого пользовательского пака в `data/packs/*.json`;
- разового пака, который потом пользователь может захотеть пополнить через агента.

Минимум, который нужно записать:

- где лежит исходник и готовый результат;
- как создать пак с нуля;
- как сгенерировать новые карточки/видео;
- нужна ли LLM-модель и где перед запуском спросить пользователя;
- как добавить новые элементы к существующему паку без потери старых;
- как проверить счетчики, файлы, рендер/preview и отсутствие дублей;
- нужен ли серверный перезапуск.

Не оставляй новый ручной пак только в коде или `data/packs`: без инструкции будущий агент не будет
знать, как его безопасно пополнить.

## Быстрая карта паков

| Пак / deck | Где результат | Как появляется контент | LLM нужен |
|---|---|---|---|
| `ru` Русские анекдоты | `data/anecdotes/` | локальный текст `Русские анекдоты/anek_djvu.txt`; текущая плотная дека дополнена pipeline пар коротких шуток | да, если отбирать/тематизировать пары |
| `de` Deutsche Witze | `data/anecdotes-de/` | локальный SQL-корпус `corpora/witze.sql` -> фильтр/дедуп | нет для сборки; нужен только workflow заголовков |
| `fr` Blagues françaises | `data/anecdotes-fr/` | локальный JSON `corpora/blagues.json` -> safe categories | нет для сборки; нужен только workflow заголовков |
| `it` Barzellette Italiane | `data/anecdotes-it/` | текущий плотный вариант из `corpora/it-gen/clean-*.json` | да, для чистки кандидатов; сборка локальная |
| `tips` Народные лайфхаки | `data/tips/` | LLM-батчи `corpora/tips-gen/*.json` -> локальная сборка | да, для новых батчей |
| `tips-de` Deutsche Lifehacks | `data/tips-de/` | LLM-батчи `corpora/tips-de-gen/*.json` -> локальная сборка | да, для новых батчей |
| `psych` Psychologie (DE) | `data/psych/cards.json` | структурные карточки по `docs/psych-cards-standard.md` | обычно да, но можно загрузить вручную |
| `islamic` آيات وأذكار | `data/islamic/cards.json` | точные интернет-корпусы -> локальные slices -> workflow выбора id -> assemble | да, только для выбора id/theme |
| `christian` Holy Bible KJV | `data/christian/cards.json` | KJV public domain -> candidates/slices -> workflow выбора id -> assemble | да, только для выбора id/theme |
| `fact-en` Interesting Facts | `data/fact-videos/videos.json` + `assets/fact-videos/` | готовые MP4 | не в рантайме; новые ролики собираются вне этого конвейера |
| `quotes-de` Politiker-Zitate | `data/quotes-de/videos.json` + `assets/fact-videos/` | готовые MP4 | не в рантайме |
| `space` Space | `data/space/videos.json` + `assets/fact-videos/space/` | готовые MP4 | не в рантайме |
| `The Mind Edge` template-pack | `assets/template-packs/the-mind-edge/` -> `data/packs/` seed | LLM-батчи -> `cards.json`, шаблоны из кода | да, для новых карточек |
| `psychology-mgs` template-pack | `assets/template-packs/psychology-mgs/` -> `data/packs/` seed | карточки + 40 шаблонов | зависит от источника новых карточек |
| `Curiosaurs English Facts` template-pack | `assets/template-packs/curiosaurs-english/` -> `data/packs/` seed | локальный набор kid-safe facts + PNG-шаблоны | нет |

`data/packs/*.json` - это живые пользовательские паки из страницы "Карточки". Они gitignored и
пополняются через UI/API или seed-скрипты. Встроенные деки (`data/anecdotes*`, `data/tips*`,
`data/islamic`, `data/christian`, `data/*/videos.json`) работают через статический реестр
`src/anecdotes/decks.ts`.

## Общие проверки после любого пополнения

1. Проверь JSON и счетчики:
   ```bash
   node --input-type=module -e 'import fs from "node:fs"; for (const p of process.argv.slice(1)) { const v=JSON.parse(fs.readFileSync(p,"utf8")); console.log(p, Array.isArray(v) ? v.length : v); }' data/anecdotes/index.json
   ```
2. Для встроенных дек проверь счетчики осознанно:
   - `cards.json` / `videos.json` обычно должны совпадать с `index.json.total`;
   - `titled.json` может быть меньше `index.json.total`, если не весь сырой корпус уже озаглавлен
     (`de` так и работает). Runtime берет `titled.json`, а при его отсутствии падает обратно на raw
     `pack-*.json`.
3. Для текстовых дек запусти анализ без `--build`, если скрипт его поддерживает. Это безопасный dry-run.
4. Для template-pack запусти его QA-рендер или seed-скрипт без дублирования, если он идемпотентный.
5. После правок `src/**` или `server/**` серверу нужен перезапуск, но не перезапускай общий сервер без
   разрешения пользователя. Чистые изменения `docs/**` перезапуска не требуют.

## Русские анекдоты (`ru`)

Источник: `Русские анекдоты/anek_djvu.txt`. Базовый сборщик `src/anecdotes/build.ts` режет файл по
`<|startoftext|>`, нормализует пробелы, удаляет дубли, мат, `@`, цензурные артефакты и может писать
`data/anecdotes/pack-*.json` + `index.json`.

Важно: текущая плотная RU-дека не восстанавливается одним `build.ts`. Она включает pipeline пар коротких
анекдотов из `corpora/ru-gen`: короткие шутки майнятся, workflow выбирает/тематизирует лучшие, затем
`ru-pairs-build.ts` собирает две шутки в одну карточку.

Для анализа базового корпуса без перезаписи:

```bash
ANEK_MIN=300 ANEK_MAX=425 node --import tsx src/anecdotes/build.ts
```

Базовая пересборка старого типа, если действительно нужна:

```bash
ANEK_MIN=300 ANEK_MAX=425 node --import tsx src/anecdotes/build.ts --build
```

Для текущего pipeline пар:

1. Сгенерировать кандидаты:
   ```bash
   node --import tsx src/scripts/ru-mine.ts
   ```
2. Спросить пользователя модель workflow.
3. Workflow читает `corpora/ru-gen/cand-*.json` и пишет `keep-*.json` с `{id,theme}`.
4. Разделить отобранный пул:
   ```bash
   FRIEND_N=820 node --import tsx src/scripts/ru-partition.ts
   ```
5. Собрать пары:
   ```bash
   node --import tsx src/scripts/ru-pairs-build.ts
   ```
   Этот скрипт пишет сразу в `data/anecdotes/` и в конкретный пользовательский пак
   `data/packs/анекдоты-ру-впн-mqe5ovw1.json`, а также создает `.bak`. Запускай его только когда это
   точно нужно.
6. Визуальная проверка новых пар:
   ```bash
   node --import tsx src/scripts/ru-pairs-verify.ts
   ```

Если нужны заголовки/переформатирование, сначала спроси пользователя модель workflow. Workflow должен
положить результаты в `data/anecdotes/_fmt-*.json`, затем применить:

```bash
node --import tsx src/anecdotes/apply-format.ts
```

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; const idx=JSON.parse(fs.readFileSync("data/anecdotes/index.json","utf8")); const titled=JSON.parse(fs.readFileSync("data/anecdotes/titled.json","utf8")); console.log({indexTotal:idx.total,titled:titled.length,range:idx.range});'
```

## Немецкие анекдоты (`de`)

Источник: `corpora/witze.sql`, SQL dump Schlechtewitzefront. Перед обновлением корпуса проверь лицензию
источника заново. Сборщик: `src/anecdotes/build-de.ts`.

Анализ:

```bash
node --import tsx src/anecdotes/build-de.ts
```

Пересборка:

```bash
ANEK_MIN=150 ANEK_MAX=400 ANEK_CAP=10000 node --import tsx src/anecdotes/build-de.ts --build
```

Заголовки не делает локальный парсер. Если нужны новые заголовки, спроси пользователя модель workflow,
сгенерируй `_titles-*.json` рядом с `pack-*.json`, затем:

```bash
node --import tsx src/anecdotes/apply-titles.ts
```

## Французские анекдоты (`fr`)

Источник: `corpora/blagues.json`, Blagues-API JSON. Сборщик оставляет только safe categories
`global` и `dev`.

Анализ:

```bash
node --import tsx src/anecdotes/build-fr.ts
```

Пересборка:

```bash
ANEK_MIN=60 ANEK_MAX=400 node --import tsx src/anecdotes/build-fr.ts --build
```

Заголовки: тот же порядок, что у `de`: спросить модель workflow -> `_titles-*.json` ->
`node --import tsx src/anecdotes/apply-titles.ts`.

## Итальянские анекдоты (`it`)

Есть два пути:

- быстрый корпусный парсер `src/anecdotes/build-it.ts` читает `corpora/it-barzellette.jsonl` и
  `corpora/it-umorismo.jsonl`;
- текущая плотная дека строится из LLM-очищенных файлов `corpora/it-gen/clean-*.json` через
  `src/anecdotes/build-it-dense.ts`.

Для текущего качества используй плотный путь. Сначала спроси пользователя модель workflow для чистки
кандидатов. Workflow должен читать локальные кандидаты, чистить мусор Usenet/mojibake/не-шутки и писать
массивы `{title,text}` в `corpora/it-gen/clean-<n>.json`.

Сборка после workflow:

```bash
node --import tsx src/anecdotes/build-it-dense.ts
```

Если нужен только анализ сырого корпуса:

```bash
node --import tsx src/anecdotes/build-it.ts
```

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; const idx=JSON.parse(fs.readFileSync("data/anecdotes-it/index.json","utf8")); const titled=JSON.parse(fs.readFileSync("data/anecdotes-it/titled.json","utf8")); console.log({indexTotal:idx.total,titled:titled.length,range:idx.range});'
```

## Лайфхаки (`tips`, `tips-de`)

Контент генерируется LLM-batches в `corpora/tips-gen/` и `corpora/tips-de-gen/`, затем локально
валидируется, дедупится и складывается в `data/tips*/titled.json`.

Перед генерацией новых батчей спроси пользователя модель workflow. Имена файлов должны быть
`<profession>-<n>.json`, где profession - один из:

```text
chef, mechanic, firefighter, lawyer, accountant, teacher, programmer, builder, police, hairdresser
```

Формат каждого файла:

```json
[
  { "title": "Kurzer Titel", "text": "300-500 Zeichen полезного совета..." }
]
```

Сборка RU:

```bash
node --import tsx src/anecdotes/build-tips.ts
```

Сборка DE:

```bash
node --import tsx src/anecdotes/build-tips-de.ts
```

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; for (const d of ["data/tips","data/tips-de"]) { const idx=JSON.parse(fs.readFileSync(`${d}/index.json`,"utf8")); const titled=JSON.parse(fs.readFileSync(`${d}/titled.json`,"utf8")); console.log(d,{indexTotal:idx.total,titled:titled.length,byProfession:idx.byProfession}); }'
```

## Psychologie (`psych`)

Это встроенная структурная дека, не обычный `pack-*.json`. Источник правды по формату:
`docs/psych-cards-standard.md` и `src/psych/schema.ts`.

Пополнение без правок кода:

1. Сгенерировать или написать JSON по стандарту.
2. Открыть "Карточки".
3. Вставить JSON.
4. Нажать "Проверить и загрузить".

Сервер валидирует и дописывает в `data/psych/cards.json` с `source:"upload"`. Кэш сбрасывается без
перезапуска. Если используешь LLM для генерации карточек, сначала спроси пользователя модель workflow.

Локальная проверка схемы:

```bash
node --test --import tsx src/psych/cards-store.ts
```

Если нужен программный тест без UI, лучше добавить маленький `node --import tsx` скрипт, который вызывает
`validateBatch()` из `src/psych/cards-store.ts`, но не вызывает `appendCards()`.

## Islamic (`islamic`)

Контент точный: арабский текст берется из источников, а workflow выбирает только id/theme. Нельзя
переписывать арабский текст моделью.

Пайплайн:

1. Скачивание корпусов в `corpora/islamic/`:
   ```bash
   node src/scripts/islamic-fetch-corpus.mjs
   ```
2. Разбиение на slices:
   ```bash
   node src/scripts/islamic-split.mjs
   ```
3. Спросить пользователя модель workflow.
4. Запустить workflow: каждый агент читает свой `corpora/islamic/slices/*.jsonl` и пишет выбранные
   строки JSONL `{ "id": "...", "theme": "..." }` в `corpora/islamic/sel/<slice>.jsonl`.
5. Собрать точный финальный пак:
   ```bash
   node src/scripts/islamic-assemble.mjs
   ```

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; const cards=JSON.parse(fs.readFileSync("data/islamic/cards.json","utf8")); const idx=JSON.parse(fs.readFileSync("data/islamic/index.json","utf8")); console.log({cards:cards.length,indexTotal:idx.total,sample:Object.keys(cards[0]||{})});'
```

## Christian (`christian`)

Контент точный: KJV public domain. Workflow выбирает id/theme из локальных candidates, финальный текст
подставляется сборщиком. Не переписывай стих моделью.

Пайплайн:

1. Скачивание KJV:
   ```bash
   node src/scripts/christian-fetch-corpus.mjs
   ```
2. Построение passage candidates и slices:
   ```bash
   node src/scripts/christian-build-candidates.mjs
   ```
3. Спросить пользователя модель workflow.
4. Workflow читает `corpora/christian/slices/*.jsonl` и формирует `corpora/christian/selection.json`
   как массив `{ "id": "...", "theme": "..." }`.
5. Собрать финальный пак:
   ```bash
   node src/scripts/christian-assemble.mjs
   ```

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; const cards=JSON.parse(fs.readFileSync("data/christian/cards.json","utf8")); const idx=JSON.parse(fs.readFileSync("data/christian/index.json","utf8")); console.log({cards:cards.length,indexTotal:idx.total,range:idx.range,sample:Object.keys(cards[0]||{})});'
```

## Pre-built video packs (`fact-en`, `quotes-de`, `space`)

Эти деки не рендерят карточку. Runtime выбирает готовый MP4 из `assets/fact-videos/`, копирует его в
библиотеку и помечает использованным. Контракт реализован в `server/fact-gen.ts`.

Как это работает в коде:

- в `src/anecdotes/decks.ts` у деки стоит `preFact: true`;
- `src/anecdotes/library.ts` читает `<deck.dir>/videos.json` свежим при каждом обращении, без cache;
- `server/index.ts` для batch/queue вместо `buildLibraryVideo()` вызывает `buildFactLibraryVideo()`;
- `server/fact-gen.ts` копирует MP4 в библиотеку, делает poster-frame через ffmpeg best-effort и
  отмечает `anecdoteKey(text)` использованным для пользователя;
- `/api/fact/random?deck=space` отдает случайный preview из `/fact-videos/<file>` и не помечает его
  использованным.

Текущий `space`:

- реестр: `src/anecdotes/decks.ts`, deck id `space`, `dir: "data/space"`, `preFact: true`;
- манифест: `data/space/videos.json`;
- файлы: `assets/fact-videos/space/*.mp4`;
- сейчас там 70 MP4;
- `data/space/index.json` сейчас нет, и это нормально: runtime берет количество из `videos.json`;
- дека `adminOnly: true`, поэтому обычные пользователи ее не видят, пока правило доступа не изменено.

### Space montage pack / admin clip demos

`space` сейчас пополняется не вручную копированием одного MP4, а через локальный free-stack монтажный
workflow:

- исходные pack specs: `temp/clip-demo/work/pack-space*.json`;
- последний добавочный spec на 20 новых роликов: `temp/clip-demo/work/pack-space-7.json`;
- генератор: `temp/clip-demo/buildpack.mjs`;
- монтаж: `temp/clip-demo/montage.mjs`;
- локальные source videos: `temp/clip-demo/src/*.mp4`;
- готовая админ-галерея: `data/output/admin-demos/<id>.mp4`, `<id>.jpg`, `manifest.json`;
- канал-selectable deck: `assets/fact-videos/space/<id>.mp4` и `data/space/videos.json`;
- страница просмотра: `/clip-demos` (`web/src/pages/ClipDemos.tsx`).

Как создать новый добавочный набор:

1. Скопировать стиль из `temp/clip-demo/work/pack-space-7.json`.
2. Использовать только новые `id`, которых нет в `data/output/admin-demos/manifest.json`.
3. Каждый item описывать как `{id,title,theme,src,transcript,poster,segments}`.
4. `clip` segments должны попадать в длительность `src`.
5. `vo` segments используют `edge-tts` и `whisper-ctranslate2`, API-ключи не нужны; если текст VO
   пишет LLM/workflow, сначала спроси пользователя, какую модель использовать.
6. Для исходников с пустым transcript (`work/milkyway.json`, `work/moon.json`, `work/sun.json`) можно
   использовать короткие `clip` segments без исходных субтитров и `vo` segments с новым narration.
7. Держать итоговые ролики в пределах Shorts-формата: после сборки проверить, что `dur` не больше
   `1:00`; если получилось больше, укоротить timecodes и пересобрать этот `id`.

Сборка полного добавочного spec:

```bash
cd temp/clip-demo
node buildpack.mjs work/pack-space-7.json
```

`buildpack.mjs` после каждого ролика:

- генерирует VO через `edge-tts`;
- делает word timestamps через `uvx whisper-ctranslate2`;
- собирает MP4 через `ffmpeg`;
- копирует MP4/JPG в `data/output/admin-demos`;
- добавляет запись в `manifest.json`;
- сохраняет `createdAt` при пересборке существующего `id` и обновляет `updatedAt`;
- если `pack.id === "space"`, в конце вызывает `sync-space-deck.mjs`, который копирует MP4 в
  `assets/fact-videos/space` и полностью пересобирает `data/space/videos.json`.

Если нужно пересобрать только часть роликов, сделай временный subset JSON с тем же shape и запусти:

```bash
cd temp/clip-demo
node buildpack.mjs /tmp/shorts-space-subset.json
```

Проверка `space` после пополнения:

```bash
node --input-type=module -e 'import fs from "node:fs"; const m=JSON.parse(fs.readFileSync("data/output/admin-demos/manifest.json","utf8")); const p=m.packs.find(p=>p.id==="space"); const v=JSON.parse(fs.readFileSync("data/space/videos.json","utf8")); const missing=v.filter(x=>!fs.existsSync("assets/fact-videos/"+x.file)); const noTime=p.items.filter(x=>!x.createdAt||!x.updatedAt); console.log({adminItems:p.items.length,deckVideos:v.length,missing:missing.length,noTime:noTime.length,newest:p.items.slice(-5).map(x=>[x.id,x.dur,x.createdAt])});'
```

`/clip-demos` читает `data/output/admin-demos/manifest.json`, показывает `createdAt` как
`Добавлен <дата>, <время>` и умеет сортировать новые/старые. Для старых записей можно backfill-нуть
`createdAt` из mtime готовых MP4; новые записи получает сам `buildpack.mjs`.

### Funny Animals / admin clip demos

`funny-reactions` - admin-gallery pack для страницы `/clip-demos` и источник для channel-selectable
preFact deck `funny-animals`. Галерея хранится в `data/output/admin-demos/manifest.json`, а deck для
выбора канала синхронизируется в `data/funny-animals/videos.json` и
`assets/fact-videos/funny-animals/*.mp4`.

Текущий набор:

- pack id: `funny-reactions`;
- видимый title: `Funny Animals`;
- pack spec: `temp/clip-demo/work/pack-funny-reactions-1.json`;
- source videos: `temp/clip-demo/src/funny/*.mp4`;
- downloader: `temp/clip-demo/funny-download.mjs`;
- builder: `temp/clip-demo/funny-buildpack.mjs`;
- selectable-deck sync: `temp/clip-demo/sync-funny-animals-deck.mjs`;
- output: `data/output/admin-demos/funny_*.mp4` и `funny_*.jpg`;
- selectable deck id: `funny-animals`, registered in `src/anecdotes/decks.ts` as `preFact:true`;
- сейчас там 80 MP4, каждый примерно 7-12 секунд.

Формат ролика:

1. короткий English topic intro на 3-7 слов;
2. intro озвучивается через Microsoft `edge-tts` (`temp/clip-demo/tts.py`), без paid API;
3. затем идет вертикальный animal Pexels-клип с его исходной аудиодорожкой;
4. sticker/GIF-like оформление делается локально через ffmpeg `drawtext`: `LOL`, `HAHA`, `XD`, `:D`,
   `LMAO`, `OH NO` и разные top labels;
5. external GIF-файлы сейчас не нужны, поэтому нет отдельного copyright риска на sticker assets.
6. Не генерировать искусственный лай/мяу/animal SFX: если нужен звук, отбирай исходник, где звук уже
   есть. `funny-buildpack.mjs` должен падать на silent source, а не подмешивать fake audio.

Источники:

- текущие исходники скачаны с Pexels страниц без API-ключа через `yt-dlp` +
  `--extractor-args generic:impersonate`;
- Pexels License разрешает бесплатное использование, модификацию и не требует атрибуции, но перед
  переходом на другой сайт или другой тип source обязательно заново проверить лицензию;
- не брать случайные TikTok/YouTube/Instagram reposts; для монетизации они рискованнее даже если
  технически скачиваются.

Как добавить новые funny animal clips:

1. Открыть `temp/clip-demo/work/pack-funny-reactions-1.json`.
2. Добавить в `videos[]` объект с новым уникальным `id`, например:
   ```json
   {
     "id": "funny_new_animal",
     "title": "Short Animal Title",
     "topic": "Three To Seven Words",
     "src": "src/funny/funny_new_animal.mp4",
     "sourceUrl": "https://www.pexels.com/video/...",
     "start": 0.2,
     "end": 8.8,
     "style": "pop",
     "punchline": "SHORT LABEL"
   }
   ```
3. `topic` должен быть на английском и реально 3-7 слов: это первая Microsoft-озвучка.
4. `style` брать из `pop`, `comic`, `neon`, `reaction`, `meme`, `bubble`; если стиль не указан,
   builder распределит стили по очереди.
5. `src` должен лежать под `temp/clip-demo/src/funny/`, а `sourceUrl` должен быть страницей Pexels
   или другим проверенным лицензированным источником.
6. После скачивания обязательно проверить исходник:
   ```bash
   ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 temp/clip-demo/src/funny/funny_new_animal.mp4
   ```
   Пустой вывод значит silent source: такой клип не добавлять в pack, даже если видео визуально хорошее.
7. Если `topic/title/punchline` пишет LLM/workflow, сначала спроси пользователя, какую модель
   использовать. Если тексты пишутся вручную, модель спрашивать не нужно.

Скачать/проверить исходники:

```bash
cd temp/clip-demo
node funny-download.mjs work/pack-funny-reactions-1.json
```

Собрать весь funny pack:

```bash
cd temp/clip-demo
node funny-buildpack.mjs work/pack-funny-reactions-1.json
```

Пересобрать один или несколько id:

```bash
cd temp/clip-demo
node funny-buildpack.mjs work/pack-funny-reactions-1.json funny_poodle_turbo funny_cat_duck_drama
```

Builder сохраняет `createdAt` при пересборке существующего `id`, обновляет `updatedAt`, пишет
`sourceProvider/sourceUrl/style/sound:"source"` в item manifest и не вызывает `sync-space-deck.mjs`.
Для `pack.id === "funny-reactions"` builder вызывает `sync-funny-animals-deck.mjs`, чтобы ролики сразу
попали в selectable deck `funny-animals`. Если deck id уже есть в запущенном backend, новые MP4 из
`videos.json` подхватываются без перезапуска; если deck id был добавлен в `src/anecdotes/decks.ts`
только что, нужен backend restart.
Если старый элемент удаляется из animal pack, убери его из `manifest.json` и удали лишние
`data/output/admin-demos/<id>.mp4/.jpg`, `temp/clip-demo/src/funny/<id>.mp4`, `temp/clip-demo/out/<id>.mp4`,
затем снова запусти `node sync-funny-animals-deck.mjs`.

Проверка `funny-reactions`:

```bash
node --input-type=module -e 'import fs from "node:fs"; import {execFileSync} from "node:child_process"; const m=JSON.parse(fs.readFileSync("data/output/admin-demos/manifest.json","utf8")); const p=m.packs.find(p=>p.id==="funny-reactions"); const missing=[]; const long=[]; const noTime=[]; const noAudio=[]; for (const it of p?.items||[]) { const f=`data/output/admin-demos/${it.id}.mp4`; if (!fs.existsSync(f)||!fs.existsSync(`data/output/admin-demos/${it.id}.jpg`)) missing.push(it.id); const [mm,ss]=(it.dur||"0:00").split(":").map(Number); if ((mm||0)*60+(ss||0)>60) long.push([it.id,it.dur]); if (!it.createdAt||!it.updatedAt) noTime.push(it.id); const a=fs.existsSync(f) ? execFileSync("ffprobe",["-v","error","-select_streams","a","-show_entries","stream=index","-of","csv=p=0",f]).toString().trim() : ""; if (!a) noAudio.push(it.id); } console.log({title:p?.title,items:p?.items.length,missing,long,noTime,noAudio,newest:p?.items.slice(-5).map(x=>[x.id,x.dur,x.createdAt,x.style,x.sound])});'
```

Для визуальной проверки сделай poster/contact sheet из готовых `funny_*.jpg` или извлеки strip из
конкретного MP4. Не утверждай, что pack готов, пока не проверены хотя бы постеры и 1-2 видео strips.

Чтобы пополнить:

1. Положить MP4:
   - `fact-en` и `quotes-de`: `assets/fact-videos/<file>.mp4`;
   - `space`: `assets/fact-videos/space/<file>.mp4`.
2. Добавить объект в нужный `videos.json`:
   ```json
   { "file": "space/new_video.mp4", "title": "Title", "text": "Short description" }
   ```
3. Для `fact-en` и `quotes-de` обновить `index.json`: `total`, `packSize`, `range`. Для `space`
   `index.json` необязателен; если создаешь его, держи `total` равным длине `videos.json`.
4. Проверить, что каждый `file` реально существует.
5. Если создаешь новый video pack по этому же паттерну, добавь его в `DECKS` с `preFact: true`,
   положи `videos.json`, MP4 в `assets/fact-videos/...`, и обязательно добавь сюда отдельную секцию
   с правилами создания/пополнения именно этого пака.

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; for (const d of ["data/fact-videos","data/quotes-de","data/space"]) { const arr=JSON.parse(fs.readFileSync(`${d}/videos.json`,"utf8")); const missing=arr.filter(x=>!fs.existsSync(path.resolve("assets/fact-videos",x.file))).map(x=>x.file); const idxPath=`${d}/index.json`; const idx=fs.existsSync(idxPath)?JSON.parse(fs.readFileSync(idxPath,"utf8")):{total:arr.length}; console.log(d,{videos:arr.length,indexTotal:idx.total,missing:missing.slice(0,5),missingCount:missing.length}); }'
```

## Template-pack: The Mind Edge

Исходные карточки собираются из LLM-батчей:

- вход: `corpora/mind-edge-gen/*.json`;
- сборщик: `src/scripts/mind-edge-assemble.mjs`;
- результат: `assets/template-packs/the-mind-edge/cards.json`;
- шаблоны: `src/scripts/mind-edge-templates.ts`;
- сид в живой пак: `src/scripts/seed-mind-edge.ts`.

Перед новым batch workflow спроси пользователя модель. Батчи должны быть JSON-массивами `{title,text}`.

Сборка:

```bash
node src/scripts/mind-edge-assemble.mjs
```

Сид в `data/packs` идемпотентный:

```bash
node --import tsx --experimental-sqlite src/scripts/seed-mind-edge.ts
```

Проверка шаблонов/карточек:

```bash
node --input-type=module -e 'import fs from "node:fs"; const cards=JSON.parse(fs.readFileSync("assets/template-packs/the-mind-edge/cards.json","utf8")); console.log({cards:cards.length,first:Object.keys(cards[0]||{})});'
```

## Template-pack: psychology-mgs

Это пользовательский template-pack с большим набором визуальных шаблонов и карточек в
`assets/template-packs/psychology-mgs/`. Сборщик `src/scripts/build-psychology-mgs.ts` строит шаблоны,
проверяет визуальные ограничения и рендерит QA. Seed-скрипт `src/scripts/seed-psychology-mgs.ts`
создает живой пак в `data/packs`.

Сборка/QA:

```bash
node --import tsx src/scripts/build-psychology-mgs.ts
```

Сид:

```bash
node --import tsx --experimental-sqlite src/scripts/seed-psychology-mgs.ts
```

При генерации новых карточек через LLM сначала спроси пользователя модель. Для body text сохраняй
читабельность: яркие плашки можно использовать для коротких labels/title, но не для основного списка.

## Template-pack: Curiosaurs English Facts

Это локальный deterministic pack для детских фактов. LLM не нужен: факты зашиты в
`src/scripts/build-curiosaurs-english.ts`, шаблонные PNG берутся из `temp/timur`, результат пишется в
`assets/template-packs/curiosaurs-english/`.

Малый визуальный прогон:

```bash
node --import tsx --experimental-sqlite src/scripts/build-curiosaurs-english.ts --count=60
```

Полная сборка и seed:

```bash
node --import tsx --experimental-sqlite src/scripts/build-curiosaurs-english.ts --count=800 --seed
```

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; const manifest=JSON.parse(fs.readFileSync("assets/template-packs/curiosaurs-english/manifest.json","utf8")); const cards=JSON.parse(fs.readFileSync("assets/template-packs/curiosaurs-english/cards.json","utf8")); console.log({manifestCount:manifest.count,cards:cards.length,themes:manifest.themes});'
```

## Кастомные паки через UI/API

Создание:

1. Открыть `/editor`.
2. Собрать шаблон и экспортировать JSON.
3. Открыть "Карточки".
4. Создать пак: имя, язык, JSON шаблона.
5. Добавлять карточки JSON-массивом.

Правила полей выводятся из killbox-ролей шаблона в `src/packs/store.ts`:

- `role` становится ключом карточки;
- `bullet:true` требует массив строк;
- `minChars`/`maxChars` задают лимиты;
- если `maxChars=0`, емкость оценивается по геометрии killbox.

Пример карточки:

```json
[
  {
    "title": "Short hook",
    "text": "Body text that fits the template"
  }
]
```

Если карточки генерируются LLM, сначала спроси пользователя модель workflow, затем проверь JSON через
страницу "Карточки" или через `validateBatch()` из `src/packs/store.ts` без записи на диск.

Если такой пак создается агентом для пользователя вручную, после создания добавь в этот документ
отдельную секцию или подраздел:

- название и `packId`;
- кто владелец/какой язык;
- откуда брать или как генерировать новые карточки;
- точный JSON shape для добавления карточек;
- команда/API/UI-путь для пополнения;
- команда preview/render-проверки;
- как не задублировать уже добавленные карточки.

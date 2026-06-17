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

Чтобы пополнить:

1. Положить MP4:
   - `fact-en` и `quotes-de`: `assets/fact-videos/<file>.mp4`;
   - `space`: `assets/fact-videos/space/<file>.mp4`.
2. Добавить объект в нужный `videos.json`:
   ```json
   { "file": "space/new_video.mp4", "title": "Title", "text": "Short description" }
   ```
3. Обновить `index.json`: `total`, `packSize`, `range`.
4. Проверить, что каждый `file` реально существует.

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

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

## Общее правило озвучки

Если новый или пересобираемый ролик требует голос, используй ElevenLabs. Ключи уже лежат в окружении
проекта: `ELEVENLABS_API_KEYS`, `ELEVENLABS_API_KEY` или `ELEVENLABS_API_KEY_1`, `ELEVENLABS_API_KEY_2`
и т.д. Загружать их можно из `.env` / `.env.local`, но нельзя печатать реальные ключи в логи,
markdown, код, frontend, БД или git diff. В логах допустимы только номер ключа и last4/hint.

Скрипты должны перебирать ключи: `401`/invalid key - следующий ключ; `402`/quota exceeded - считать
ключ исчерпанным до reset; `429` - backoff + повтор. ElevenLabs - единственный TTS: локальные/офлайн
движки (`edge-tts`, Piper, Coqui, espeak) не использовать вообще, даже для чернового preview. Тайминги
слов/субтитров брать из ElevenLabs (endpoint `with-timestamps` / поле `alignment`), а не локальным `whisper`.

Немое кино не считать приоритетным рутинным форматом: пользователь отклонил это направление как слабое.
Если когда-нибудь оно понадобится отдельно, брать только public-domain source, удалять исходный звук и
сначала согласовать формат.

## Общее правило субтитров для Shorts

Для вертикальных Shorts/TikTok/Reels нельзя ставить важный текст в самый низ кадра: мобильный UI
YouTube Shorts перекрывает нижнюю часть видео кнопками, описанием, названием канала и полем
комментария. Для `1080x1920` держи субтитры примерно в центральной safe-zone:

- не ниже `y ~= 1320-1360` для нижнего края блока субтитров, лучше держать центр блока около `y ~= 1100-1200`;
- не вплотную к правому краю, где стоят лайк/дизлайк/комментарии/поделиться;
- оставляй правый запас около `160-180 px`;
- не клади субтитры поверх нижних `400-500 px`;
- проверяй кадр в мобильном Shorts-просмотре или хотя бы на screenshot с типичным правым UI.

Для spoken-word роликов предпочтителен karaoke-style: вся фраза белая с чёрной обводкой, а текущее
слово или короткий текущий фрагмент подсвечен жёлтым/тёплым цветом по таймингам ElevenLabs. Не
подсвечивай слишком много слов сразу и не используй низкоконтрастные цвета. Для более живого эффекта
можно добавить мягкую тёмную подложку и лёгкий pop/lift только на активное слово; весь блок при этом
не должен прыгать, менять ширину или уходить из safe-zone.

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
| `animal-superheroes` / `animal-superheroes-en` ЗвероГерои / Animal Heroes | `data/output/admin-demos/manifest.json` + `data/animal-superheroes*/videos.json` + `assets/fact-videos/animal-superheroes*/` | сериальные MP4-комиксы RU/EN с одинаковым визуалом, ElevenLabs-озвучкой и safe-zone karaoke-субтитрами | нет |
| `The Mind Edge` template-pack | `assets/template-packs/the-mind-edge/` -> `data/packs/` seed | LLM-батчи -> `cards.json`, шаблоны из кода | да, для новых карточек |
| `psychology-mgs` template-pack | `assets/template-packs/psychology-mgs/` -> `data/packs/` seed | карточки + 40 шаблонов | зависит от источника новых карточек |
| `Curiosaurs English Facts` template-pack | `assets/template-packs/curiosaurs-english/` -> `data/packs/` seed | локальный набор kid-safe facts + PNG-шаблоны | нет |
| `visual-riddles` Вижу Ответ | `data/output/admin-demos/manifest.json` + `data/visual-riddles/videos.json` + `assets/fact-videos/visual-riddles/` | индивидуальные визуальные MP4 для `/clip-demos` и selectable `preFact` deck для каналов | нет |

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

## Новый этап: visual-first загадки с озвучкой

Для загадочных Shorts больше не гонись за массовостью. Главный критерий - визуальная задача, которую
понятно решать глазами в первые 1-2 секунды. Пак лучше делать меньше, но каждая карточка должна быть
сильной как самостоятельная картинка.

Правила карточек:

- основной кадр - крупная визуальная загадка: ребус, спички, шарики, яйца/животные, "найди лишнее",
  перестановка букв, предметная иллюстрация, лист бумаги с рукой/ручкой;
- текст на экране короткий: заголовок, картинка, один вопрос; длинное условие уходит в озвучку;
- цвета ярче, чем в старом тёмном mystery-стиле: жёлтые/красные/синие плашки, светлый фон, жирный
  чёрный контур, крупные объекты;
- ответы не показывать в самом Short; CTA ведёт в комментарии;
- рендерить и смотреть карточки глазами: если текст/объект спорит с композицией, карточка не готова;
- массовый pack допустим только после того, как 5-10 эталонных карточек выглядят хорошо.

Озвучка:

- голос главный, музыка только тихий фон;
- готовить отдельный `voiceText`: нормальные русские фразы, меньше символов и цифр, числа лучше
  словами там, где TTS может ошибиться;
- использовать общее правило ElevenLabs выше;
- реальные ключи хранить только в окружении (`.env` / `.env.local`), без записи в код/docs/frontend/DB;
- если один ключ получил `401`/invalid key - отключить его и взять следующий;
- если закончилась квота (`402`, quota exceeded или `character_count >= character_limit`) - пометить
  ключ exhausted до reset и взять следующий;
- на `429` сначала backoff + jitter; если это concurrency/rate limit, не крутить ключи бесконечно,
  а ограничивать параллельность и пробовать позже;
- логировать можно только индекс ключа и last4/hint, не полный секрет.

Базовые ElevenLabs-настройки для русских загадок:

```json
{
  "model_id": "eleven_multilingual_v2",
  "language_code": "ru",
  "output_format": "mp3_44100_128",
  "voice_settings": {
    "stability": 0.52,
    "similarity_boost": 0.80,
    "style": 0,
    "use_speaker_boost": true,
    "speed": 1.03
  },
  "apply_text_normalization": "auto"
}
```

Для стабильного batch без ручного прослушивания подними `stability` до `0.58-0.65`. Для более
напряжённой подачи можно пробовать `stability: 0.42-0.48`, `style: 0-0.08`, но только после прослушивания.
`eleven_flash_v2_5` годится для дешёвых превью, а не как основной финальный голос. `eleven_v3` оставь для
ручных выразительных роликов, не для дефолтного batch.

Справка ElevenLabs:

- https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- https://elevenlabs.io/docs/capabilities/text-to-speech/models
- https://elevenlabs.io/docs/capabilities/text-to-speech/voice-settings
- https://elevenlabs.io/docs/api-reference/user/subscription

## ЗвероГерои / Animal Heroes: serial clip demos

Это prebuilt video pack для страницы `/clip-demos` и selectable decks `animal-superheroes`
и `animal-superheroes-en`. Текущий готовый набор остановлен на 11 последовательных сериях по просьбе
пользователя; 12+ продолжать только после отдельной явной просьбы. При этом сезон
считается открытым и может продолжаться дальше без финальной точки.

Формат: вертикальные серии-комиксы по 20-35 секунд, обычно 8 gpt-image-2 сцен на эпизод,
ElevenLabs Jessica, тихая музыка и safe-zone karaoke-субтитры. RU и EN используют один и тот же
визуальный ряд, но отдельную озвучку, субтитры и metadata. Decks помечены как `sequential`, поэтому
генерация в библиотеку берет первый еще не использованный эпизод по порядку из `videos.json`, а не
случайный ролик.

Готовые артефакты:

- `data/output/admin-demos/manifest.json` - pack `animal-superheroes` для `/clip-demos`;
- `data/output/admin-demos/as_*.mp4` и `data/output/admin-demos/as_*.jpg` - ролики и постеры;
- `data/animal-superheroes/videos.json` - RU список серий для selectable `preFact` deck;
- `data/animal-superheroes-en/videos.json` - EN mirror того же визуального ряда;
- `assets/fact-videos/animal-superheroes/*.mp4` и `assets/fact-videos/animal-superheroes-en/*.mp4` - MP4, которые генерация копирует в библиотеку;
- `data/animal-superheroes/episodes-source.json` - каноничный source сценариев RU/EN и visual beats;
- `data/animal-superheroes/AGENTS.md` - главный контракт по стилю, voice, safe subtitles, ordering, YouTube assets;
- `data/animal-superheroes/STORY_STATE.md` - короткое состояние сюжета;
- `scripts/build-animal-superheroes-generated.py` - текущий сборщик RU/EN из gpt-image-2 сцен;
- `temp/animal-superheroes/gpt-image2/generated_scenes/<episode_id>/scene_01.png...` - визуальные сцены;
- `temp/animal-superheroes/voice-jessica/` - ElevenLabs voice cache;
- `temp/animal-superheroes/youtube/` - avatar/banner/name/description для RU и EN каналов.

Музыка: `Sunflower Valley` by `isaiah658`, OpenGameArt, CC0. Источник и license evidence записаны в
`temp/animal-superheroes/sources.json`.

Пересборка:

```bash
python3 scripts/build-animal-superheroes-generated.py --episodes 1 2 3 4 --lang both
```

Скрипт:

- читает ключи ElevenLabs из `.env` / окружения, но не печатает их;
- использует endpoint `with-timestamps` и сохраняет character alignment рядом с MP3;
- рендерит safe-zone karaoke-субтитры: фраза белая, текущее слово желтое, текст выше нижнего YouTube Shorts UI;
- добавляет финальный черный end-card;
- обновляет в `data/output/admin-demos/manifest.json` только animal packs, не трогая остальные паки;
- синхронизирует `assets/fact-videos/animal-superheroes*/` и `data/animal-superheroes*/videos.json`.

Проверка:

```bash
node -e 'const fs=require("fs"); for (const p of ["data/animal-superheroes/videos.json","data/animal-superheroes-en/videos.json"]) { const j=JSON.parse(fs.readFileSync(p,"utf8")); console.log(p,j.length,j.map(x=>x.episode).join(",")); }'
for f in data/output/admin-demos/as_*.mp4; do printf "%s " "$f"; ffprobe -v error -show_entries format=duration:stream=width,height,codec_type -of compact=p=0:nk=1 "$f" | tr "\n" " "; printf "\n"; done
```

Если меняются только `data/output/admin-demos/*`, `/clip-demos` подхватит manifest без перезапуска.
После изменений `src/anecdotes/decks.ts`, `src/anecdotes/library.ts` или `web/src/lib/deck.ts` нужен
обычный backend/frontend rebuild/restart, чтобы новый selectable deck появился в каналах.

## Вижу Ответ: visual-riddles clip demos

Это не Studio/template-pack. Это набор индивидуальных коротких MP4 для страницы `/clip-demos` и
одновременно selectable `preFact` deck для выбора источника в каналах, потому что каждая загадка
требует отдельной картинки, собственной озвучки, музыки и визуальной проверки.

Готовые артефакты:

- `data/output/admin-demos/manifest.json` - pack `visual-riddles` с title `Вижу Ответ`;
- `data/output/admin-demos/vr_*.mp4` - готовые вертикальные ролики;
- `data/output/admin-demos/vr_*.jpg` - постеры для карточек в `/clip-demos`;
- `data/visual-riddles/videos.json` - список роликов для selectable deck;
- `assets/fact-videos/visual-riddles/*.mp4` - MP4, которые библиотека канала копирует как готовые видео;
- `temp/visual-riddle-demos/` - локальный рабочий набор карточек, цветовых SVG, музыки, voice-кэша и сборщика;
- `temp/visual-riddle-channel-avatar.png` и `temp/visual-riddle-channel-wallpaper.png` - оформление канала;
- `temp/visual-riddle-channel-title-description.md` - название, handle и описание канала.

Важно про `temp/`: это рабочая одноразовая зона. В ней можно держать исходные PNG, voice-cache,
contact sheets, временные заметки и локальные сборщики, но нельзя оставлять важные правила только там.
Если во время работы в `temp/` появилась инструкция, решение по стилю, TTS, лицензиям, QA или процессу,
перенеси её в этот документ или другой профильный файл в `docs/` до завершения задачи.

Пересборка демо:

```bash
node temp/visual-riddle-demos/create-internet-cards.mjs
ELEVENLABS_API_KEYS="key1,key2,key3" node temp/visual-riddle-demos/build-demos.mjs
```

В интерактивной работе лучше передавать ключи через stdin/окружение и не печатать их в команду,
markdown или git diff. Скрипт сам перебирает ключи при `401`/`402`, повторяет `429`, кэширует уже
созданные `temp/visual-riddle-demos/voice/*.mp3` и обновляет только pack `visual-riddles` в
`admin-demos/manifest.json`. `create-internet-cards.mjs` перед сборкой очищает старые numbered PNG,
пересоздаёт `cards.json` и `sources.json`, скачивает только явно license-safe Commons-источники,
подтягивает public-domain Project Gutenberg иллюстрации и рендерит финальные карточки. Для финального
набора `visual-riddles` нельзя запускать старый `create-cards.mjs`: он был черновым самодельным
прототипом.

После пересборки демо синхронизируй selectable deck:

```bash
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const m=JSON.parse(fs.readFileSync("data/output/admin-demos/manifest.json","utf8")); const p=m.packs.find(x=>x.id==="visual-riddles"); if(!p) throw new Error("visual-riddles pack not found"); const expected=new Set(p.items.map(x=>x.id)); let removedAdmin=0; for (const f of fs.readdirSync("data/output/admin-demos")) { if (!/^vr_.*\.(mp4|jpg)$/.test(f)) continue; const id=f.replace(/\.(mp4|jpg)$/,""); if(!expected.has(id)){ fs.unlinkSync(path.join("data/output/admin-demos",f)); removedAdmin++; } } fs.mkdirSync("data/visual-riddles",{recursive:true}); fs.mkdirSync("assets/fact-videos/visual-riddles",{recursive:true}); let removedAssets=0; for (const f of fs.readdirSync("assets/fact-videos/visual-riddles")) if(f.endsWith(".mp4")){ fs.unlinkSync(path.join("assets/fact-videos/visual-riddles",f)); removedAssets++; } const videos=[]; for (const it of p.items) { fs.copyFileSync(`data/output/admin-demos/${it.id}.mp4`, `assets/fact-videos/visual-riddles/${it.id}.mp4`); videos.push({file:`visual-riddles/${it.id}.mp4`,title:it.title,text:it.title}); } fs.writeFileSync("data/visual-riddles/videos.json", JSON.stringify(videos,null,2)+"\n"); console.log({videos:videos.length,removedAdmin,removedAssets});'
```

Deck зарегистрирован в `src/anecdotes/decks.ts` (`id: "visual-riddles"`, `preFact: true`,
`adminOnly: true`) и во frontend-реестре `web/src/lib/deck.ts`. Если этот deck id добавлен впервые,
нужны `npm run web:build` и backend restart, иначе уже запущенный сайт не покажет его в селекторе
источников на `/accounts/:id`.

Правила контента:

- для этого пака не придумывать визуальную задачу с нуля. Самодельные схемы допустимы только как
  черновик/прототип и не должны попадать в финальные `vr_*.mp4`;
- финальный визуал брать из готового license-safe источника: public-domain puzzle books, Wikimedia
  Commons/Openverse/Openclipart/PublicDomainVectors/CC0 или другой источник с явной лицензией;
- по каждому финальному визуалу хранить source URL, автора/книгу, license и локальный путь в
  `temp/visual-riddle-demos/sources.json`;
- текущая финальная схема: 80 карточек: 5 public-domain цветовых карточек из Wikimedia
  Commons/Ishihara, 45 оригинальных развлекательных pseudo-Ishihara SVG, 24 визуальные задачи из
  Project Gutenberg puzzle books и 6 hidden-object/counting карточек с животными. Если набор
  расширяется, новые карточки проходят тот же `sources.json` и не используют `source: own-visual-riddle`;
- не копировать картинки, сетки, формулировки и ответы из Pinterest/TikTok/YouTube/современных сайтов;
- если лицензия не ясна, визуал не использовать и не "перерисовывать почти так же"; можно взять только
  общий тип задачи и найти другой открытый готовый визуал;
- текст вопроса не дублировать крупно в нескольких местах. На карточке: один короткий вопрос внизу
  и один визуал в центре; подробности идут в озвучку;
- каждый интернет-визуал подгонять индивидуально: `imageScale`/contrast/brightness в
  `create-internet-cards.mjs` не должны оставлять мелкую "книжную" картинку посреди пустого поля, но
  и не должны резать важные края. Если source плохо ложится в вертикальный формат, заменить source;
- допустимые темы: готовые visual puzzles, проверка внимания, найди отличия, hidden object, optical
  illusion, цветовые/оттеночные задачи как развлекательные проверки восприятия;
- цветовые тесты делать только как развлекательные visual riddles: свои pseudo-Ishihara точки/сетки/оттенки
  или явно public-domain таблицы с источником. Не копировать реальные медицинские таблицы с неясной
  лицензией и не утверждать в ролике, что зритель "дальтоник" или получил диагноз;
- ответы не выводить в ролике; CTA формулировать как `Пиши ответ в комментариях`;
- каждую новую карточку смотреть глазами в contact sheet и отдельно в вертикальном постере.
- финальную визуальную приемку делает основной агент лично: открыть итоговые постеры/кадры всех MP4
  целиком, проверить ровные отступы, центровку, переносы, читаемость с телефона, что текст не вылезает
  за карточки/кнопки/плашки и не перекрывает важные объекты; субагентам можно поручать поиск идей, но
  не финальное "выглядит нормально";
- если пользователь указывает на кривую карточку, сначала перечитать эту секцию, затем удалить/заменить
  все карточки того же самодельного типа, а не чинить только один видимый пример.

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const m=JSON.parse(fs.readFileSync("data/output/admin-demos/manifest.json","utf8")); const p=m.packs.find(p=>p.id==="visual-riddles"); const v=JSON.parse(fs.readFileSync("data/visual-riddles/videos.json","utf8")); const missing=v.filter(x=>!fs.existsSync(path.join("assets/fact-videos",x.file))).map(x=>x.file); console.log({title:p?.title,manifestItems:p?.items?.length,deckVideos:v.length,missing:missing.length});'
node --input-type=module -e 'import fs from "node:fs"; const m=JSON.parse(fs.readFileSync("data/output/admin-demos/manifest.json","utf8")); const p=m.packs.find(p=>p.id==="visual-riddles"); const own=(p?.items||[]).filter(x=>String(x.source||"").includes("own")); console.log({items:p?.items?.length,ownSource:own.length});'
for f in data/output/admin-demos/vr_*.mp4; do printf "%s " "$f"; ffprobe -v error -show_entries format=duration:stream=codec_type -of compact=p=0:nk=1 "$f" | tr "\n" " "; printf "\n"; done
node_modules/ffmpeg-static/ffmpeg -y -pattern_type glob -framerate 1 -i 'data/output/admin-demos/vr_*.jpg' -vf 'scale=120:213,tile=8x10' -frames:v 1 temp/visual-riddle-demos/contact-sheet.jpg
```

Если меняются только файлы в `data/output/admin-demos/`, перезапуск сервера не нужен: `/clip-demos`
читает static manifest. Если меняется код сервера или frontend, нужен обычный rebuild/restart по
правилам проекта.

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

`space` пополняется локальным free-stack монтажным конвейером. **Инструмент живёт в отслеживаемом
`src/scripts/space-montage/`** (раньше был в gitignored `temp/clip-demo/` и из-за этого был утерян — НЕ
держи монтажный код в `temp/`). Источник теперь — **NASA Scientific Visualization Studio**
(`svs.gsfc.nasa.gov`, public domain, прямые MP4) с фолбэком Hubble/Webb; общая NASA Image&Video Library
шумная (пресс-ролики/железо/«говорящие головы») и для этого пака не годится.

Состав (`src/scripts/space-montage/`):

- `topics.json` — список тем `{id,subject,query}`;
- `find-svs-sources.workflow.mjs` — Workflow: по агенту на тему, ищет `site:svs.gsfc.nasa.gov` через
  WebSearch, WebFetch'ит страницу визуализации, достаёт и валидирует (`curl -sIL`) прямой MP4; возвращает
  `{id,mp4Url,title,description,credit,license,...}` (модель агентов — sonnet, это поиск, не генерация);
- `fetch-sources.mjs` — фолбэк-добытчик из NASA Image&Video Library (для тем, которых нет в SVS);
- `write-narration.workflow.mjs` — Workflow: Opus 4.8 (модель VO-текста СНАЧАЛА спроси у пользователя)
  пишет ~50-словный нарратив + хук-заголовок на каждую тему, привязанный к реальному описанию клипа;
  draft-всё-сразу → polish (varienty/длина). Темы вшиты в скрипт (см. ниже);
- `build.mjs` — сборка ролика: ElevenLabs TTS (голос **Matilda** `XrExE9yKIg1WjnnlVkGX`, endpoint
  `with-timestamps`) → пословные **караоке-субтитры в стиле Animal Heroes** (puppeteer-HTML: белый жирный
  текст, тёмная обводка, активное слово в золотой плашке `#fbbf24`; см. `captionCss()`), рендер каждого
  слова в прозрачный PNG → alpha-оверлей через ffmpeg `concat` → рефрейм в 1080×1920 (футаж-бан ~42%
  высоты + тёмный размытый фон, без чёрных полос) + кредит источника → синк в деку.
- scratch (gitignored): `temp/space-build/{src,voice,cap,base,sources.json}`;
- готовая админ-галерея: `data/output/admin-demos/<id>.mp4`, `<id>.jpg`, `manifest.json`;
- канал-selectable deck: `assets/fact-videos/space/<id>.mp4` и `data/space/videos.json`;
- страница просмотра: `/clip-demos` (`web/src/pages/ClipDemos.tsx`).

Как пополнить (полный цикл с нуля):

1. Добавь новые темы в `topics.json` (и в `TOPICS` внутри `find-svs-sources.workflow.mjs`), используя
   только `id`, которых нет в `data/output/admin-demos/manifest.json`.
2. Найди источники: `Workflow find-svs-sources.workflow.mjs` → распарсь результат и скачай MP4 в
   `temp/space-build/src/<id>.mp4`, собери `temp/space-build/sources.json`
   (`{id:{file,credit,description,subject,...}}`). Визуально отбракуй слабые клипы (контактный лист
   ffmpeg `tile`), замени плохие точечным WebSearch+WebFetch+curl.
3. Тексты: **сначала спроси у пользователя модель**, затем `Workflow write-narration.workflow.mjs`
   (темы/описания вшиваются в скрипт перед запуском) → сохрани результат в
   `src/scripts/space-montage/narration.json` (`[{id,title,narration}]`, ≤~52 слов).
4. Собери: `node --env-file=.env src/scripts/space-montage/build.mjs --no-sync` (или `--only <id>`),
   визуально проверь (см. QA ниже), почини и пересобери точечные `id`, затем синкни в деку:
   `node --env-file=.env src/scripts/space-montage/build.mjs --sync-only`.
5. Держи ролики в Shorts-формате (`dur` ≤ ~0:58); короткие исходники `build.mjs` сам зацикливает.

**Немой субтитровый вариант (`--novoice`):** для клипов без озвучки (свободный футаж + только субтитры,
чтобы читали) — у источника ставь `novoice: true` (или флаг `--novoice` глобально). Тогда TTS не
вызывается, тайминг сабов идёт по скорости чтения (`READ_PER_WORD`), аудиодорожки нет (`compositeSilent`),
а в левом верхнем углу рисуется короткий кредит источника (`shortSource()` → «NASA SVS» и т.п.) поверх
полной атрибуции снизу. Источник свободной лицензии (PD/CC) обязателен; «только субтитры» на чужой
авторской документалке — это и копирайт-, и YouTube-«reused content»-риск. Per-clip `zoom`/`startSec` в
`sources.json` гасят мелкий-объект-на-чёрном и вшитые титры/подписи. Батч-2 = 18 таких клипов.

VO-правила: **ElevenLabs — единственный TTS**; word-тайминги берём из ElevenLabs (`with-timestamps` /
`alignment`), не из whisper; ключи ротируются из `.env` (`ELEVENLABS_API_KEYS`), free-tier = 10000
симв/мес на ключ — следи за бюджетом (≈260 симв/ролик). Финальная визуальная QA несколькими субагентами
обязательна (бить на кадры → читать → искать чёрные полосы/дефекты субтитров → чинить → перепроверять).

Проверка `space` после пополнения:

```bash
node --input-type=module -e 'import fs from "node:fs"; const m=JSON.parse(fs.readFileSync("data/output/admin-demos/manifest.json","utf8")); const p=m.packs.find(p=>p.id==="space"); const v=JSON.parse(fs.readFileSync("data/space/videos.json","utf8")); const missing=v.filter(x=>!fs.existsSync("assets/fact-videos/"+x.file)); const noTime=p.items.filter(x=>!x.createdAt||!x.updatedAt); console.log({adminItems:p.items.length,deckVideos:v.length,missing:missing.length,noTime:noTime.length,newest:p.items.slice(-5).map(x=>[x.id,x.dur,x.createdAt])});'
```

`/clip-demos` читает `data/output/admin-demos/manifest.json`, показывает `createdAt` как
`Добавлен <дата>, <время>` и умеет сортировать новые/старые. Для старых записей можно backfill-нуть
`createdAt` из mtime готовых MP4; новые записи получает сам `buildpack.mjs`.

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

### ⚠️ Inhaltsrichtlinie `quotes-de` — модерация ПЕРЕД добавлением (обязательно)

**История:** 2026-06-19 YouTube снял Short с цитатой Штрауса «…die roten Ratten … in ihre Löcher»
(`q204.mp4`) — страйк по **hate speech** (дегуманизация). 2026-06-20 из деки удалены 10 цитат (список
ниже). Дека `adminOnly` и целиком состоит из политических цитат → **повышенный риск** hate-speech и
прославления насилия.

**Любой агент/воркфлоу, добавляющий цитаты в `data/quotes-de/videos.json` (или любой `*/videos.json`
политических цитат), ОБЯЗАН отбраковать каждую цитату по этому списку. Сомневаешься — НЕ добавляй.**

Запрещено (немедленный дроп):
- **Дегуманизация** людей/групп (животные, паразиты, «крысы», «загнать в норы») — напр. `die roten Ratten … in ihre Löcher`.
- **Слуры по защищённым группам** (ориентация/раса/религия/пол/инвалидность) — напр. `warmer Bruder` (гомофобный).
- **Прославление нацизма/диктатуры/авторитаризма**, призывы к беспрекословному подчинению, нацистские лозунги — напр. `Deutschnationaler … bedingungslosen Gehorsam`, `Wollt ihr den totalen Krieg?!` (Геббельс), хвала Пиночету `Ordnung … süßer Klang`.
- **Релятивизация/отрицание Холокоста**, «хватит напоминать о прошлом» — напр. `…auch nicht von Tel Aviv … an unsere Vergangenheit erinnert werden`.
- **Анти-иммигрантское/этно-сокращение/«вон отсюда»** — напр. `Ausländer um die Hälfte reduzieren`, `so viele Ausländer … ein Fehler`, `Gastrecht missbraucht: Raus`.
- **Фейк/подделки** (приписанные политику слова, которые он не говорил) — репутационный + дезинфо-риск.
- Любые **призывы к насилию, ненависти, дискриминации** против лиц или групп.

Можно (целевой регистр деки): достойные/остроумные/исторические высказывания — Weizsäcker (8. Mai,
память), Brandt, Heuss, Genscher, Rau (покаяние перед жертвами), афоризмы о демократии/экономике/юморе.
Острая политическая полемика **без атаки на защищённые группы** (реальные мейнстрим-цитаты про
мультикульти, оппозицию и т.п.) допустима, но при сомнении выбирай нейтральное.

Быстрый lint-страховка перед коммитом пополнения (совпадение ≠ автодроп, но требует ручного решения —
не замена ручной проверки):
```bash
grep -niE "ratten|warmer bruder|bedingungslosen gehorsam|totalen krieg|tel aviv|raus, und zwar|um die hälfte|untermensch|ausrotten|hingehören" data/quotes-de/videos.json
```

Удалено 2026-06-20 (10): `q204` (страйк), `q150`, `q093`, `q085`, `q239`, `q039` (явные нарушения) +
`q146`, `q126`, `q225`, `q121` (пограничные). См. также `data/quotes-de/CONTENT-POLICY.md`.

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

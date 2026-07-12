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

## Общее правило анекдотов и шуток

**ЖЁСТКОЕ ПРАВИЛО: анекдоты и шутки НЕЛЬЗЯ придумывать самому.**

Для joke/anecdote-паков текст должен быть source-backed: брать только из внешнего корпуса с проверяемой
свободной лицензией или public-domain/open-license источника из интернета. Нужны URL, название
источника, автор/составитель если известен, license/rights note и дата/способ получения в
`sources.json` или рядом лежащем ledger.

Запрещено делать "оригинальные", "шаблонные", "сгенерированные", "вдохновлённые современным юмором" или
LLM-written анекдоты вместо настоящего лицензированного корпуса. Если подходящего источника нет, надо
остановиться и честно сказать пользователю, что свободный корпус не найден, а не заполнять пак
придуманным текстом.

### Реакционные Shorts из пользовательского мема

Для единичного ролика по мему, который прислал сам пользователь:

- читать текст мема как написано; не добавлять новые шутки и реплики без отдельной просьбы;
- сначала разобрать смысловые биты: спокойная завязка, пауза, панчлайн, возможный смех/вздох;
- мем держать главным и полностью читаемым; при круглом аватаре сдвигать мем выше, а круг ставить ниже
  с зазором, не перекрывая картинку, текст и нижнюю safe-зону;
- в круге показывать голову и немного плеч/торса без обрезанной причёски; использовать моргание,
  губы, брови/эмоции и небольшие движения головы, а не одну повторяющуюся мимику;
- мимику смеха запускать по фактическому началу смеха в WAV, а не по приблизительной секунде. Для RU
  можно взять конец последней речевой фонемы через MFA и уточнить начало невербального звука по
  `silencedetect`/waveform;
- вместо пустого белого поля использовать спокойный тематический фон, который отделяет белый мем и
  круг аватара, но не спорит с ними по контрасту;
- перед выдачей MP4 проверить минимум пять полноразмерных кадров: старт, чтение, пауза, панчлайн,
  смех; дополнительно сделать контактный лист. Исправлять обрезку, перекрытия и рассинхрон до выдачи.

Новые анекдотные/joke-паки не генерируй "с нуля" через ИИ. Для них сначала ищи внешний корпус:
public-domain книги, Wikisource/Internet Archive/Gutenberg, open-source датасеты с явной лицензией
или другой проверяемый источник, где можно записать evidence в `sources.json`/ledger. ИИ допустим
только как вспомогательный этап после этого: очистка мусора, разметка, заголовки, локализация уже
легального текста и safety-фильтр. Если права или происхождение текста неясны, такой источник не
использовать.

## Статус тематических блоков armen

Для super-admin `armen` актуальная сетка держится в `server/routes/super-admin-channel-blocks.ts`.
Сейчас рабочие блоки такие:

- `russian` / "Русские" - все русские нерелигиозные каналы, один общий RU-микс;
- `quotes` / "Иностранные" - все нерусские нерелигиозные каналы, включая старые URL-алиасы
  `jokes_memes`, `facts_space`, `psychology`, `riddles_illusions`;
- `religion` / "Религия" - исламские и христианские каналы, но с раздельными секциями source mix.

В `armen`-схему больше не возвращать `visual-riddles*`, `illusions*`, `illusions-3d*`, legacy
`memes-*`, иностранные `pack:static-facts-*-superadmin`, `pack:motivation-ru-superadmin` и
`christian-facts-en`, `pack:soviet-posters-ru`: они запрещены shared guard'ом
`server/services/super-admin-forbidden-source-decks.ts` и не должны появляться в `sourceDecks`,
`slotDecks`, picker'ах и новых block rules. Новые мемы для нерелигиозных каналов - только
`pack:new-memes-<lang>-superadmin`; русский блок использует `pack:new-memes-ru-superadmin`.
Длинные видео в block mix не включать: длинные сборники публикуются отдельно из библиотеки канала.

Декоративные смеющиеся emoji/GIF в шаблонах анекдотов допустимы, если они не мешают чтению, не
перекрывают текст и не выглядят как плашка/водяной знак/название канала. GIF-акценты держать только в
безопасных боковых/нижних зонах; верхнюю область заголовка не занимать. Старые брендовые подписи канала
внизу карточек не возвращать.

Все языки анекдотов используют общий управляемый пул разрешённых визуальных шаблонов. Не добавляй
языковые исключения с собственным неограниченным набором шаблонов: исключения и allowlist держатся в
`src/anecdotes/joke-template-pool.ts` и применяются к `/examples`, рендеру библиотеки, превью и ручной
сборке pack-видео. На 2026-07-03 из RU-сцен исключены `russian_apartment_hallway.jpg`,
`russian_banya.jpg`, `russian_kitchen_table.jpg`, `russian_train_compartment.jpg`; для
`pack:chistes-es-public-domain` разрешён только template index `4` (карточка A035 на странице
примеров). Новые animated-шаблоны `joke-gif:*` используют реальные GIF из `assets/creator/motion`
и входят в тот же общий пул анекдотов; на `/examples` они должны идти первыми и показываться как MP4
preview.

Для motion-вариантов анекдотов разрешены только локально сохранённые Pexels/CC0/собственно
сгенерированные видеофоны без узнаваемых лиц, логотипов и чужих мем-шаблонов. Фон должен быть затемнён,
а текст — отдельным прозрачным overlay/panel поверх него. Ledger источников: `data/joke-video-backgrounds/sources.json`;
локальные mp4 хранятся в ignored `assets/fact-videos/joke-backgrounds/`.

Для паков, которыми пользуется super admin, не добавлять и не оставлять в будущей генерации пустые
`plain background + text` шаблоны. Каждая новая карточка должна иметь тематический визуальный слой:
сгенерированный или sourced фон, предмет, сцену, рамку/орнамент или другой осмысленный дизайн-элемент.
Допустимы неузнаваемые лица/силуэты, интерьер или предмет рядом с текстовой зоной, если они не
перекрывают текст, не уменьшают читаемость и не выглядят как чужой бренд, watermark или портрет
конкретного реального человека без правового основания.
Исключение — анекдоты: там допустимы простые бумажные/стикерные варианты, если текст крупный,
равномерный, читаемый и есть легкий юмористический визуальный акцент вроде emoji/doodle.

MGS-паки и MGS-шаблоны — отдельный клиентский контент. Не использовать их как базу, донор или fallback
для armen/super-admin паков, если это не запрошено явно отдельной задачей.

Текущие подготовленные текстовые joke/anecdote источники для live-блоков: `ru`, `de`, `it`, `fr`,
`en`, `pt`, а для испанского канала живой template pack `pack:chistes-es-public-domain`.
Русский блок использует отдельный prebuilt video source `fact-ru` ("Интересный факт") из
`data/fact-videos-ru`; статичный `pack:static-facts-ru-superadmin` в микс русского блока не входит.
Новые meme template packs: `pack:new-memes-de-superadmin`, `pack:new-memes-en-superadmin`,
`pack:new-memes-es-superadmin`, `pack:new-memes-fr-superadmin`, `pack:new-memes-it-superadmin`,
`pack:new-memes-pt-superadmin`, `pack:new-memes-ru-superadmin`. Они собраны из пользовательского
переведенного набора `tmp/meme/translated*` + `tmp/meme2/translated*` через
`scripts/build-translated-meme-packs.mjs`; старые `memes-*` в armen не использовать.

Не подставляй автоматически fake text deck для `ar`, `hi`, `id`. Для этих языков нужен отдельный
ingestion/safety проход:

- `ar`: лучший стартовый кандидат - QNL Arabic OCR Corpus v2:
  `https://manara.qnl.qa/articles/dataset/Arabic_OCR_Corpus_2_894_items_from_QNL_Collection_/26984785`.
  Страница датасета говорит, что OCR сделан из out-of-copyright works, QNL не заявляет copyright на
  scans/reproductions, metadata CC0. В metadata есть `البخلاء` (`i15827203`, `i15832326`) и
  `المستطرف`; для source ledger сохраняй и URL датасета, и конкретные QNL repository item URLs.
  Быстрая подготовка metadata-кандидатов: `node scripts/prepare-arabic-qnl-joke-source.mjs` пишет
  `tmp/qnl-arabic-jokes/metadata-candidates.json`, `sources.json`, `report.md` и ранжирует старые
  издания до 1929 года выше поздних. Прямой BookReader OCR endpoint у item-страниц доступен, но
  spot-check `QNL:00005095` дал сильно шумный постраничный текст; лучше извлекать из
  `QNL_ArabicOCR_Corpus-v2.zip` только нужные `.txt` во временную папку или делать ручную корректуру.
  ACO/Wikisource Juha/نوادر источники остаются кандидатами, но ACO-сканы требуют OCR, а raw Wikisource
  `أخبار الحمقى والمغفلين`/`التطفيل` уже давал религиозные, грубые или protected-class риски; не
  подключать их к `JOKE_TEXT_DECK_BY_LANG` без отдельной ручной ревизии.
- `hi`: пока не найден чистый современный Hindi joke corpus с понятной лицензией. Usable-now путь -
  Hindi Wikisource `पंचतन्त्र` и отдельные Premchand stories (`बड़े भाई साहब`, `नशा`): страницы
  помечены PD India / public domain in the USA и дают чистый HTML/export. Но это не современные
  `चुटकुले`; source-prep: `node scripts/prepare-hindi-witty-source.mjs` пишет
  `tmp/hi-witty-sources/pages.json`, `candidate-excerpts.json`, `sources.json`, `report.md`. Если
  делать pack, честно называй его "классические остроумные истории/नीति-कथाएँ" и не подключай как
  обычные анекдоты без такого позиционирования.
- `id`: лучший найденный стартовый кандидат - public-domain-by-age `Tjerita Aboe Nawas dengan Radja
  Haroenarrasid di Negri Bagdad` (1894), Commons PDF/Google Books. `pdftotext -raw` извлекает
  латинский OCR в старой Malay/Indonesian орфографии; использовать `scripts/prepare-indonesian-abunawas-source.mjs`
  для временного source ledger, глав, candidate excerpts и safety-report в `tmp/id-abunawas/`. Не
  подключать raw OCR как live-deck: в тексте есть религиозные, насильственные, gross/adult и
  protected-class фрагменты, плюс старое написание требует clean/localization workflow.

### Backlog по недостающим joke-языкам

Цель для первого подключения нового joke-языка в тематический mix - не "тысячи любой ценой", а
минимум на неделю публикации при текущем темпе блока и пропорции 80/20. После подключения можно
расширять, но только тем же source-backed способом.

Проверенные тупики/кандидаты на 2026-06-26:

- `id`: для первого source-backed прохода использовать `Tjerita Aboe Nawas dengan Radja
  Haroenarrasid di Negri Bagdad` (1894): Commons file
  `https://commons.wikimedia.org/wiki/File:Tjerita_Aboe_Nawas_dengan_Radja_Haroenarrasid_di_Negri_Bagdad.pdf`
  и Google Books metadata
  `https://books.google.com/books/about/Tjerita_Aboe_Nawas_dengan_Radja_Haroenar.html?hl=id&id=LtWpHDQB6fsC`.
  Подготовка: `node scripts/prepare-indonesian-abunawas-source.mjs`; результат только в `tmp/`, не
  live-pack. На текущем прогоне получилось 18 глав и 134 OCR-фрагмента-кандидата, но report пометил
  много safety/OCR-флагов, поэтому перед `data/anecdotes-id` нужен отдельный cleanup/localization
  workflow с вопросом пользователю о модели. `Cherita Jenaka` / `Cerita Jenaka` про Pa' Kadok,
  Pa' Pandir, Lebai Malang, Pa' Belalang, Si-Lunchai остается лучшим тематическим кандидатом, но
  нужен именно старый public-domain скан/текст. NLB Singapore показывает издание 1957 как
  `All rights reserved`, его не использовать. Internet Archive по `Cherita Jenaka`/`Cerita Jenaka`
  не дал готового full-text результата; item `biostor-176273` для `Pa' Pandir` помечен `CC BY-NC 3.0`,
  поэтому для YouTube/монетизации не подходит. `ms.wikisource.org`/`id.wikisource.org` не содержат
  готовую страницу этих рассказов.
- `hi`: `लतायफ़ हिंदी` описывается в `प्रेमसागर`/Wikisource как сборник 100 коротких историй и
  чуткулов на урду/хинди/брадж, но пока найдено только упоминание, не сам текст. Internet Archive
  по `लतायफ़ हिंदी`, `लतायफ हिंदी`, `Latayif Hindi`, `Latayif-i Hindi` не дал готового текста.
  Не брать современные сайты "Hindi jokes" без лицензии. Допустимый fallback - отдельный HI pack из
  `पंचतन्त्र`/Premchand как witty stories, с честным названием и source ledger. Текущий source-prep
  прогон дал 6 страниц и 204 фрагмента-кандидата, но с большим количеством violence/religion/adult/
  protected-class/politics флагов; без clean/abridgement workflow live-deck не делать.
- `ar`: QNL Arabic OCR Corpus v2 - лучший технический кандидат для первого source-backed pack:
  metadata скачивается маленьким CSV, OCR zip большой (~1 GB), поэтому скачивай временно только если
  реально строишь pack и удаляй после извлечения нужных `.txt`. `prepare-arabic-qnl-joke-source.mjs`
  сейчас находит 60 metadata-кандидатов; топ после age-safe ранжирования - старые издания
  `المستطرف` 1851/1883/1894 и `البخلاء` 1907/1900. Random IA Juha/community uploads без rights/license
  не использовать. Arabic Wikisource содержит `أخبار الحمقى والمغفلين`, `التطفيل` и related
  `جحا`/`نوادر`, но raw automatic extraction уже давал protected-class, adult/gross и религиозные
  риски; допустим только отдельный ручной curated pack с safety pass.
- общий переводной вариант: Project Gutenberg `The Turkish Jester; or, The Pleasantries of Cogia
  Nasr Eddin Effendi` (`https://www.gutenberg.org/ebooks/16244`) помечен как not copyrighted /
  public-domain in the USA и подходит как legal source base для будущих localized Nasreddin/Juha-style
  joke packs. Это не "готовый локальный корпус": перед переводом/адаптацией на `ar`/`hi`/`id` нужен
  отдельный LLM/localization workflow с вопросом пользователю о модели, source ledger и safety pass.

Проверенные кандидаты/тупики для `ro`/`cs`/`nl` на 2026-07-08:

- Жесткий вывод по modern pass `1950+`: готовых native-корпусов `ro`/`cs`/`nl` на ~1500
  YouTube-safe карточек с коммерчески пригодной открытой лицензией пока не найдено. Нельзя добивать
  объем придуманными LLM-анекдотами. Если легальный source меньше target, pack остается маленьким или
  нужен отдельно согласованный source-backed translation/adaptation workflow.
- `ro`: лучший найденный источник - Internet Archive
  `https://archive.org/details/0228-diversi-de-ale-lui-pacala-snoave-populare-1964`
  (`De-ale lui Păcală. Snoave populare`, 1964), `licenseurl=https://creativecommons.org/publicdomain/mark/1.0/`,
  OCR `0228 diverși, De-ale lui Păcală Snoave populare, 1964_djvu.txt` (~258 KB). Это source-backed
  кандидат для маленького Romanian pack, но не на 1500 карточек: в книге много разделов про попов,
  армию, политику/классовую сатиру, поэтому нужен строгий safety pass. Wikisource `Categorie:Snoave` и
  `Snoave sau povești populare` (`https://ro.wikisource.org/wiki/Categorie:Snoave`,
  `https://ro.wikisource.org/wiki/Snoave_sau_pove%C8%99ti_populare`) тоже source-backed кандидаты, но
  там мало страниц. Modern rejects: IA `Bancuri1` (2014) найден без `licenseurl`, IA `Basme, legende,
  snoave` (1960) имеет `CC BY-NC-ND 4.0`, а infoarena forum `bancuri` (2006) имеет только
  `CC BY-NC 2.5` и содержит protected-class/unsafe jokes; не использовать для YouTube pack.
  Modern candidate `https://github.com/tutyamxx/Romanian-Jokes-API` имеет MIT repo и README "Over 600
  jokes available", но joke DB не лежит в repo (только Mongo wrapper), Heroku API сейчас `404 No such
  app`, а лицензия самих данных не доказана; не использовать как готовый source, пока нет export или
  author confirmation на данные. Internet Archive `https://archive.org/details/ispraviile-lui-pacala-petre-dulfu`
  помечен Public Domain Mark, но OCR-издание внутри говорит `Toate drepturile rezervate` для издания
  2001; не использовать без отдельной rights-проверки.
- `cs`: найден Internet Archive `https://archive.org/details/valecne-anekdoty-1939-1945`
  (`Válečné Anekdoty 1939 1945`, 1945),
  `licenseurl=https://creativecommons.org/publicdomain/zero/1.0/`, OCR ~214 KB. Это явный CC0
  источник, но он военный/политический, старше requested 1950+, и почти весь должен резаться для
  YouTube-safe joke pack. `Smích za železnou oponou` (1952) найден, но без licenseurl; не использовать,
  пока права не доказаны. Modern open candidate: JokeAPI v2 (`https://v2.jokeapi.dev/info`,
  source `https://git.sv443.net/Sv443/JokeAPI-v2`) MIT 2018-2025, но `jokes-cs.json` содержит только
  4 Czech jokes, из них safe-mode count = 2; можно считать tiny seed, не pack. Czech Wikisource содержит
  `Židovské anekdoty`, но это protected-class тема и не подходит для безопасного YouTube-пака.
- `nl`: найден старый public-domain кандидат Internet Archive
  `https://archive.org/details/vermakelijkeane00lenngoog` (`Vermakelijke anekdoten, en historische
  herinneringen`, 1870), OCR ~484 KB; это не 1950+ и язык старый, но по возрасту/source notice это
  чистый Dutch кандидат. Более удобная копия того же текста есть в Gutenberg mirror на IA:
  `https://archive.org/details/vermakelijkeanek37402gut`, rights `Public domain in the USA`.
  Internet Archive `https://archive.org/details/1851JoligeReisNaarDeTentoonstellungTeLondon` имеет
  Public Domain Mark, но это travel-humor, а не готовая база коротких moppen. Современные Dutch
  moppen-книги на IA (`1001 moppen`, `101 leuke moppen`, `De 249 beste moppen` и т.п.) без открытой
  лицензии/обычно borrow-only; не использовать. IA modern search `1950+` также нашел `1001 moppen &
  cartoons` (1992) и `Een vlieg op je vork: moppen en raadsels` (2013), оба `NO_LICENSE`; не использовать.
  Research-корпус `Dutch Humor Detection by Generating Negative Examples` сообщает про 3235 собранных
  jokes из Kidsweek/DeBesteMoppen/LachJeKrom; GitHub repo без license и jokes scraped из сторонних сайтов,
  поэтому не использовать как YouTube corpus без отдельной лицензии/разрешения. HumorDB на Hugging Face
  имеет `CC BY 4.0`, но это visual-humor/image dataset, не текстовый native Dutch/Romanian/Czech corpus.

## Общее правило озвучки

Если новый или пересобираемый ролик требует голос, по текущему правилу пользователя используй
бесплатный `edge-tts` в `.venv-tts/` (Microsoft Edge neural voices), потому что ElevenLabs-квота
исчерпана. Не запускай ElevenLabs для новых voiceover-паков без отдельного подтверждения.

Старые ElevenLabs-кэши и скрипты можно читать/переиспользовать, если они уже лежат на диске, но нельзя
печатать реальные ключи в логи, markdown, код, frontend, БД или git diff. В логах допустимы только
номер ключа и last4/hint. Если всё-таки отдельно согласован ElevenLabs-запуск: `401`/invalid key -
следующий ключ; `402`/quota exceeded - считать ключ исчерпанным до reset; `429` - backoff + повтор.
Для `edge-tts` word-level alignment нет, поэтому субтитры таймить по длительности mp3/скорости чтения
или использовать pack-specific caption timing; не подменяй это Whisper без отдельной причины.

Немое кино не считать приоритетным рутинным форматом: пользователь отклонил это направление как слабое.
Если когда-нибудь оно понадобится отдельно, брать только public-domain source, удалять исходный звук и
сначала согласовать формат.

## Общее правило текста и субтитров для Shorts

Для вертикальных Shorts/TikTok/Reels нельзя ставить важный текст в самый низ кадра: мобильный UI
YouTube Shorts перекрывает нижнюю часть видео кнопками, описанием, названием канала, CTA/subscribe и
полем комментария. Это правило относится не только к субтитрам, но и к card-style тексту, логотипам,
CTA и любым важным подписям. Для `1080x1920` держи важный текст примерно в центральной safe-zone:

- абсолютный нижний предел для важного текста: `y <= 1520` (нижние `400px` оставлять под UI);
- лучше держать нижний край body/subtitles около `y ~= 1320-1450`, а источник/мелкие подписи не ниже
  `y ~= 1450`;
- не вплотную к правому краю, где стоят лайк/дизлайк/комментарии/поделиться: целевой правый край
  важного текста `<= 960px`, правый запас около `120-160px`;
- не клади важный текст поверх нижних `390-500px`;
- если тексту тесно, увеличивай/перекомпоновывай текстовую область внутри safe-zone, а не мельчи
  основной шрифт и не опускай текст в самый низ;
- проверяй кадр в мобильном Shorts-просмотре или хотя бы на screenshot/contact-sheet с типичным правым
  UI и нижним overlay.

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

**Пак сразу должен быть РАБОЧИМ в проекте (MANDATORY, прямое требование пользователя 2026-06-23).**
Даже если добавляешь всего несколько карточек «для примера» — за тот же заход доведи пак до полностью
интегрированного, ЗАПУСКАЕМОГО состояния, а НЕ оставляй его как превью-картинки на диске
(`data/output/*`). «Рабочий» значит: пак виден в Студии / `/api/generators` (или как живой
`data/packs/*`), реально рендерится и генерится с канала, фронт пересобран (`npm run web:build`), а при
правках бэкенда сервер перезапущен. Для встроенной деки это весь путь: `src/anecdotes/decks.ts` (запись +
флаг + `DECK_LANG`) → `src/anecdotes/library.ts` (загрузчик `cards.json`) → `src/anecdotes/render.ts`
(диспетч + рендер-функция) → `src/anecdotes/yt-meta.ts` (читаемые title/description) → веб
`web/src/lib/deck.ts` (`DECK_LANG` + при необходимости `BUILTIN_DECKS`/`DECK_GLOSS_RU`). Проверь рендер
реальными кадрами и покажи пользователю, ГДЕ это на сайте (а не локальный путь к файлу).

## Формат по умолчанию для статичных паков

По умолчанию новый статичный/card-style пак должен быть динамическим: карточки, тексты, шаблоны и
ассеты хранятся как данные/template-pack, а MP4 собирается только при использовании, batch-генерации
или сохранении в библиотеку конкретного канала. Не создавай заранее сотни/тысячи тихих MP4 для
статичных карточек, если пользователь прямо не попросил prebuilt MP4.

Prebuilt MP4 допустимы как исключение для готовых монтажных/video-source паков, озвученных серий,
индивидуальных визуальных MP4 или уже существующих legacy prebuilt decks. Для нового статичного пака
prebuilt MP4 считается исключением и требует явного запроса пользователя.

## Общее правило для длинных видео

`longVideo` / длинные сборники не делаются как Shorts. По умолчанию это обычное горизонтальное видео:

- размер кадра строго `1920x1080`;
- картинка каждой сцены статичная: один читаемый PNG/card на весь анекдот, без zoompan, camera motion и
  прочего движения внутри сцены;
- между анекдотами нужны плавные переходы (`fade`), чтобы смена карточек не била по глазам;
- музыка должна быть одной цельной дорожкой на весь ролик, без рестарта/смены на каждом анекдоте;
- для длинных видео держи отдельную музыку в `assets/audio/long-videos/`, только license-safe /
  no-copyright;
- исключение для исламских long-video: не ставь обычную музыку и инструменты. Используй только
  тихий немелодический фон без инструментов из `assets/audio/islamic/` или тишину; фон тоже должен
  идти одной цельной дорожкой на весь ролик;
- громкость музыки низкая, чтобы не мешать чтению;
- длительность сцен считай по символам, чтобы человек успел спокойно прочитать текст.
- у long-video пака сразу должны быть готовые YouTube `title`, `description`, `hashtags` и `tags`;
  не наследуй `#shorts` в названии/описании/тегах;
- `description` должен быть зрительским и естественным: что это за выпуск, зачем смотреть, какой тон /
  настроение. Не пиши внутренние детали сборки вроде "из встроенной деки", "33 анекдота",
  "public-domain музыка", "читабельный видеосборник"; такие сведения держи в `sources.json`, а не в
  описании для YouTube;
- использованные исходные элементы нужно вести в отдельном ledger/usage-файле пака. Для длинных
  выпусков нельзя повторно брать анекдот/карточку, чей `sourceId` уже был в предыдущем длинном ролике;
- long-video паки не являются источниками расписания канала: канал включает их отдельной галочкой,
  готовый MP4 добавляется в библиотеку вручную, а публикация идет отдельной кнопкой «Выложить».

## Быстрая карта паков

| Пак / deck | Где результат | Как появляется контент | LLM нужен |
|---|---|---|---|
| `ru` Русские анекдоты | `data/anecdotes/` | локальный текст `local-assets/Русские анекдоты/anek_djvu.txt`; текущая плотная дека дополнена pipeline пар коротких шуток | да, если отбирать/тематизировать пары |
| `de` Deutsche Witze | `data/anecdotes-de/` | локальный SQL-корпус `local-assets/corpora/witze.sql` -> фильтр/дедуп | нет для сборки; нужен только workflow заголовков |
| `fr` Blagues françaises | `data/anecdotes-fr/` | локальный JSON `local-assets/corpora/blagues.json` -> safe categories | нет для сборки; нужен только workflow заголовков |
| `it` Barzellette Italiane | `data/anecdotes-it/` | текущий плотный вариант из `local-assets/corpora/it-gen/clean-*.json` | да, для чистки кандидатов; сборка локальная |
| `psych` Psychologie (DE) | `data/psych/cards.json` | структурные карточки по `docs/psych-cards-standard.md` | обычно да, но можно загрузить вручную |
| `islamic` آيات وأذكار | `data/islamic/cards.json` | точные интернет-корпусы -> локальные slices -> workflow выбора id -> assemble | да, только для выбора id/theme |
| `christian` Holy Bible KJV | `data/christian/cards.json` | KJV public domain -> candidates/slices -> workflow выбора id -> assemble | да, только для выбора id/theme |
| `islamic-quotes-ar` اقتباسات إسلامية | `data/islamic-quotes-ar/titled.json` | 700 quote-card записей, выведенных из точного `data/islamic/cards.json` без портретов | нет |
| `christian-quotes-en` Christian Quotes | `data/christian-quotes-en/titled.json` | 700 quote-card записей, выведенных из public-domain KJV `data/christian/cards.json` без портретов | нет |
| `fact-en` Interesting Facts / `fact-ru` Интересный факт | `data/fact-videos/videos.json`, `data/fact-videos-ru/videos.json` + `assets/fact-videos/` | готовые MP4; RU deck использует русские title/text для тех же локальных MP4 | не в рантайме; новые ролики собираются вне этого конвейера |
| `quotes-de` Politiker-Zitate | `data/quotes-de-combined/videos.json` + `assets/fact-videos/` | единый статичный немецкий quote-card MP4 deck | не в рантайме |
| `quotes-ru` / `quotes-en` / `quotes-es` / `quotes-*` static quote decks | `data/quotes-*/titled.json` | sourced Wikiquote/Wikimedia portrait quote cards, rendered dynamically | нет для рантайма; да, для новых curated batches |
| `quote-video-*` voiced quote decks | `data/quotes-*/titled.json`, `data/quote-video-de/titled.json` | те же sourced quote cards, но runtime собирает ролик с voiceover через edge-tts | нет для выбора карточки; да, если расширять/чистить источники |
| `prayers-de` Gebete | `data/prayers-de/videos.json` + `assets/fact-videos/prayers-de/` | 1000 готовых немецких молитвенных card-style MP4 без тега: примерно 250 про детей/семью и 750 общих молитв | нет |
| `prayers-en` Christian Prayers | `data/prayers-en/videos.json` + `assets/fact-videos/prayers-en/` | готовые английские prayer-card MP4 с оригинальным devotional-текстом и локальным HTML/CSS-шаблоном, без внешних медиа | нет |
| `space` Space | `data/space/videos.json` + `assets/fact-videos/space/` | готовые MP4 | не в рантайме |
| `animal-superheroes` / `animal-superheroes-en` ЗвероГерои / Animal Heroes | `data/output/admin-demos/manifest.json` + `data/animal-superheroes*/videos.json` + `assets/fact-videos/animal-superheroes*/` | сериальные MP4-комиксы RU/EN с одинаковым визуалом, ElevenLabs-озвучкой и safe-zone karaoke-субтитрами | нет |
| `long-anecdotes-ru` Русские анекдоты | `data/long-anecdotes-ru/videos.json` + `assets/fact-videos/long-anecdotes-ru/` | длинный MP4-сборник из коротких читаемых сцен RU-анекдотов под музыку | нет |
| `long-anecdotes-soul-ru` Русские анекдоты | `data/long-anecdotes-soul-ru/videos.json` + `assets/fact-videos/long-anecdotes-soul-ru/` | отдельный длинный MP4-пак из custom pack `data/packs/анекдоты-ру-впн-mqe5ovw1.json` | нет |
| `long-islamic-ar` القرآن والحديث والدعاء | `data/long-islamic-ar/videos.json` + `assets/fact-videos/long-islamic-ar/` | отдельный длинный MP4-пак для исламского канала из точных карточек `data/islamic/cards.json`, с немелодическим фоном без инструментов | нет |
| `long-christian-en` The Faithful Journey | `data/long-christian-en/videos.json` + `assets/fact-videos/long-christian-en/` | отдельный длинный MP4-пак для английского христианского канала из точных KJV-карточек `data/christian/cards.json` | нет |
| `The Mind Edge` template-pack | `assets/template-packs/the-mind-edge/` -> `data/packs/` seed | LLM-батчи -> `cards.json`, шаблоны из кода | да, для новых карточек |
| `psychology-mgs` template-pack | `assets/template-packs/psychology-mgs/` -> `data/packs/` seed | карточки + 40 шаблонов | зависит от источника новых карточек |
| `Curiosaurs English Facts` template-pack | `assets/template-packs/curiosaurs-english/` -> `data/packs/` seed | локальный набор kid-safe facts + PNG-шаблоны | нет |
| `Chistes ES` template-pack | `local-assets/corpora/spanish-jokes-public-domain/` + `assets/template-packs/spanish-jokes*/` -> `data/packs/chistes-es-public-domain.json`, `data/packs/chistes-es-long.json` | public-domain Spanish joke books -> local safety/quality filter -> фактическое число safe-карточек + 30 short templates + 42 length-aware long templates | нет для локальной сборки; да, спросить модель перед LLM-чисткой/адаптацией |
| `visual-riddles` Вижу Ответ | `data/output/admin-demos/manifest.json` + `data/visual-riddles/videos.json` + `assets/fact-videos/visual-riddles/` | legacy/admin demo MP4; не подключать к armen-блокам и не использовать как super-admin source | нет |

`data/packs/*.json` - это живые пользовательские паки из страницы "Карточки". Они gitignored и
пополняются через UI/API или seed-скрипты. Встроенные деки (`data/anecdotes*`,
`data/islamic`, `data/christian`, `data/*/videos.json`) работают через статический реестр
`src/anecdotes/decks.ts`.

Для template-pack не вводи бизнес-лимит на количество шаблонов в одном паке: `validateTemplateList`
проверяет каждый шаблон по security-правилам, но не должен запрещать большие наборы только из-за
числа шаблонов. Если нужен технический лимит, обоснуй его отдельно как защиту конкретного API/размера
payload, а не как правило генерации контента.

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

## Long video pack: `long-anecdotes-ru`

Это новый тип встроенного видео-пака: `preFact + longVideo`. Он виден как отдельный длинный видеотип,
но использует тот же безопасный runtime-контракт, что и другие prebuilt-деки: генерация не рендерит
текст заново, а копирует готовый MP4 из `assets/fact-videos/long-anecdotes-ru/` в библиотеку канала.

Где что лежит:

- исходные тексты: существующая RU-дека `data/anecdotes/titled.json`;
- сборщик: `scripts/build-long-anecdotes-ru.mjs`;
- расчет сцен: `data/long-anecdotes-ru/scenes.json` для выпуска 1 и `scenes-00N.json` для следующих;
- общий ledger использованных анекдотов: `data/long-anecdotes-ru/usage.json`;
- регистрация для runtime: `data/long-anecdotes-ru/videos.json` и `data/long-anecdotes-ru/index.json`;
- source/music ledger: `data/long-anecdotes-ru/sources.json`;
- финальный локальный MP4: `assets/fact-videos/long-anecdotes-ru/long-anecdotes-ru-001.mp4`;
- контакт-лист проверки: `data/output/long-anecdotes-ru/contact.jpg`.

Названия выпусков в `videos.json` должны быть разнообразными и человеческими. Не оставляй однотипные
`Выпуск N` / `Episode N` как финальный YouTube title, если только это не часть нормального названия.

Пересборка:

```bash
node --import tsx scripts/build-long-anecdotes-ru.mjs --dry-run
node --import tsx scripts/build-long-anecdotes-ru.mjs
# без повторного рендера MP4: пересобрать только usage.json из готовых scenes/videos
node --import tsx scripts/build-long-anecdotes-ru.mjs --write-usage

# отдельный long-video пак «Русские анекдоты», не добавляет выпуски в библиотеку канала
LONG_VIDEO_PROFILE=soul EPISODE_START=1 EPISODE_COUNT=2 node --import tsx scripts/build-long-anecdotes-ru.mjs --dry-run
LONG_VIDEO_PROFILE=soul EPISODE_START=1 EPISODE_COUNT=2 node --import tsx scripts/build-long-anecdotes-ru.mjs
```

Скрипт не запускает LLM и не скачивает интернет-источники. Первый выпуск использует фиксированный
allow-list id из `data/anecdotes/titled.json`, потому что в общей RU-деке есть взрослые/политические
и токсичные шутки. Если пополняешь выпуск вручную, сначала проверь тексты глазами и только потом меняй
`FIRST_SERIES_IDS`. Если нужно именно интернет-ранжирование "топ популярных", сначала отдельно проверь
лицензию источника; не копируй тексты с сайтов анекдотов без понятных прав.

Учёт использованных анекдотов обязателен. `usage.json` содержит все `sourceId`, которые уже попали в
длинные MP4, с привязкой к конкретному ролику и порядку сцены. Скрипт сверяет новые выпуски с уже
готовыми `videos.json`/`scenes*.json` и падает при повторе, если это не намеренная пересборка того же
самого файла. Перед добавлением новых выпусков проверь:

```bash
node --import tsx scripts/build-long-anecdotes-ru.mjs --write-usage
node --input-type=module -e 'import fs from "node:fs"; const u=JSON.parse(fs.readFileSync("data/long-anecdotes-ru/usage.json","utf8")); console.log(u.totalVideos, u.totalScenes, new Set(u.usedSourceIds).size)'
```

Профиль `LONG_VIDEO_PROFILE=soul` пишет отдельный deck `long-anecdotes-soul-ru`:

- источник: `data/packs/анекдоты-ру-впн-mqe5ovw1.json` — custom pack русских анекдотов;
- каждая карточка пакa разбивается на отдельные сцены по элементам массива `values.text`;
- результат: два готовых MP4 в `assets/fact-videos/long-anecdotes-soul-ru/`;
- runtime-регистрация: `data/long-anecdotes-soul-ru/videos.json`;
- ledger: `data/long-anecdotes-soul-ru/usage.json`;
- это именно отдельный long-video pack. Не добавляй эти MP4 в библиотеку канала автоматически: канал
  должен видеть пак с доступными роликами, а добавление в библиотеку выполняется отдельной кнопкой.

Формат и визуальные правила этого пака следуют общему правилу длинных видео:

- финальный MP4: обычный горизонтальный `1920x1080`, не вертикальный Shorts;
- каждая сцена рендерится как статичная landscape-карточка, без zoom/pan;
- между анекдотами стоит мягкий fade-in/fade-out;
- музыка берётся из отдельной папки `assets/audio/long-videos/`;
- текущая музыка: `assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus`;
- источник: Wikimedia Commons, `File:Swingin' the Operas by Fats Waller (1939, Jazz piano).opus`;
- Commons помечает файл как Public Domain / free of known copyright restrictions, длительность около
  `10:01`;
- финальный MP4 мапит эту длинную композицию как одну дорожку на весь ролик, без лупа и без
  перезапуска музыки на сценах.

Тайминг сцены считается по символам:

```text
durationSec = clamp(11, 18, ceil((chars / 22 + 3) * 0.88))
```

Это текущий сокращённый на ~12% режим чтения. Зритель получает примерно 11-18 секунд на карточку,
а новые выпуски собираются примерно в 7-10 минут.
Переходы делаются через мягкий fade-in/fade-out `0.8s`. README исходной папки
`assets/audio/anekdoty/` помечает текущие джазовые фрагменты как Public Domain.

Проверка после сборки:

```bash
node --input-type=module -e 'import fs from "node:fs"; for (const p of ["data/long-anecdotes-ru/videos.json","data/long-anecdotes-ru/usage.json","data/long-anecdotes-ru/sources.json"]) console.log(p, Array.isArray(JSON.parse(fs.readFileSync(p,"utf8"))) ? JSON.parse(fs.readFileSync(p,"utf8")).length : "ok")'
for f in assets/fact-videos/long-anecdotes-ru/long-anecdotes-ru-00*.mp4; do ffprobe -hide_banner -v error -show_entries format=duration -of default=nw=1:nk=1 "$f"; done
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x assets/fact-videos/long-anecdotes-ru/long-anecdotes-ru-001.mp4
```

### Long Islamic (`long-islamic-ar`)

Отдельный long-video pack для канала `القرآن والحديث والدعاء`.

- источник точного текста: `data/islamic/cards.json`;
- сборщик: `scripts/build-long-islamic-ar.mjs`;
- результат: `assets/fact-videos/long-islamic-ar/long-islamic-ar-00N.mp4`;
- runtime-регистрация: `data/long-islamic-ar/videos.json`;
- ledger использованных карточек: `data/long-islamic-ar/usage.json`;
- контакт-листы: `data/output/long-islamic-ar/contact-long-islamic-ar-00N.jpg`.

Исламские длинные видео используют одну длинную мелодичную дорожку из общего long-video пула:

```text
assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus
```

Шумовые ambient/drone-подложки здесь не используются.

Пересборка 5 выпусков по 7-11 минут:

```bash
node --import tsx scripts/build-long-islamic-ar.mjs --dry-run
node --import tsx scripts/build-long-islamic-ar.mjs
node --import tsx scripts/build-long-islamic-ar.mjs --write-usage
```

Тайминг сцены считается по арабским символам:

```text
durationSec = clamp(16, 48, ceil(chars / 18 + 9))
```

Как и в остальных long-video паках, не добавляй MP4 в библиотеку канала автоматически: канал включает
пак отдельной галочкой, затем вручную забирает нужный готовый ролик в библиотеку.

### Long Christian (`long-christian-en`)

Отдельный long-video pack для английского христианского канала `The Faithful Journey`.

- источник точного текста: `data/christian/cards.json` (KJV);
- сборщик: `scripts/build-long-christian-en.mjs`;
- результат: `assets/fact-videos/long-christian-en/long-christian-en-00N.mp4`;
- runtime-регистрация: `data/long-christian-en/videos.json`;
- ledger использованных карточек: `data/long-christian-en/usage.json`;
- контакт-листы: `data/output/long-christian-en/contact-long-christian-en-00N.jpg`.

Сборщик не переписывает Bible text и не запускает LLM: он берёт готовые KJV-карточки, рассчитывает
время чтения по символам, рендерит статичные landscape-карточки `1920x1080` и добавляет мягкие fades.
YouTube title/description/tags берутся из метаданных пака и должны звучать естественно для зрителя.

Звук:

```text
assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus
```

Это одна длинная мелодичная дорожка для всего ролика; ambient/pad-подложки больше не используются.

Пересборка 10 выпусков по 7-11 минут:

```bash
node --import tsx scripts/build-long-christian-en.mjs --dry-run
node --import tsx scripts/build-long-christian-en.mjs
node --import tsx scripts/build-long-christian-en.mjs --write-usage
```

Тайминг сцены считается по английским символам:

```text
durationSec = clamp(24, 44, ceil(chars / 15 + 8))
```

Как и в остальных long-video паках, не добавляй MP4 в библиотеку канала автоматически: канал включает
пак отдельной галочкой, затем вручную забирает нужный готовый ролик в библиотеку.

## Chistes ES: испанские анекдоты без API

Это живой template-pack для страницы «Карточки». Он не держится за фиксированные 1000 штук: сборщик
берёт фактическое число фрагментов, прошедших локальный safety/quality-фильтр. Если правила
ужесточаются, итоговое число карточек может уменьшиться, и это нормально. Текущая строгая сборка
делает два отдельных пака: основной короткий `Chistes ES` и длинный `Chistes ES Long`.

Источники и права:

- сырые тексты лежат в `local-assets/corpora/spanish-jokes-public-domain/raw/*.txt`;
- ledger источников: `local-assets/corpora/spanish-jokes-public-domain/sources.json`;
- safety-report основного пака: `local-assets/corpora/spanish-jokes-public-domain/safety-report.json`;
- safety-report длинного пака: `local-assets/corpora/spanish-jokes-public-domain/safety-report-long.json`;
- основные источники: Internet Archive scans of `El Tesoro de los chistes` (1847), `Museo cómico`
  (1863), `El libro de los cuentos` Rafael Boira (1862), `Floresta Española` (1790) and
  `Cuentos, fábulas, diálogos, máximas, apotegmas, epigramas y dichos agudos` (1848);
- IA/Wikisource evidence указывает public-domain/`NOT_IN_COPYRIGHT` там, где источник это отдаёт, но
  для коммерческого масштабирования всё равно сохраняй source ledger рядом с паком.

Готовые артефакты:

- фоны основного пака image generator: `assets/template-packs/spanish-jokes/backgrounds/bg-*.jpg`;
- фоны длинного пака: `assets/template-packs/spanish-jokes-long/backgrounds/bg-*.svg`; стиль основан на
  imagegen-референсе, но финальные фоны контролируемые SVG без текста, логотипов и шумных геометрических
  блоков за body;
- дополнительные scenic-фоны длинного пака: `assets/template-packs/spanish-jokes-long/backgrounds/scene-*.jpg`,
  копируются из старого набора `assets/backgrounds/russian_jokes/` и адаптируются через JSON-шаблоны с
  индивидуальными safe-зонами;
- шаблоны основного пака: `assets/template-packs/spanish-jokes/templates/*.json`;
- выбранные карточки основного пака + evidence: `assets/template-packs/spanish-jokes/selected-cards.json`;
- шаблоны длинного пака: `assets/template-packs/spanish-jokes-long/templates/*.json`;
- выбранные длинные карточки + evidence: `assets/template-packs/spanish-jokes-long/selected-cards.json`;
- живые паки: `data/packs/chistes-es-public-domain.json` и `data/packs/chistes-es-long.json`.

Правила раскладки шаблонов:

- каждый шаблон обязан иметь явную большую текстовую зону/панель поверх фона, а не класть body
  напрямую на декоративную картинку;
- рабочая зона текста держится примерно в `y=300..1450`; важный body-текст не опускать в нижние
  `400px` Shorts-кадра и не заводить правее `x=960`;
- основной пак: `title` около `50-54px`, `body` до `40-42px`, `fitMin` не ниже `28px`, body
  вертикально центрировать внутри своей зоны, чтобы короткие анекдоты не прилипали к верху;
- длинный пак: базово брать тексты примерно `260..620` символов и раскладывать их по length-aware
  шаблонам, потому что сервер/Shareboard выбирает шаблон как `cardIndex % templates.length`. Сейчас
  long-пак держит 42 шаблона: слоты `1..21` compact для `<320` символов (`body` около `54px`, низ body
  примерно `y=1012..1028`, низ панели `y=1108..1128`), слоты `22..28` medium для `320..399`
  символов (`body` около `51px`, низ body примерно `y=1216..1228`, низ панели `y=1312..1324`), слоты
  `29..32` full для `>=400` символов (`body` около `48px`, низ body примерно `y=1348..1356`, низ
  панели `y=1444..1452`), слоты `33..42` scenic для старых фото-фонов (`body` около `40..44px`, низ
  body примерно `y=661..1341`, низ панели примерно `y=735..1415`). Перед записью long-пака карточки
  сортируются по этим слотам; не возвращай
  всем карточкам одну огромную панель, иначе появится пустой белый лист. `fitMin` не ниже `32px`,
  `maxChars` около `650`, body выравнивать сверху; если stress-render давит текст, лучше поднять или
  расширить область внутри safe-zone либо выкинуть карточку, а не мельчить шрифт дальше и не уходить в
  нижний YouTube UI;
- scenic-добавка берёт только safe-уникальные неиспользованные кандидаты из уже очищенного корпуса. Не
  повторяй тексты ради заполнения шаблонов: текущая строгая сборка нашла `7/10` новых неиспользованных
  кандидатов и честно дала long-пак `71` карточку вместо искусственного добора повторами. Кандидаты
  короче `180` символов оставляются в обычных compact-слотах, а не в scenic-шаблонах, чтобы на
  фото-фонах не появлялась пустая бумажная область;
- внутренние поля слева/справа не меньше `60px`; source должен оставаться читаемым и не попадать на
  листья/яркие углы/границы;
- перед показом пользователю рендерить stress-пример на каждый шаблон и смотреть контакт-лист глазами;
- main body не должен быть на агрессивной цветовой плашке; насыщенные цвета допустимы только для
  коротких меток/акцентов.

Safety note: семейные сетапы сами по себе разрешены для испанских анекдотов, потому что в
public-domain сборниках они встречаются постоянно; при этом фильтр всё равно выкидывает adult/sexual,
protected-class stereotypes, religion, politics/crime/authority, alcohol/drugs, violence/death,
dependency/slavery-risk, coarse insults and OCR fragments. Не возвращай broad-ban по словам вроде
`madre`, `padre`, `mujer`, `marido`, иначе пак снова схлопнется до слишком малого числа карточек.

Пересборка:

```bash
node scripts/build-spanish-jokes-pack.mjs
```

Скрипт не скачивает raw-файлы сам. Если raw-файлы отсутствуют, он выведет точные `curl`-команды для
скачивания `FULL TEXT` без API. Старые `chistes-es-preview.json` / `chistes-es-1000.json` удаляются
сборщиком, чтобы в UI не висели устаревшие варианты. После пересборки проверь шаблоны и stress-render:

```bash
node --import tsx --experimental-sqlite --input-type=module - <<'EOF'
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateTemplateList, renderTemplateCard } from './src/template/render.ts';
await mkdir('data/output/packs', { recursive: true });
for (const file of ['data/packs/chistes-es-public-domain.json', 'data/packs/chistes-es-long.json']) {
  const pack = JSON.parse(readFileSync(file, 'utf8'));
  validateTemplateList(pack.templates);
  const longest = [...pack.cards].sort((a, b) => b.values.text.length - a.values.text.length);
  for (let i = 0; i < pack.templates.length; i++) {
    const card = longest[i % longest.length];
    await renderTemplateCard(pack.templates[i], card.values, resolve('data/output/packs', `${pack.id}-template-${String(i + 1).padStart(2, '0')}.png`));
  }
}
EOF
```

Не запускай LLM-чистку/адаптацию молча: сначала спроси пользователя, какой моделью запускать
workflow. Локальную regex-фильтрацию можно делать без вопроса, но она не заменяет ручную/LLM-проверку
старых шуток на protected-class stereotypes, религию, секс, насилие, болезни, детей/семью,
алкоголь/наркотики, политику/криминал, возрастные шутки, классовые оскорбления и OCR-мусор.

## Советские постеры (`soviet-posters-ru`)

RU-only curated public-domain pack. It is retired from armen's active source mix. Existing
library videos may still be consumed by the scheduler with the special rare-posting path, but do
not add it back to block source groups, channel sources, slot decks, pickers or new generation.

Build it only for maintenance with:

```bash
node scripts/build-soviet-posters-pack.mjs
```

Source folder can be either `local-assets/soviet-posters-pd/` (preferred, ignored) or temporary
`assets/soviet-posters-pd/`. The script writes compressed runtime images to
`assets/template-packs/soviet-posters/backgrounds/`, a small source ledger to
`assets/template-packs/soviet-posters/sources.json`, rejected-source ledger to
`assets/template-packs/soviet-posters/excluded-sources.json`, and the live custom pack to
`data/packs/soviet-posters-ru.json`.

Rules:
- existing library videos can be posted through `server/infra/scheduler.ts` at about 10% chance until
  the channel's old poster queue is empty;
- do not localize, auto-replenish or generate new armen library videos from this pack;
- keep `autoExpireMode: "per_account"` for historical/source-integrity behavior, but do not rely on it
  to keep the pack visible in the current block mix;
- do not set `repeatMode` for this pack and do not make it infinite/reusable again;
- use only source-ledger PD files;
- keep the script's explicit `VISUAL_SAFE_POSTER_FILES` allowlist: this pack is intentionally small
  and neutral rather than a broad Soviet-poster dump;
- never restore anything in `excluded-sources.json` without a fresh manual safety pass;
- exclude protected-class wording and obsolete/offensive terms such as `негр`;
- do not add anti-religious satire, Stalin-cult material, racial/ethnic stereotypes, dehumanizing
  enemy framing, repression/security-service framing, war/weapon/call-to-kill propaganda, graphic
  war/death imagery, unclear film posters, or files without a clear PD ledger.

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
- `tmp/animal-superheroes/gpt-image2/generated_scenes/<episode_id>/scene_01.png...` - визуальные сцены;
- `tmp/animal-superheroes/voice-jessica/` - ElevenLabs voice cache;
- `tmp/animal-superheroes/youtube/` - avatar/banner/name/description для RU и EN каналов.

Музыка: `Sunflower Valley` by `isaiah658`, OpenGameArt, CC0. Источник и license evidence записаны в
`tmp/animal-superheroes/sources.json`.

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

Важно для текущей armen-сетки: `visual-riddles*` больше не является источником super-admin блоков.
Не добавляй его обратно в `russian`, `quotes`, `religion`, `sourceDecks` или `slotDecks` armen без
нового прямого решения пользователя.

### Текущий пайплайн дозаливки (edge-tts, без ElevenLabs) — обновлено 2026-06-22

ElevenLabs-квота исчерпана → озвучка этого пака идёт через **edge-tts** (бесплатные нейроголоса
Microsoft Edge, голос `ru-RU-DmitryNeural`) в изолированном venv `.venv-tts/` (gitignored: `edge-tts`
+ `pillow` + `cairosvg`). Это намеренное послабление общего правила «только ElevenLabs» для ДАННОГО
пака. Контент — ТОЛЬКО реально найденные готовые PD/CC0-загадки из интернета (не генерируем и не
компонуем из клипарта); строго PD/CC0 (без CC-BY/CC-BY-SA — копилефт «заражает» монетизацию).

Тулинг (committed, воспроизводимо):
- `templates/visual-riddle.html` — карточка (кремовый фон, цветная плашка + чип-категория, рамка с
  картинкой, вопрос + CTA «Пиши ответ в комментариях»).
- `scripts/build-visual-riddles.mjs <manifest.json> --outdir DIR` — на каждую: `_vr-prep.py` (PIL:
  обрезка белых полей + автоконтраст + ≤1200px) → puppeteer-рендер карточки → edge-tts озвучка
  (retry) → ffmpeg (статичная карточка; голос 100% + музыка ~10%). Env `VR_VOICE`.
- `scripts/_vr-ingest.mjs <sourcing.json>` — качает кандидатов (Commons `Special:FilePath?width=1400`
  растрирует SVG; не-Commons SVG → cairosvg; throttle + retry под 429 Commons; PIL-валидация) →
  `tmp/visual-riddle-demos/build-manifest.json` + `sources.json`.
- `scripts/_vr-contact.py <dir> <out-prefix>` — контакт-листы для визуального QA.
- `scripts/_vr-register.mjs --cull id1,id2` — копирует принятые mp4 в
  `assets/fact-videos/visual-riddles/`, постеры в `data/output/admin-demos/`, дописывает
  `data/visual-riddles/videos.json` + manifest, пишет `data/visual-riddles/sources.json` (лицензии).
  Идемпотентно.

Добыча кандидатов: workflow по типам (агенты ищут + верифицируют PD/CC0 на Commons/Openclipart/
Project Gutenberg/LoC, отдают прямые URL + лицензию + RU вопрос/ответ). Модель workflow сначала
спросить у пользователя. Реальный выход строгого PD/CC0 невелик: «найди животных» — потолок ~3
(трио Currier & Ives 1872); большинство хороших иллюзий/лабиринтов/развёрток на Commons под
CC-BY-SA и отбрасываются. Финальную визуальную приёмку делает основной агент лично по контакт-листам.

**preFact-дека читает `videos.json` СВЕЖИМ (без кэша) → новые ролики видны БЕЗ рестарта сервера**
(см. `src/anecdotes/library.ts`); `/clip-demos` тоже читает manifest на лету.

Партии 2026-06-22 (+122 найденных PD/CC0, 9 отбраковано вручную; всего в `videos.json` = 202):
- **`vrx_*` +62** — лабиринты, оптические иллюзии, развёртки/3D, числовая логика (Loyd/Dudeney),
  найди-животных (трио Currier & Ives 1872), счёт (гравюры с группами).
- **`vry_*` +60** — тесты на дальтоника (псевдоизохроматические таблицы Якоба Штиллинга 1870-х–1920-х
  с Internet Archive — настоящий PD, пред-Ishihara), геом. счёт «сколько треугольников/квадратов/кубов»,
  новые лабиринты (вкл. фигурные), ещё иллюзии (Пенроуз/Неккер/Рубин/Маха/Дельбёф/Зандер), Арчимбольдо
  «найди лицо», развёртки многогранников, редкая PD «найди отличие» (гравюры 1568).
Лицензия каждого файла — в `data/visual-riddles/sources.json`. Дедуп при дозаливке — по `downloadUrl`
(`_vr-ingest.mjs` сверяется с `sources.json`); вторая партия запускалась с `--prefix vry`.

### Локализация: дека `visual-riddles-de` («Sieh die Antwort») — 2026-06-23

Немецкая версия пака: ТЕ ЖЕ 122 PD/CC0 картинки, но немецкий текст на карточке + озвучка edge-tts
`de-DE-KatjaNeural`. Как воспроизвести/расширить:
1. `kept-ru.json` — принятые карточки (id + category_ru + title_ru + question_ru + image), собран из
   `data/visual-riddles/sources.json` (тексты) + RU build-манифестов (пути к исходникам).
2. Перевод RU→DE — LLM-агент (модель спросить у пользователя; в этот раз Opus) → `de-texts.json`
   (`{id,title_de,question_de}`).
3. Немецкий манифест: `de-texts` + `kept-ru`; категории-чипы по таблице (МАРШРУТ→LABYRINTH,
   ОПТИЧЕСКАЯ ИЛЛЮЗИЯ→TÄUSCHUNG, ПРОСТРАНСТВО→RAUM, ЛОГИКА→LOGIK, НАЙДИ ЖИВОТНОЕ→SUCHBILD,
   СЧЁТ→ZÄHLEN, ТЕСТ ЗРЕНИЯ→FARBTEST); `vo = question_de + " Schreib deine Antwort in die Kommentare."`;
   `cta = "Antwort in die Kommentare!"`.
4. Сборка: `VR_VOICE=de-DE-KatjaNeural node scripts/build-visual-riddles.mjs <de-manifest> --outdir <batch-de>`.
5. Регистрация: `node scripts/_vr-register.mjs --deck visual-riddles-de --title "Sieh die Antwort" --lang de
   --manifest <de-manifest> --batch <batch-de> --sources data/visual-riddles/sources.json`.

Параметризация (общая): CTA — `{{CTA}}` в шаблоне / поле `cta` в манифесте / env `VR_CTA`; зум отключён
и не используется; `_vr-register.mjs` флаги `--deck/--title/--lang` пишут в
`data/<deck>/{videos,sources}.json` и создают manifest-пак; постеры на `/clip-demos` (общая плоская
`admin-demos/`) получают суффикс `-<lang>`, чтобы локализация не затёрла оригинал. Дека прописана в
`src/anecdotes/decks.ts` (DECKS + lang-map) и `web/src/lib/deck.ts` (label/lang/список) → в селекторе
каналов появляется после `npm run web:build` + рестарта сервера.

Готовые артефакты:

- `data/output/admin-demos/manifest.json` - pack `visual-riddles` с title `Вижу Ответ`;
- `data/output/admin-demos/vr_*.mp4` - готовые вертикальные ролики;
- `data/output/admin-demos/vr_*.jpg` - постеры для карточек в `/clip-demos`;
- `data/visual-riddles/videos.json` - список роликов для selectable deck;
- `assets/fact-videos/visual-riddles/*.mp4` - MP4, которые библиотека канала копирует как готовые видео;
- `tmp/visual-riddle-demos/` - локальный рабочий набор карточек, цветовых SVG, музыки, voice-кэша и сборщика;
- `tmp/visual-riddle-channel-avatar.png` и `tmp/visual-riddle-channel-wallpaper.png` - оформление канала;
- `tmp/visual-riddle-channel-title-description.md` - название, handle и описание канала.

Важно про `tmp/`: это рабочая одноразовая зона. В ней можно держать исходные PNG, voice-cache,
contact sheets, временные заметки и локальные сборщики, но нельзя оставлять важные правила только там.
Если во время работы в `tmp/` появилась инструкция, решение по стилю, TTS, лицензиям, QA или процессу,
перенеси её в этот документ или другой профильный файл в `docs/` до завершения задачи.

Пересборка демо:

```bash
node tmp/visual-riddle-demos/create-internet-cards.mjs
ELEVENLABS_API_KEYS="key1,key2,key3" node tmp/visual-riddle-demos/build-demos.mjs
```

В интерактивной работе лучше передавать ключи через stdin/окружение и не печатать их в команду,
markdown или git diff. Скрипт сам перебирает ключи при `401`/`402`, повторяет `429`, кэширует уже
созданные `tmp/visual-riddle-demos/voice/*.mp3` и обновляет только pack `visual-riddles` в
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
  `tmp/visual-riddle-demos/sources.json`;
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
node_modules/ffmpeg-static/ffmpeg -y -pattern_type glob -framerate 1 -i 'data/output/admin-demos/vr_*.jpg' -vf 'scale=120:213,tile=8x10' -frames:v 1 tmp/visual-riddle-demos/contact-sheet.jpg
```

Если меняются только файлы в `data/output/admin-demos/`, перезапуск сервера не нужен: `/clip-demos`
читает static manifest. Если меняется код сервера или frontend, нужен обычный rebuild/restart по
правилам проекта.

## Обмани свой мозг / Überliste dein Gehirn: вращающиеся 3D-иллюзии (`illusions-3d`, `illusions-3d-de`)

Admin-only `preFact`-видео-деки. Каждый ролик — «неоднозначная» 3D-фигура из цветных точек на чёрном
(стиль куба Неккера): нет теней/перспективы/«передней» стороны, поэтому мозг сам переворачивает
направление вращения. Без озвучки, с тихим фоновым эмбиентом. Заголовки СТРОГО одного типа —
«поверни/разверни/измени вращение силой мысли» (RU) / «… mit Gedankenkraft» (DE); вопросы не по этой
теме (сколько граней, где начало ленты и т.п.) НЕ использовать. RU и DE — одинаковая геометрия, разный
вшитый заголовок и id.

LLM НЕ нужен: фигуры — это математика, заголовки — фиксированный рукописный банк фраз в
`gen-manifest.mjs`. Вопрос о модели workflow не задаётся. Это исключение из «только ElevenLabs»: озвучки
нет вообще, а фон — сгенерированный синтез-дрон (не TTS).

Тулинг (committed в `scripts/illusions-3d/`; генерируемые манифесты и немые мастера — в gitignored
`tmp/illusions-3d/`; вдохновение-референс — `scripts/illusions-3d/reference/ambiguous_3d_illusions.html`):
- `renderer.html` — детерминированный покадровый canvas-рендер 1080×1920. 20 фигур (cube, tetra, octa,
  icosa, dodeca, stella, tesseract, torus, mobius, orbital, pyramid, bipyramid, prism, antiprism,
  cubocta, helix, dna, trefoil, fivecell, sixteencell). `window.setup({shape,title,palette,dir,turns,
  dTilt,dRoll})` + `window.renderFrame(progress)` → PNG dataURL. Бесшовный цикл: yaw = phase + dir·
  progress·2π·turns при постоянных наклонах; мерцание привязано к progress. Заголовок вшит в canvas
  (авто-подгон 70→44px, ≤3 строки), фигура центрирована, низ ≤ ~1430px (safe-zone Shorts соблюдена).
  Палитра по умолчанию `spectrum` (как референс); есть ещё ice/fire/neon/gold/aurora.
- `build.mjs <manifest.json> --outdir DIR` — Chrome (puppeteer-core) рендерит N кадров → ffmpeg →
  1080×1920 MP4 **без звука**. Env `DUR`(8)/`FPS`(30)/`PALETTE`/`SKIP_EXISTING=1`(докатка).
- `gen-manifest.mjs` — пишет `ru-manifest.json` + `de-manifest.json` (по 100: 20 фигур × 5 вариантов
  направление/скорость/угол; банки заголовков RU/DE «силой мысли»).
- `publish-pack.mjs` — после рендера: мьюксит музыку в каждый немой мастер и раскладывает RU+DE по
  нарезкам (`admin-demos/`) и канальным декам (`assets/fact-videos/<deck>/` + `data/<deck>/videos.json`),
  обновляет пак в `admin-demos/manifest.json` (чужие паки не трогает).
- Мастера (немые): `tmp/illusions-3d/out-ru/*.mp4` + `out-de/*.mp4` (+ `.jpg` постеры).

Звук: общий мелодичный трек `assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus`.
Drone/ambient-подложки для этих паков не используются.

Полная пересборка с нуля:
```bash
node scripts/illusions-3d/gen-manifest.mjs
SKIP_EXISTING=1 DUR=8 FPS=30 node scripts/illusions-3d/build.mjs tmp/illusions-3d/ru-manifest.json --outdir tmp/illusions-3d/out-ru
SKIP_EXISTING=1 DUR=8 FPS=30 node scripts/illusions-3d/build.mjs tmp/illusions-3d/de-manifest.json --outdir tmp/illusions-3d/out-de
node scripts/illusions-3d/publish-pack.mjs
npm run web:build && sudo systemctl restart shorts.service
```

Добавить ещё фигуры/ролики: завести новую функцию формы в `renderer.html` + ключ в `SHAPES`, дописать
её в `FIGURES` в `gen-manifest.mjs` (RU+DE имя), при желании поправить банки заголовков/`VARIANTS`,
затем перегенерировать манифесты и прогнать `build.mjs` с `SKIP_EXISTING=1` (старые ролики не
перерисовываются) + `publish-pack.mjs`. Менять число фигур/вариантов можно свободно — id и videos.json
пересобираются из манифеста.

Проверка:
```bash
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; for (const d of ["illusions-3d","illusions-3d-de"]) { const v=JSON.parse(fs.readFileSync(`data/${d}/videos.json`,"utf8")); const miss=v.filter(x=>!fs.existsSync(path.join("assets/fact-videos",x.file))); console.log(d, {videos:v.length, missing:miss.length}); }'
for f in data/output/admin-demos/ilr_001_cube.mp4 data/output/admin-demos/ild_001_cube.mp4; do ffprobe -v error -show_entries format=duration:stream=codec_type -of csv=p=0 "$f" | tr '\n' ' '; echo "$f"; done
```

Регистрация дек: `src/anecdotes/decks.ts` (`illusions-3d` RU + `illusions-3d-de` DE, `preFact:true`,
`adminOnly:true`, `DECK_LANG`) и `web/src/lib/deck.ts` (`DECK_GLOSS_RU`, `DECK_LANG`, `BUILTIN_DECKS`).
Новые id деки → нужны `npm run web:build` + рестарт сервера, иначе селектор источников их не покажет.
preFact читает `videos.json` свежим → ДОЗАЛИВКА роликов в существующую деку видна без рестарта;
нарезки читают `admin-demos/manifest.json` на лету.

## Русские анекдоты (`ru`)

Источник: `local-assets/Русские анекдоты/anek_djvu.txt`. Базовый сборщик `src/anecdotes/build.ts` режет файл по
`<|startoftext|>`, нормализует пробелы, удаляет дубли, мат, `@`, цензурные артефакты и может писать
`data/anecdotes/pack-*.json` + `index.json`.

Важно: текущая плотная RU-дека не восстанавливается одним `build.ts`. Она включает pipeline пар коротких
анекдотов из `local-assets/corpora/ru-gen`: короткие шутки майнятся, workflow выбирает/тематизирует лучшие, затем
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
3. Workflow читает `local-assets/corpora/ru-gen/cand-*.json` и пишет `keep-*.json` с `{id,theme}`.
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

Источник: `local-assets/corpora/witze.sql`, SQL dump Schlechtewitzefront
(`https://github.com/JohannesBauer97/Schlechtewitzefront`, MIT по текущему ledger).
Перед обновлением корпуса проверь лицензию источника заново. Сборщик: `src/anecdotes/build-de.ts`.

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

Источник: `local-assets/corpora/blagues.json`, Blagues-API JSON
(`https://github.com/Blagues-API/blagues-api`, MIT по текущему ledger). Сборщик оставляет только safe
categories `global` и `dev`.

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

## Японские анекдоты (`ja`)

**Отличается от других языковых анекдот-дек:** не независимый корпус, а **отбор + перевод-адаптация из
уже готовой русской деки** (`data/anecdotes/titled.json`, 1203 анекдота на 2026-07-04). Причина: попытки
найти реальный японский исходник (Сэйсуйсё 1623 года, книги анекдотов Мэйдзи из Нацбиблиотеки, колонка
Сусукиды и т.п. — все чисты по правам) не устроили пользователя по духу юмора (слишком архаично/тонкая
игра слов вместо смешных историй) — см. память сессии. Пользователь явно одобрил перевод из русской деки
как компромисс: реальные, уже проверенные анекдоты, не выдумка ИИ, просто с фильтром на переводимость.

**Метод отбора (важно — не всё подряд переводится):** каждый анекдот из `data/anecdotes/titled.json`
прогнан через LLM с тремя правилами дропа, в таком порядке — (1) **unsafe**: небезопасный/неуместный для
общей аудитории контент (сексуальный подтекст, жестокость к животным, наркотики и т.п.); (2) **wordplay**:
шутка держится на непереводимой русской игре слов/омофонии/рифме; (3) **cultural**: шутка требует знания
специфичных русских/советских реалий (конкретные политики, советские отсылки, региональные стереотипы) —
но сам факт действия в русском антураже (армия, работа, тёща, семья) НЕ повод дропать, если механизм
шутки универсален. Всё прошедшее фильтр — переведено на живой разговорный японский (не дословно), с новым
японским заголовком. **Ничего не выдумано** — каждая финальная карточка восходит к реальной строке в
`data/anecdotes/titled.json`. Часть исходных строк — это 2-3 разных анекдота через `— — —` (см.
`src/scripts/ru-pairs-build.ts`), каждый оценивался отдельно, поэтому итоговых карточек может быть больше,
чем исходных строк.

**Итог прогона (зафиксировано в `data/anecdotes-ja/sources.json`):** просмотрено 1203 исходных анекдота
(1578 карточек после разбивки парных строк на отдельные шутки) → **1346 отобрано и переведено**; отсеяно
230 (102 unsafe, 81 cultural, 36 wordplay, 12 прочих технических проблем/дублей). Это правило веди в
актуальном состоянии при любом будущем перезапуске/дополнении конвейера — обнови и `sources.json`, и эту
цифру в доке.

Тулинг (черновой, `tmp/ja-anecdotes-v2/`, не в `scripts/`):
- `batches/b_NN.json` — 41 партия по ~30 анекдотов (`data/anecdotes/titled.json` разбит скриптом).
- Каждая партия — отдельный агент (Sonnet на первых 10, затем Haiku через `Workflow` на остальные 31 —
  сырой параллельный запуск через `Agent` без лимита конкурентности упёрся в серверный rate-limit;
  `Workflow`'s встроенный `parallel()` сам ограничивает и ставит в очередь, поэтому пересобрали через него).
  Промпт с правилами дропа — см. `build_ja_deck.py`/сам конвейер, если нужно повторить.
- `batches/b_NN_result.json` — `[{id, keep, drop_reason, ja, title_ja}, ...]`.
- `build_ja_deck.py` — сливает все 41 результата, дедуп по точному тексту, режет заголовки >20 симв.,
  пишет `data/anecdotes-ja/{titled.json,index.json,pack-001.json}` + печатает итоговую статистику.

**Рендер:** та же плоская анекдот-дека (`isPlainAnecdoteDeck` → `renderJokePop`/`buildJokePopHtml` в
`src/anecdotes/render.ts`), НЕ `templates/anecdote.html` (это другой, отдельный шаблон/путь — не перепутай
при будущей правке шрифта). CJK-шрифт добавлен в инлайн-стиль `buildJokePopHtml`
(`"Noto Serif CJK JP", "Noto Sans CJK JP"` в общий `font-family`) — уже был протестирован рендером реальной
карточки, текст чистый, без «квадратиков».

## Итальянские анекдоты (`it`)

Есть два пути:

- быстрый корпусный парсер `src/anecdotes/build-it.ts` читает `local-assets/corpora/it-barzellette.jsonl` и
  `local-assets/corpora/it-umorismo.jsonl`;
- текущая плотная дека строится из LLM-очищенных файлов `local-assets/corpora/it-gen/clean-*.json` через
  `src/anecdotes/build-it-dense.ts`.

Для текущего качества используй плотный путь. Сначала спроси пользователя модель workflow для чистки
кандидатов. Workflow должен читать локальные кандидаты, чистить мусор Usenet/mojibake/не-шутки и писать
массивы `{title,text}` в `local-assets/corpora/it-gen/clean-<n>.json`.

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

1. Скачивание корпусов в `local-assets/corpora/islamic/`:
   ```bash
   node src/scripts/islamic-fetch-corpus.mjs
   ```
2. Разбиение на slices:
   ```bash
   node src/scripts/islamic-split.mjs
   ```
3. Спросить пользователя модель workflow.
4. Запустить workflow: каждый агент читает свой `local-assets/corpora/islamic/slices/*.jsonl` и пишет выбранные
   строки JSONL `{ "id": "...", "theme": "..." }` в `local-assets/corpora/islamic/sel/<slice>.jsonl`.
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
4. Workflow читает `local-assets/corpora/christian/slices/*.jsonl` и формирует `local-assets/corpora/christian/selection.json`
   как массив `{ "id": "...", "theme": "..." }`.
5. Собрать финальный пак:
   ```bash
   node src/scripts/christian-assemble.mjs
   ```

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; const cards=JSON.parse(fs.readFileSync("data/christian/cards.json","utf8")); const idx=JSON.parse(fs.readFileSync("data/christian/index.json","utf8")); console.log({cards:cards.length,indexTotal:idx.total,range:idx.range,sample:Object.keys(cards[0]||{})});'
```

## Christian Prayers (`prayers-en`)

`prayers-en` — отдельный английский молитвенный video-pack для блока `christianity`. Он не заменяет
`christian`/KJV: блок должен использовать два источника, чтобы расписание могло чередовать Bible cards и
prayer cards через `sourceGroups`.

- Тексты: короткие оригинальные devotional prayer cards, без цитирования защищённых переводов Библии.
- Медиа: локальный HTML/CSS-шаблон в `src/scripts/build-prayers-en-pack.mjs`, без внешних фото/портретов.
- Результат: `data/prayers-en/videos.json`, `data/prayers-en/sources.json`,
  `assets/fact-videos/prayers-en/prayer_en_*.mp4`.
- Safety: без обещаний гарантированного исцеления, политических нападок, protected-class hate и спорных
  религиозных утверждений.

Пересобрать:

```bash
node src/scripts/build-prayers-en-pack.mjs 160
```

Проверка:

```bash
node -e 'const fs=require("fs"); const v=JSON.parse(fs.readFileSync("data/prayers-en/videos.json","utf8")); console.log(v.length, v[0]);'
find assets/fact-videos/prayers-en -maxdepth 1 -name '*.mp4' | wc -l
```

## Religious Quote Decks (`islamic-quotes-ar`, `christian-quotes-en`)

Оба пака — обычные `quoteDeck()` на `titled.json`, но их нельзя добавлять в общий блок литературы/цитат:
они подключаются только к религиозным source groups (`islam`, `christianity`).

- `islamic-quotes-ar`: 700 арабских quote-card записей из уже проверенного `data/islamic/cards.json`.
  Атрибуция: `القرآن الكريم`, `النبي محمد ﷺ`, `دعاء مأثور` + ссылка. Портреты не используются.
- `christian-quotes-en`: 700 quote-card записей из public-domain KJV `data/christian/cards.json`.
  Атрибуция: source/reference label (`Psalms`, `Gospel of Matthew`, `Epistle`, `KJV`), не современные
  портреты и не copyrighted Bible translations.
- `christian-facts-en` больше не подключать к `armen` religion mix/sourceDecks/slotDecks; существующие
  библиотечные ролики можно оставить, но новые добивки и расписания не должны брать этот источник.
- Islamic visual rule: no human faces/portraits in Islamic religious packs. Do not depict prophets,
  companions, scholars, saints, or modern people; use calligraphy, mosques, geometric ornament,
  manuscripts/books, light, and abstract textures.
- Christian visual rule: faces are allowed only as clearly sourced public-domain/clearly licensed
  religious artwork (icons, frescoes, paintings, stained glass). Treat them as artwork, not factual
  portraits. Do not use modern actor/person photos as Jesus, apostles, saints, or prophets.
- Safety: не использовать для нападок на другие религии/protected classes, политических тезисов,
  экстремистского контекста, медицинских обещаний или гарантированных чудес.

Пересобрать оба:

```bash
node src/scripts/build-religious-quotes-decks.mjs
```

Проверка:

```bash
node -e 'for (const p of ["data/islamic-quotes-ar/titled.json","data/christian-quotes-en/titled.json"]) { const a=JSON.parse(require("fs").readFileSync(p,"utf8")); console.log(p, a.length, a[0]); }'
```

## Pre-built video packs (`fact-en`, `quotes-de`, `space`, `prayers-de`)

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
`src/scripts/space-montage/`** (раньше был в gitignored `tmp/clip-demo/` и из-за этого был утерян — НЕ
держи монтажный код в `tmp/`). Источник теперь — **NASA Scientific Visualization Studio**
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
- scratch (gitignored): `tmp/space-build/{src,voice,cap,base,sources.json}`;
- готовая админ-галерея: `data/output/admin-demos/<id>.mp4`, `<id>.jpg`, `manifest.json`;
- канал-selectable deck: `assets/fact-videos/space/<id>.mp4` и `data/space/videos.json`;
- страница просмотра: `/clip-demos` (`web/src/pages/ClipDemos.tsx`).

Как пополнить (полный цикл с нуля):

1. Добавь новые темы в `topics.json` (и в `TOPICS` внутри `find-svs-sources.workflow.mjs`), используя
   только `id`, которых нет в `data/output/admin-demos/manifest.json`.
2. Найди источники: `Workflow find-svs-sources.workflow.mjs` → распарсь результат и скачай MP4 в
   `tmp/space-build/src/<id>.mp4`, собери `tmp/space-build/sources.json`
   (`{id:{file,credit,description,subject,...}}`). Визуально отбракуй слабые клипы (контактный лист
   ffmpeg `tile`), замени плохие точечным WebSearch+WebFetch+curl.
3. Тексты: **сначала спроси у пользователя модель**, затем `Workflow write-narration.workflow.mjs`
   (темы/описания вшиваются в скрипт перед запуском) → сохрани результат в
   `src/scripts/space-montage/narration.json` (`[{id,title,narration}]`, ≤~52 слов).
4. Собери: `node --env-file=.env src/scripts/space-montage/build.mjs --no-sync` (или `--only <id>`),
   визуально проверь (см. QA ниже), почини и пересобери точечные `id`, затем синкни в деку:
   `node --env-file=.env src/scripts/space-montage/build.mjs --sync-only`.
5. Держи ролики в Shorts-формате (`dur` ≤ ~0:58); короткие исходники `build.mjs` сам зацикливает.

**Документальные нарезки (`build-doc.mjs`) — основной субтитровый формат:** вырезка фрагмента
**озвученной PD-документалки**, где **родной голос диктора СОХРАНЯЕТСЯ**, а субтитры = **расшифровка его
речи из официального `.srt`** (whisper НЕ нужен), karaoke-стиль, кредит источника в левом верхнем углу,
субтитры в мобильной safe-zone (не у самого низа/правого края). Пайплайн (всё в `src/scripts/space-montage/`):
- `find-narrated-docs.mjs` — ищет в NASA Image&Video Library озвученные видео **с `.srt`** по астро- и
  МКС-темам (ScienceCasts + produced-ролики), отсеивает talking-head/панели/брифинги/подкасты;
- `dl-narrated-docs.mjs` — качает mp4(medium)+srt в `tmp/space-build/doc/`;
- `doc-contactsheets.mjs` — по каждому источнику: размеченный таймкодами контактный лист кадров
  (`/tmp/doc-cs`) + srt-сводка (`/tmp/doc-srt`);
- `curate-doc.workflow.mjs` — Workflow (Opus): по агенту на источник читает лист+транскрипт и выбирает
  до 2 **чистых** фрагментов `{start,end,title}` (только космо-съёмка/орбита/эксперимент — без
  скриншотов/ведущего/слайдов/титров), на границах предложений;
- `build-doc.mjs` — режет фрагмент (`-ss/-t`), **оставляет дорожку источника** (`-map 0:a`), full-bleed
  1080×1920, karaoke-сабы из `.srt` (`wordsFromCues`), угловой кредит, синк (`--sync-only`). Spec —
  `tmp/space-build/docs.json` `[{id,title,src,srt,start,end,corner,credit,zoom?}]`.
Финальная Opus-QA обязательна (ловит просочившиеся кадры ведущего / вшитые именные плашки / не-космос).
Батч документалок = 29 клипов (из 39 собранных, 10 отсеяла QA). **Честно:** «чужая нарезка + их голос +
субтитры» легальна при свободной лицензии, но это слабейший формат по YouTube «reused content» —
пользователь это принял.

(Также есть `--novoice` / `novoice:true` — немой вариант со своими субтитрами-фактами по скорости чтения;
пользователь отклонил его как слабый, не использовать рутинно.)

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
6. Если этот `preFact` pack должен выдаваться обычным пользователям через `/users`, в `DECKS`
   ставь одновременно `adminOnly: true` и `grantable: true`. Такой built-in pack появляется в
   матрице доступов как opt-in колонка: по умолчанию скрыт, доступ открывается только галочкой
   админа. Если оставить только `adminOnly: true`, pack останется жёстко скрытым и не будет
   доступен для выдачи.

Проверка:

```bash
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; for (const d of ["data/fact-videos","data/quotes-de","data/space"]) { const arr=JSON.parse(fs.readFileSync(`${d}/videos.json`,"utf8")); const missing=arr.filter(x=>!fs.existsSync(path.resolve("assets/fact-videos",x.file))).map(x=>x.file); const idxPath=`${d}/index.json`; const idx=fs.existsSync(idxPath)?JSON.parse(fs.readFileSync(idxPath,"utf8")):{total:arr.length}; console.log(d,{videos:arr.length,indexTotal:idx.total,missing:missing.slice(0,5),missingCount:missing.length}); }'
```

### `quotes-de` static quote-card expansion

2026-06-25 активный deck `quotes-de` вынесен в tracked-папку `data/quotes-de-combined/` как единый
статичный немецкий цитатный пак для thematic block `quotes`. Рабочая папка `data/quotes-de/` остается
игнорируемым aggregate/source-cache. Numbered-деки `quotes-de-1`, `quotes-de-2`, `quotes-de-3` оставлены
как отдельные немецкие video-source деки; их не локализировать и не смешивать с RU/EN/ES portrait quote
decks. В блоке цитат расписание по умолчанию пинит источники весом `static:video = 4:1`.

Статичные quote decks `quotes-ru`, `quotes-en`, `quotes-es`, `quotes-it`, `quotes-fr`, `quotes-pt`,
`quotes-hi`, `quotes-id`, `quotes-ar` лежат в `data/quotes-*/titled.json` и используют Wikiquote +
Wikimedia/Commons portrait ledger. Их voiced-версии `quote-video-*` не являются отдельным корпусом:
для всех языков, кроме DE, они читают тот же `data/quotes-*`; DE использует отдельный tracked
`data/quote-video-de/`, собранный из `data/quotes-de-combined/sources.json`. На 2026-06-26 в live БД
у цитатных каналов armen источники стоят как `quotes-de + quote-video-de` и `quotes-ru +
quote-video-ru`, а `slotDecks` дают 8 статичных и 2 voiced слота на 10 публикаций.

Если у карточки нет `portraitFile`, `renderQuote()` использует generic fallback-фоны из
`assets/backgrounds/quotes/quote-bg-*.jpg`; список подключённых файлов лежит в
`GENERIC_QUOTE_BACKGROUNDS` в `src/anecdotes/render.ts`, а provenance - в
`assets/backgrounds/quotes/sources.json`. Эти фоны должны быть project-owned, без лиц, логотипов,
водяных знаков и readable in-image text. После добавления новых fallback-фонов обязательно отрендери
несколько quote cards без portraitFile через `renderAnecdote()` и проверь контакт-лист на читаемость.

2026-06-21 добавлен статичный card-style batch `q244..q543` (+300 MP4) без озвучки: портрет +
цитата + процедурная фоновая музыка. Builder:

```bash
python3 -u scripts/build-quotes-de-cards.py --count 300 --start-id 244 --fetch-wait 0.5 --max-per-author 12 --hard-max-per-author 100 --min-authors 20 --extra-candidates 80 --force
```

Что builder делает:
- берет немецкие цитаты из de.Wikiquote, кеширует wikitext в `data/quotes-de/source-cache/wikiquote/`;
- берет портреты через Wikidata P18 / Wikimedia Commons и по умолчанию оставляет только
  `Public domain`, `CC0`, `No restrictions`;
- отбрасывает portrait metadata с коммерческими poster-credit/сомнительными provenance даже при
  `Public domain`; если источник вызывает сомнение, оставляй quote без `portraitFile` и рендерь через
  generic fallback;
- отбраковывает markup/source artifacts, policy-risk terms и прямые violence terms;
- генерирует музыку локальным синтезом в `data/quotes-de/music/` (нет внешнего аудио-источника);
- рендерит карточки в `tmp/quotes-de-cards/`, контакт-листы в `tmp/quotes-de-contact/`;
- пишет источники в `data/quotes-de/sources.json` и layout metrics в `data/quotes-de/layout-report.json`;
- обновляет `data/quotes-de/videos.json`, `index.json` и MP4 в `assets/fact-videos/`.

Проверка нового диапазона:

```bash
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const v=JSON.parse(fs.readFileSync("data/quotes-de/videos.json","utf8")); const n=v.filter(x=>{const m=x.file.match(/^q(\d+)\.mp4$/); return m && +m[1]>=244 && +m[1]<=543}); const bad=/ratten|warmer bruder|bedingungslosen gehorsam|totalen krieg|tel aviv|raus, und zwar|um die hälfte|untermensch|ausrotten|hingehören|ausländer|asyl|flüchtling|juden|israel|parasiten|schweine|vernichten|vergas|zigeuner|neger|nigger|erschieß|umbring|\btöt|totschlag|totgeschlag|todesstrafe|\brache\b|wiedervergeltung|geschossen|schossen/i; console.log({newCount:n.length, missing:n.filter(x=>!fs.existsSync(path.resolve("assets/fact-videos",x.file))).length, hits:n.filter(x=>bad.test(`${x.title}\n${x.text}`)).map(x=>x.file)});'
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
grep -niE "ratten|warmer bruder|bedingungslosen gehorsam|totalen krieg|tel aviv|raus, und zwar|um die hälfte|untermensch|ausrotten|hingehören|ausländer|asyl|flüchtling|juden|israel|parasiten|schweine|vernichten|vergas|zigeuner|neger|nigger|erschieß|umbring|töt|totschlag|totgeschlag|todesstrafe|rache|wiedervergeltung|geschossen|schossen" data/quotes-de/videos.json
```

Удалено 2026-06-20 (10): `q204` (страйк), `q150`, `q093`, `q085`, `q239`, `q039` (явные нарушения) +
`q146`, `q126`, `q225`, `q121` (пограничные). См. также `data/quotes-de/CONTENT-POLICY.md`.

### `prayers-de` German prayer-card pack

2026-06-22 добавлен немецкий молитвенный pack `Gebete`: 1000 статичных devotional card-style MP4 без
водяного знака/тега. Это `preFact` deck, а не template-pack: runtime выбирает готовый MP4 из
`assets/fact-videos/prayers-de/` и копирует его в библиотеку. Текущий состав: около 250 карточек про
детей/семью и около 750 общих молитвенных тем без привязки к детям.

Артефакты:

- сборщик: `scripts/build-prayers-de-pack.py`;
- исходные imagegen-фоны: `data/prayers-de/backgrounds/bg_*.png`;
- selectable deck manifest: `data/prayers-de/videos.json`, `index.json`, `sources.json`, `layout-report.json`;
- готовые MP4 для генерации каналов: `assets/fact-videos/prayers-de/gebet_de_*.mp4`;
- админ-галерея `/clip-demos`: `data/output/admin-demos/gebet_de_*.mp4`, `.jpg` и pack `prayers-de`
  в `data/output/admin-demos/manifest.json`;
- визуальная проверка: `tmp/prayers-de/contact.jpg`.

Регистрация:

- `src/anecdotes/decks.ts`: `id: "prayers-de"`, `preFact: true`, `adminOnly: true`, `grantable: true`;
- `web/src/lib/deck.ts`: русский gloss, `DECK_LANG`, пункт в `BUILTIN_DECKS`.

Пересборка:

```bash
python3 scripts/build-prayers-de-pack.py
```

Скрипт генерирует 25 визуальных шаблонов поверх текущих imagegen-фонов, пишет MP4, постеры,
`videos.json`, `index.json`, `sources.json`, `layout-report.json` и только pack `prayers-de` внутри
`admin-demos/manifest.json`; остальные packs в manifest не трогает. Озвучка не используется: это формат
картинок/тихих MP4, как в пользовательских референсах. LLM-workflow не нужен, пока меняются только
тексты/верстка внутри скрипта. Если для будущего пополнения агент запускает workflow, который пишет
новые молитвы, сначала спросить пользователя модель.

Как пополнить без потери старого:

1. Добавь новый фон в `data/prayers-de/backgrounds/` с именем `bg_*.png`. Если фон взят из интернета,
   сначала проверь лицензию и запиши источник/автора/license в `sources.json` или расширь сборщик так,
   чтобы он сохранял эти поля.
2. Расширь `CHILD_SUBJECTS` или `GENERAL_THEMES` внутри `scripts/build-prayers-de-pack.py`.
3. Запусти `python3 scripts/build-prayers-de-pack.py --jobs 6`.
4. Проверь счетчики/файлы/видео:
   ```bash
   node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const v=JSON.parse(fs.readFileSync("data/prayers-de/videos.json","utf8")); const m=JSON.parse(fs.readFileSync("data/output/admin-demos/manifest.json","utf8")); const p=m.packs.find(x=>x.id==="prayers-de"); const missing=v.filter(x=>!fs.existsSync(path.resolve("assets/fact-videos",x.file))).map(x=>x.file); console.log({deckVideos:v.length, adminItems:p?.items?.length, missing:missing.length});'
   for f in assets/fact-videos/prayers-de/*.mp4; do printf "%s " "$f"; ffprobe -v error -show_entries format=duration:stream=codec_type,width,height -of compact=p=0:nk=1 "$f" | tr "\n" " "; printf "\n"; done
   ```
5. Открой `tmp/prayers-de/contact.jpg` глазами: текст должен читаться, без случайного тега, без
   перекрытия лиц и без низкого контраста.

Если меняются только `data/prayers-de/*`, `assets/fact-videos/prayers-de/*` и
`data/output/admin-demos/*`, серверный restart не нужен для чтения свежего `videos.json`/manifest.
После изменений `src/anecdotes/decks.ts` или `web/src/lib/deck.ts` нужен обычный backend/frontend
rebuild/restart, чтобы новая selectable deck появилась в UI.

## Template-pack: The Mind Edge

Исходные карточки собираются из LLM-батчей:

- вход: `local-assets/corpora/mind-edge-gen/*.json`;
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

## Template-pack: psychology super-admin

Живые паки `psychology-ru-superadmin` и `psychology-de-superadmin` - отдельные super-admin паки,
не связанные с MGS. Их нельзя пополнять через `assets/template-packs/psychology-mgs/`, использовать
MGS-шаблоны как fallback или переносить MGS-карточки в armen-блоки.

Файлы:

- `src/scripts/build-psychology-ru-pack.mjs` - генерирует RU-пак;
- `src/scripts/build-psychology-de-pack.mjs` - локализует структуру RU-пака в DE;
- `assets/template-packs/psychology-ru/backgrounds/` и `assets/template-packs/psychology-de/backgrounds/`
  - независимые project-owned фоны;
- `assets/template-packs/psychology-*/sources.json` - ledger ассетов.

Правила ассетов: реальные/узнаваемые лица, логотипы, social handles, водяные знаки и читаемый
in-image текст запрещены. Generic silhouette или интерьерная фигура допустимы только если они
неузнаваемые, находятся вне основной текстовой зоны и не мешают читабельности.

Сборка:

```bash
node src/scripts/build-psychology-ru-pack.mjs
node src/scripts/build-psychology-de-pack.mjs
```

QA после правок:

```bash
node --experimental-sqlite src/scripts/audit-superadmin-visual-packs.mjs
node --import tsx src/scripts/audit-armen-packs-safety.mjs
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

### Сплит на «психология armen» (без 📌) и «психология mgs» (с 📌) — 2026-06-22

Живой пак `data/packs/психология-mgs-mqe2kfjv.json` (имя **«психология armen»**, lang `de`) бандлил
**40** editor-шаблонов. Первые **10** (`psychology-mgs` lime/yellow/pink/cyan/orange/violet/mint/sky/
coral/dark) рисуют 📌-«скрепку» сверху карточки; остальные **30** (note/question/myth/micro/dark-grid+
calm/ai) — без неё. Карточки рендерятся round-robin: карточка `i` → `templates[i % 40]`
(см. `buildPackLibraryVideo` / `packs-routes`), поэтому 📌 видна ⇔ `i % 40 < 10`.

По просьбе пользователя 📌-половину вынесли в **отдельный** пак, а из «психология armen» убрали (включая
уже отрендеренные видео в очереди канала, чтобы они нигде не выложились). Сделано одноразовым скриптом
`src/scripts/split-psychology-mgs.ts`:

```bash
node --import tsx --experimental-sqlite src/scripts/split-psychology-mgs.ts
```

Что он делает (порядок-сохраняющий фильтр сохраняет шаблон КАЖДОЙ карточки 1-в-1):

- **новый пак «психология mgs»** (`data/packs/психология-mgs-<ts36>.json`, новый id) = 10 📌-шаблонов +
  500 📌-карточек (`i % 40 < 10`); владельцы/гранты/lang скопированы с armen (без владельца → виден
  только админу на `/cards`);
- **«психология armen»** переписан = 30 не-📌-шаблонов + 1500 карточек (`id` остаётся
  `психология-mgs-mqe2kfjv`, имя «психология armen»);
- из очереди удалены 📌-видео деки `pack:психология-mgs-mqe2kfjv` (строки `videos` + png/mp4 файлы) —
  совпадение видео↔карточка по `videos.text` (= `cardReadable`), т.к. id карточки/шаблона в `videos`
  не хранится. На 2026-06-22 удалено 43 видео (канал 44), осталось 105 не-📌.

Бэкапы (gitignored): `data/packs/психология-mgs-mqe2kfjv.json.pre-split.bak` и
`data/psychology-mgs-split-deleted-videos-<stamp>.json` (удалённые строки). Скрипт идемпотентно
прерывается, если в armen уже не 40 шаблонов (повторно не запускать). Канал 44 привязан к
`pack:психология-mgs-mqe2kfjv` (armen), поэтому дальше генерит только не-📌; новый пак ни к какому
каналу не привязан (привязать при необходимости через язык/`source_decks`). Сервер перезапускать не
нужно — стор читает паки с диска, БД общая (WAL).

**Пополнение** каждой половины — как и раньше у `psychology-mgs` (build/seed выше), но карточки
добавляй в нужный пак по содержимому: яркие плашечные (signal/reminder/«Leise Signale») → mgs,
note/question/myth/micro/ai → armen. Совместимость шаблонов: у всех роли `title` (строка) + `text`
(список), так что любой набор карточек валиден к любому из этих шаблонов.

## Template-pack: Curiosaurs English Facts

Это локальный deterministic pack для детских фактов. LLM не нужен: факты зашиты в
`src/scripts/build-curiosaurs-english.ts`, шаблонные PNG берутся из `tmp/timur`, результат пишется в
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

## Legacy мем-деки (`memes-ru` / `memes-en` / `memes-de` / `memes-fr` / `memes-it`)

Legacy warning: встроенные `memes-*` больше не подключать к armen/super-admin блокам. Для текущих
нерелигиозных каналов armen используется только набор `pack:new-memes-<lang>-superadmin`, включая
`pack:new-memes-ru-superadmin` для русского блока. Этот раздел оставлен для исторического обслуживания
старых дек и других пользователей, не как инструкция для armen.

Встроенные деки оригинальных МЕМОВ (не анекдотов), admin-only. Один формат v1 — **caption**: крупный
текст-подпись (relatable / «паблик» / POV / «ожидание-реальность» / Nobody:/Me: / списки) на фоне.
Фон = либо контекстное фото **Pexels**, либо сгенерированный тёмный солид/градиент (типографика).

**ГЛАВНОЕ ПРО СТРАЙК (не нарушать):** НИКОГДА не заливать чужие мем-картинки (кадры из фильмов/сериалов,
фото знаменитостей, чужой арт, платный сток, «народные» мемы вроде Ждуна/Преведа — у них есть владелец).
Картинка — только: собственный рендер (captureCard) ИЛИ фото с **Pexels License** (коммерческое
использование разрешено, атрибуция не нужна, модификация ок), без узнаваемых лиц/брендов/логотипов
(отсев визуальным обзором агентами). Текст — оригинальный юмор, без цитат копирайтных песен/фильмов/брендов.

### Файлы
- Данные: `data/memes-<lang>/cards.json` (+ `index.json`). Карточка = `{caption, format, theme, imageQuery, photoFile?, photoSource?}` — весь объект кладётся JSON-строкой в `text` (ветка в `src/anecdotes/library.ts`).
- Фото: `data/memes/photos/<pexelsId>.jpg` (**gitignored**) + `data/memes/photos/sources.jsonl` (аудит: pexelsId, pageUrl, photographer, license). Воспроизводимо повторным фетчем по сохранённым запросам.
- Шаблон/рендер: `templates/meme.html` + `src/memes/render.ts` (`buildMemeHtml`/`pickMemeBg`; авто-подгон по ОБОИМ осям + порог читаемости 60px + аварийный перенос — длинные слова не обрезаются). Фото-сорсинг: `src/memes/photos.ts`.
- Диспетч рендера: флаг `meme:true` в `src/anecdotes/decks.ts` → `renderMeme` в `src/anecdotes/render.ts` (фото инлайнится `photoCss(card.photoFile)`, иначе фон из `pickMemeBg`).
- Музыка: `assets/audio/memes/*.mp3` (14 битов, 5 семейств: пэды/шкатулка/арп/lo-fi/quirky), синтез ffmpeg в `src/scripts/memes-gen-audio.mjs`; `pickMemesAudio()` в `src/video.ts` (сабдир `memes/` исключён из общего пула).

### Конвейер генерации (модель workflow — **Opus**, пользователь зафиксировал для этого пака)
1. Ресёрч-workflow `memes-pack-research` (Opus): инструменты/источники/копирайт-вайтлист + культурные брифы по языкам + проверенные сид-мемы → брифы в `/tmp/meme-briefs.json`.
2. Генерация-workflow `memes-generate` (Opus): по темам на язык → дедуп → пакетная проверка (копирайт/community/«это-мем») → `/tmp/meme-content.json` (цели RU120/EN150/DE90/FR90/IT90).
3. Фото: `npx tsx src/scripts/memes-fetch-photos.ts` — Pexels по `imageQuery` (ключ `PEXELS_API_KEY` в `.env`; **лимит ~200 запросов/час** → троттлинг ~18.5с/запрос, backoff на 429; резюмируемый, скип уже скачанных) → `/tmp/meme-content-photos.json`.
4. Сборка: `npx tsx src/scripts/memes-build.ts` → пишет `data/memes-<lang>/cards.json` + `index.json`.

### Пополнение / новые карточки
- Догенерить текст: повторить шаг 2 (Opus) или вручную дописать в `cards.json` (`{caption, format, theme, imageQuery}`), затем шаги 3–4.
- Перебрать фото: удалить `photoFile` у нужных карточек в `/tmp/meme-content-photos.json` и снова шаг 3 (докачает недостающее), затем шаг 4.
- Деке нужен ребилд фронта (`npm run web:build`) только если менялись `web/src/lib/deck.ts`/локали; данные подхватываются `resetDeckCache` или рестартом.

### Проверка
- End-to-end: `npx tsx src/scripts/memes-verify.ts` → рендерит по карточке из каждой деки в `/tmp/meme-verify/*.png|*.mp4` (полный путь: дека → рендер → видео + мем-бит). Глазами проверить, что текст влезает/читается, фото подходит и не содержит узнаваемых лиц/брендов.
- Прототип раскладки/стресс длинных слов: `npx tsx src/scripts/meme-proto.ts` → `/tmp/meme-proto/`.
- Бэкенд-правки (decks/library/render/video) → **нужен рестарт сервера**, чтобы дека стала живой.

## Legacy мем-паки (board-раскладка, 5 языков) — `memes-{ru,en,de,fr,it}` (admin-only)

ВСЕ пять мем-дек `memes-*` переведены на **board-раскладку**: подпись **НАД** картинкой (плашка
сверху + готовый реакшн-шаблон снизу), вместо прежнего Pexels-оверлея (раздел выше — историч.).
Картинка — осмысленный мем-шаблон, подпись пишется ПОД её сюжет. Картинки ОБЩИЕ для всех языков
(`data/memes/photos/board-<idx>.jpg`), подписи — свои, локализованные под культуру (не перевод).
Объёмы: ~2000 на КАЖДЫЙ язык (≈24–25 подписей на шаблон; одна картинка = много мемов — норма мем-пабликов).
Добор до объёма — delta-воркфлоу (`cap-d2-<lang>/`): агентам отдаются УЖЕ существующие подписи шаблона,
они пишут только НОВЫЕ → дедуп в `assemble_2000.py`. Качество к «хвосту» (15-я+ подпись на картинку) тоньше.

## Новые meme template packs (`pack:new-memes-*-superadmin`)

Это текущие meme-источники для блока `quotes` / "Иностранные" и блока `russian` / "Русские" у armen.
Они заменяют legacy `memes-*` и подключены только для нерелигиозных каналов: DE, EN, ES, FR, IT, PT
в иностранном блоке и RU в русском блоке.

**Языки и счётчики карточек (2026-07-03):** `ru/en/de/it/es/pt/fr/ja` — по **1561** карточке каждый
(общий набор, отличаются только переводы подписи). `ar` отстаёт — 830 (не участвовал в последних батчах
пополнения). `ja` добавлен в два захода: сперва только подмножество из канала @Мирсмеха-1 (891 карточка,
`source` вида `mNNN_<videoId>`, чистые исходные фото были под рукой в `tmp/new-meme2/photos/`), затем
досчитаны недостающие 670 легаси-карточек (база ~370 + батч Карпенко ~300, разные легаси-нейминги
`NNN_id`/`kNNN_id`/`NNNN_id`) — их чистых исходных фото на диске уже не было (рабочие `tmp/`-папки
прошлых сессий, `tmp/meme2/translated`/`temp/new-meme/`, удалены как обычный scratch-мусор). Рабочий
способ восстановить фото без исходников: у каждой уже готовой `ru`-картинки прогнать все 31 партию через
агентов с computer vision (~22 карточки на агента), чтобы для каждой определить `topFrac`/`bottomFrac` —
где кончается белая плашка с текстом и начинается чистое фото (граница по пикселям **ненадёжна** на этом
легаси-наборе — разные разрешения 360×640/720×1280/1080×1920 и раскладки у старых батчей, у части
инвертирован порядок фото/текст, часть чёрно-белые, полароид-рамки и т.п. — чисто механический скрипт
регулярно промахивался мимо реальной границы). Затем `PIL.Image.crop()` по этим долям, и полученный кусок
фото прогнать через тот же рендер, что и для чистых исходников. Инструменты (не путать: два похожих, но
разных набора):
- `tmp/new-meme2/render_ja.py` + `integrate_ja.py` — 891 карточка Мирсмеха-1, из `photos/`.
- `tmp/new-meme2/extract_legacy_crops.py` (обрезка по `meta/legacy/boundaries.json`, слитым из 31
  `vbatches/vb_NN_result.json`) → `photos_legacy/` → `render_ja_legacy.py` + `integrate_ja_legacy.py`
  (стем = сам `id` карточки, БЕЗ префикса `m`, как и у остальных 7 языков для этих же карточек) — 670
  легаси-карточек.

Шрифт для japanese-рендера — `/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc` **index=0** (это
"Noto Sans CJK JP", не KR/SC/TC/HK — проверяй `ImageFont.truetype(path, size, index=N).getname()`, а не
угадывай по `fc-list`); перенос строк — посимвольный (без пробелов между словами) с базовым kinsoku
(`_NO_START` в `render_ja.py`/`render_ja_legacy.py`, не даёт начать строку с 、。」』 и т.п.).

Это только черновые `tmp/`-скрипты, не в `scripts/` — если возьмёшься за следующий язык (`ar` тоже
отстаёт на 731 карточку по тому же принципу), переносить/чистить по обстоятельствам.

**Гочи по агентам-переводчикам:** при батчах ~130+ подписей за раз изредка ловили деградацию генерации
(модель упирается в `max_tokens` и вместо перевода выдаёт бессмысленный шум) — чинится ретраем на МЕНЬШИХ
батчах (~30-35 подписей), не увеличением таймаута/повтором того же размера.

Где лежит:

- вход: `tmp/meme/translated/<lang>/*.jpg` + `tmp/meme2/translated/<lang>/*.jpg`;
- runtime assets: `assets/template-packs/new-memes/<lang>/*.jpg`;
- live packs: `data/packs/new-memes-<lang>-superadmin.json`;
- сборщик: `scripts/build-translated-meme-packs.mjs`.

Пересобрать из готовых переводных карточек:

```bash
node scripts/build-translated-meme-packs.mjs
```

Скрипт копирует картинки из обоих `translated`-наборов, создает по одному image-template на карточку и
пишет custom pack с `autoExpireMode: "per_account"`. Карточки конечные: когда у канала закончится
свободный набор, не подменяй его legacy `memes-*`; либо добавь новые проверенные картинки во входную
папку и пересобери, либо временно дай миксу перераспределиться на другие источники.

Правила:

- не подключать legacy `memes-*` обратно к armen;
- русский блок использует только `pack:new-memes-ru-superadmin`; legacy `memes-ru` не возвращать;
- входные картинки должны быть уже проверены на права, оскорбительный/protected-class контекст,
  чужие водяные знаки, логотипы и узнаваемые copyrighted templates;
- если нужны новые переводы/подписи через LLM/subagent, сначала спросить пользователя модель workflow;
- после пересборки проверить `npm run audit:armen:visual` и `npm run audit:armen:safety`.

Быстрая проверка счетчиков:

```bash
jq '{id,name,lang,cards:(.cards|length),templates:(.templates|length),autoExpireMode}' data/packs/new-memes-*-superadmin.json
```

### Источник картинок
- Папка пользователя `local-assets/Генератор мемов/` — 157 реакшн-шаблонов (коты/собаки/рыцари/комиксы/абсурд).
- **⚠️ Лицензия НЕ подтверждена** (сторонние мем-шаблоны). Поэтому дека `adminOnly`, плюс риск
  демонетизации (статичная картинка + подпись без озвучки = «inauthentic», см. memory
  youtube-monetization-strategy). Использовать осознанно; не выдавать за «точно чистое».
- Каталог всех 157 с кратким описанием — `tmp/meme-recheck/catalog.json` (+ `local-assets/Генератор мемов/КАТАЛОГ.md`):
  поля `desc/mood/memeUse/hasText` на картинку (сгенерированы Opus-vision по превью).

### Конвейер (модель caption-workflow — **Opus**, пользователь зафиксировал; для новых прогонов спросить заново)
1. **Превью + каталог:** `python3 tmp/meme-recheck/scout2.py` → `thumbs2/` (превью с крупным `#idx`) +
   `manifest2.json`. Описания картинок — Workflow `meme-describe` (Opus-vision) → `catalog.json`.
2. **Отбор пула:** `python3 tmp/meme-recheck/select200.py` → `selection200.json` + даунскейл исходников
   до ≤1600px в `src-scaled/meme_src_<idx>.jpg` (12-МБ PNG иначе вешают `setContent`) + батч-файлы
   `cap-batches/` (только `hasText=false`, без фонов-подложек). (Старый `select20.py` — для мини-теста.)
3. **🔒 Image-safety gate (ОБЯЗАТЕЛЕН):** Workflow `meme-image-safety` (Opus-vision) судит САМУ картинку
   (без учёта подписи, язык-независимо): дроп реальных узнаваемых людей/детей как объект насмешки,
   18+, насилие/политика, бодишейминг, религиозная карикатура, узнаваемые персонажи/бренды. Из 97 →
   63 safe (34 дропнуто). Безопасный пул (63 + 20 одобренных) → `safe-pool.json` + `cap-safe/batch_*.json`.
4. **Подписи (Opus, смотрят превью):** Workflow `meme-captions-ru-bulk` — ~8 русских подписей на
   шаблон; Workflow `meme-captions-multilang` — по 2–3 на en/de/fr/it (нативный юмор, НЕ перевод).
   Каждая ≤110 симв, ≤2 строк (`\n`), YouTube-safe. → `assemble_captions.py` → `captions-<lang>.json`.
5. **Тест-рендер (опц.):** `npx tsx src/scripts/memes-board-test.ts` (RU из `selection20`/`captions.json`)
   + Workflow `meme-qa` (Opus-vision: обрезка/попадание/safe) — для проверки раскладки на выборке.
6. **Сборка 5 дек:** `npx tsx src/scripts/memes-board-build.ts` — копирует общие
   `data/memes/photos/board-<idx>.jpg` и пишет `data/memes-{ru,en,de,fr,it}/{cards.json,index.json}`;
   чистит галерейные кэши; убирает временный `data/memes-board-ru`.

### Раскладка и рендер
- Шаблон `templates/meme-board.html`: белая плашка с подписью сверху (жирный sans, авто-подгон
  бинарным поиском; плашка `flex:0 0 auto` — НЕ сжимается, поэтому текст не обрезается; `MAXH=600`,
  чтобы картинке оставалось ≥~1050px), снизу `<img object-fit:contain>` (комиксы/реакшены НЕ кропаются),
  низ кадра — safe-поле ~196px под UI Shorts.
- Диспетч: флаги `meme:true` + `memeBoard:true` у деки (`decks.ts`). `meme:true` даёт мем-бит
  (`pickMemesAudio`), `ytMeta`(title=подпись) и загрузку `cards.json` бесплатно; `memeBoard:true`
  переключает рендер на board-ветку `renderMemeBoard` в `src/anecdotes/render.ts` (ДО ветки `meme`).
  Картинка инлайнится через `photoDataUri(card.photoFile)` (`src/memes/photos.ts`).
- Карточка: `{caption, photoFile, format:"board", theme, srcFile}` (как `memes-ru`, весь объект → JSON в `text`).

### Пополнение / новый батч
- Прогнать заново шаги 3→6 (или дописать в `captions-<lang>.json` строки `{idx, caption}` и `memes-board-build.ts`).
  Перед любым caption-workflow **спросить у пользователя модель** (правило про генерацию контента пака).
- Карточку можно дописать руками в `data/memes-<lang>/cards.json` (`{caption, photoFile:"board-<idx>.jpg", theme}`);
  затем `resetDeckCache` или рестарт.

### Проверка
- Все 5 дек на ЖИВОМ сервере (генераторы + рендер карточки сервером):
  `node --experimental-sqlite --import tsx src/scripts/check-deck-live.ts` → `tmp/meme-recheck/deck-verify/live-memes-<lang>.jpg`.
- Контактный лист RU-выборки — `tmp/meme-recheck/contact-sheet.png`.
- Бэкенд-правки (decks/render/photos) → **рестарт сервера**; фронт (дропдаун) → `npm run web:build`; `data/` gitignored.

## Мем-слот-шаблоны — «текст В слоте» (`memes-*`, no-copyright Pexels)

Развитие board-мемов: подпись вписывается ВНУТРЬ пустой зоны самой картинки (табличка/лист/билборд/
экран телефона-ноута-ТВ/рамка), а не плашкой сверху — это «готовый шаблон с местом для вставки», как
просил пользователь, но 100% **«без ап»** (только Pexels License; никаких чужих мем-картинок/IP/лиц —
готовые мем-паки из интернета это ~90% копирайт, см. [[no-copyright-assets-only]]). Карточка = обычная
board-карточка + поле **`slot:{x,y,w,h}`** (доли 0..1 картинки) → рендер уходит в слот-режим.

Рендер: `templates/meme-slot.html` + `buildMemeSlotHtml` в `src/memes/render.ts` (диспетч из
`buildMemeBoardHtml`, если у карточки есть `slot`). Картинка `object-fit:contain` на весь кадр; подпись
авто-вписывается в слот-бокс (JS маппит natural→displayed по contain-rect), **целыми словами**
(whole-word fit, без переноса посреди слова), тёмный текст + белый ореол для читаемости на светлых
табличках; нижние 196px — safe-зона Shorts.

Конвейер (всё в `tmp/meme-recheck/`; `PEXELS_API_KEY` в `.env`):
1. **Сбор:** `node tmp/meme-recheck/pull-slots.mjs` — Pexels по insert-slot темам (человек с пустой
   табличкой/листом, билборд, пустой экран, рамка) → `newimg/slots/*.jpg` + `manifest.jsonl`.
2. **Авто-детект слота (чистый PIL, без numpy):** находит крупную яркую ровную прямоугольную область =
   слот (BFS по downscale-маске V>0.72 & S<0.18; score = площадь×заполненность×(1−border)). Пишет
   `newimg/slots-detect.json` + рисует проверочные монтажи с красными рамками (смотреть глазами).
3. **Отбор:** топ по score, дедуп по теме (cap 3), инсет 6% от краёв → `newimg/slots-selection.json`
   (boardIdx с 158, `photoFile=board-<idx>.jpg` в `data/memes/photos/`, `slot`). Масштаб ≤1600px.
   Дропать слоты с `w<0.32` (узкие ломают русские длинные слова) и где текст не попал на сам слот.
4. **Рендер-проверка:** `node --import tsx src/scripts/slot-render-test.ts` (тест-подписи) и
   `slot-verify.ts` (реальные) → монтаж → глазами. E2E через сервер: `tmp/meme-recheck/e2e-slot.ts`.
5. **Подписи (СНАЧАЛА спросить модель у пользователя; были Sonnet):** агенты ВИДЯТ картинку →
   `4 RU + 2 EN + 2 DE + 2 FR + 2 IT` на шаблон, короткие под слот, нативные (не перевод), YouTube-safe →
   `newimg/cap-out/slotcap-NN.json` (батчи `cap-batches/slotbatch-NN.json`).
6. **Сборка:** `node tmp/meme-recheck/assemble-slots.mjs` — дописывает карточки
   `{caption, photoFile, format:"board", theme, slot}` в `data/memes-<lang>/cards.json` (бэкап
   `.bak-preslot`). **Рестарт сервера** (правка `src/memes/render.ts` + deck-кэш).

`data/memes/photos/board-*.jpg` и `cards.json` — gitignored (как все memes-данные); воспроизводимо
повтором pull→detect→select.

## Оптические иллюзии — `illusions-{en,de,it,es,ru}` (admin-only, 77×5, видео)

Анимированные оптические иллюзии (вдохновлено [[illusions-3d]], но НЕ копия: там один класс — крутящиеся
многогранники; здесь МНОГО разных классов: спираль-последействие, café wall, мерцающая решётка, Эббингауз,
шахматная тень Адельсона, Канижа, Пенроуз, невозможный куб/трезубец, ваза Рубина, Мюллер-Лайер, Понцо,
Цёлльнер, Поггендорф, спираль Фрейзера, Бенхам, motion-induced blindness, барбер-поул, moiré pulse,
hypnotic tunnel, kinetic depth dots, aperture bars, neon ladder, ray afterimage и т.д.). Всё —
**детерминированный canvas-рендер (математика → 0 риска страйка)**, тёмная эстетика, английский хук в safe-зоне,
бесплатный ffmpeg-эмбиент. 77 уникальных ТИПОВ, локализованы на 5 языков (геометрия одна, меняется только
текст-хук) = **5 дек по 77 = 385 клипов**. Деки `preFact+adminOnly+grantable`.

Всё в `scripts/illusions-en/`:
- `skeleton-v2.html` — общий host. Каждая иллюзия = самодостаточный `illusions/<key>.html` = копия host'а,
  где правится ТОЛЬКО блок `SPEC` (key/name/title/dur/fps/light) и тело `drawIllusion(ctx,p,CW,CH,H)`.
  Host даёт: `H.rng/lerp/clamp/smooth/TAU/cx/cy/safe/maxR`, палитры `H.PALETTES`/`H.pal(t)`, параметры
  вариации `H.v` (palette/dir/turns/speed/seed/density/angle — задел под варианты), и три рендера:
  `renderFrame(p)` (со встроенным титром, для превью), `renderBase(p)` (ТОЛЬКО геометрия, без титра —
  рендерим ОДИН раз) и `renderTitle(text)` (ПРОЗРАЧНЫЙ PNG только с титром — для оверлея локализаций).
  Так геометрия рендерится один раз, а подписи на 5 языков накладываются ffmpeg-оверлеем (а не 5× полный рендер).
- Превью кадров: `render-samples.mjs` (v1) / `render-samples-v2.mjs <html> <prefix> <progresses> '<variantJSON>'`.
- `add-sticky-illusions.mjs` — воспроизводимо добавляет вторую волну 26 "залипательных" типов поверх
  `skeleton-v2.html` и дописывает их переводы в `localize.json`.
- `skeleton.html` (v1) → миграция на v2 детерминантным `upgrade-host.mjs` (вырезает SPEC+drawIllusion по
  маркерам с отступом РОВНО 2 пробела — внутри-функции `// ====` с отступом ≥4 НЕ должны совпадать, иначе
  обрезает функцию; бэкап в `illusions-v1-backup/`).

Пайплайн пересборки/локализации (модель для LLM-шагов СНАЧАЛА спросить у пользователя):
1. Иллюзии-типы создаются Opus-воркфлоу (автор пишет canvas-код → рендерит кадры → состязательная
   ВИЗУАЛЬНАЯ проверка агентом по пикселям → фикс). Заголовки — английские хуки, пишутся руками/агентом.
2. `gen-manifest-en.mjs` → `manifest.json` (читает SPEC каждой через `getSpec`).
3. `gen-matrix-51.mjs` → `matrix.json` (77 дизайнов, `variant:{}`) + `hooks.json` (англ. заголовок на дизайн).
4. **Перевод** хуков: воркфлоу `scratchpad/illusions-en-translate.js` (Opus, по агенту на язык; хуки
   ЗАШИТЫ в скрипт — `args` через Workflow-тул не доходил надёжно) → `assemble-localize.mjs <out>` →
   `localize.json` `{id:{en,de,it,es,ru}}` (afterimage пустой — рисует свой текст сам).
5. `build-base.mjs` (`SKIP_EXISTING=1`) → 77 titleless-mp4 в `tmp/illusions-en/base/`.
6. `make-titles.mjs` → 380 прозрачных подписей `tmp/illusions-en/titles/<id>_<lang>.png`.
7. `compose-publish.mjs` → на каждый (lang×дизайн): оверлей подписи (или без — для afterimage) + эмбиент →
   `assets/fact-videos/illusions-<lang>/<id>.mp4`, **хардлинк** в `data/output/admin-demos/<lang>-<id>.mp4`
   (+постер), запись `data/illusions-<lang>/videos.json` и пакета в `admin-demos/manifest.json`.
   `SKIP_EXISTING=1` пропускает уже готовые финальные MP4 и кодирует только недостающие.
8. Регистрация дек в `src/anecdotes/decks.ts` (объект + `DECK_LANG`) и `web/src/lib/deck.ts`
   (`DECK_GLOSS_RU`/`DECK_LANG`/`BUILTIN_DECKS`) → `npm run web:build` → **рестарт сервера**.

Звук: `assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus`; ambient-синтез удалён.
Новый ЯЗЫК: добавить в `compose-publish.mjs ALL_LANGS`/`PACK_TITLE`, перевести хуки, зарегать деку.
Новый ТИП: создать `illusions/<key>.html` от `skeleton-v2.html`, прогнать шаги 2→8.
**Доступ:** админ видит все 5 в Нарезках без рестарта (`deckAllowed`/`files.ts` admin-bypass, манифест читается
свежим); рестарт нужен лишь для не-админ-грантов и канал-источника.
ВАЖНО (рендер кириллицы/умляутов/ñ в headless Chrome): титры рисуются шрифтом DejaVu Sans — все 5 языков
рендерятся корректно (проверено на ru/de/es). Вариации (1 тип → N обликов через `H.v`) — задел готов
(`variants/<key>.json` + `gen-matrix-from-variants.mjs`), но в текущем паке НЕ используются (77 = по 1 на тип).

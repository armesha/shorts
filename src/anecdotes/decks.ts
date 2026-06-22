// Multi-language "decks" (anecdote sources). Each deck = a content pack + its branding.
// Deck id doubles as the language code (ru | de | it), so account.lang maps straight to a deck.
export interface Deck {
  id: string;
  name: string; // UI label AND on-image channel branding (e.g. "Русские анекдоты")
  dir: string; // data dir (relative to cwd) with pack-*.json + titled.json + index.json
  source: string; // build source file (relative to cwd) — used by build.ts only
  emoji: string; // appended to the YouTube title
  hashtags: string; // appended to the YouTube description
  tags: string[]; // YouTube tags
  genericTitles: string[]; // fallback headings when an anecdote has no title yet
  /** When true, render via the lifehack (profession) layout instead of the anecdote card. */
  lifehack?: boolean;
  /** When true, this deck's items are psychology cards (whole card as JSON in `text`), rendered via templates/psych.html. */
  psych?: boolean;
  /** When true, this deck's items are Islamic cards (Quran/hadith/dua; whole card as JSON in `text`), rendered via templates/islamic.html. */
  islamic?: boolean;
  /** When true, this deck's items are Christian (English KJV Bible) cards (whole card as JSON in `text`), rendered via templates/christian.html. */
  christian?: boolean;
  /** When true, this deck's items are meme cards (whole card as JSON in `text`: caption + optional Pexels photoFile), rendered via templates/meme.html. */
  meme?: boolean;
  /** When true (together with meme), render via the "board" layout — caption band on top + the
   *  template image below (templates/meme-board.html) — instead of the caption-overlay meme.html. */
  memeBoard?: boolean;
  /** When true, this deck renders DETERMINISTICALLY per card (fixed visual, no random bg) → it is a
   *  static "gallery" pack: shown in the Gallery page where you browse cards and pick a specific one. */
  gallery?: boolean;
  /** When true, this deck is visible & usable ONLY by admins — hidden from every non-admin regardless of per-user deck settings. */
  adminOnly?: boolean;
  /** Admin-only built-in deck that can be explicitly granted to non-admin users from /users. */
  grantable?: boolean;
  /** Lifehack background style suffix, e.g. "chaplin" → profession_<key>_chaplin.jpg (with moustache).
   *  Omitted → the plain profession_<key>.jpg (no moustache). */
  lifehackVariant?: string;
  /** When true, render anecdotes on the themed russian_jokes/* scenes (text in each bg's paper
   *  safe-zone) via templates/anecdote-russian.html instead of the flat textured card. */
  russianBg?: boolean;
  /** When true, this deck is NOT rendered from text — its items are PRE-BUILT mp4 videos
   *  (voiceover + stock footage + subtitles) listed in <dir>/videos.json, files in assets/fact-videos/.
   *  Generation copies the chosen mp4 into the library instead of rendering a card (see server/fact-gen.ts). */
  preFact?: boolean;
  /** When true, generation picks the first unused item by videos.json order instead of random. */
  sequential?: boolean;
}

export const DECKS: Deck[] = [
  {
    id: "ru",
    name: "Русские анекдоты",
    dir: "data/anecdotes",
    source: "Русские анекдоты/anek_djvu.txt",
    emoji: "😂",
    hashtags: "#анекдоты #юмор #приколы #смех #shorts",
    tags: ["анекдоты", "юмор", "приколы", "смешное", "смех", "анекдот", "ржака", "shorts"],
    genericTitles: ["Анекдот", "Свежий анекдот", "Посмеёмся?", "Из жизни", "Народное", "Анекдот дня"],
    russianBg: true, // рендер на тематических сценах russian_jokes/* (лист на кухне/в бане/в поезде…)
  },
  {
    id: "de",
    name: "Deutsche Witze",
    dir: "data/anecdotes-de",
    source: "corpora/witze.sql",
    emoji: "😂",
    hashtags: "#Witze #Humor #lustig #comedy #shorts",
    tags: ["Witze", "Humor", "lustig", "Comedy", "Witz", "Spaß", "shorts"],
    genericTitles: ["Witz", "Witz des Tages", "Zum Lachen", "Kurz & gut", "Schon gehört?", "Lustig"],
  },
  {
    id: "it",
    name: "Barzellette Italiane",
    dir: "data/anecdotes-it",
    source: "corpora/it-barzellette.jsonl",
    emoji: "😂",
    hashtags: "#barzellette #umorismo #divertente #comico #shorts",
    tags: ["barzellette", "umorismo", "divertente", "comico", "ridere", "barzelletta", "shorts"],
    genericTitles: ["Barzelletta", "Ridiamo?", "Che ridere", "Battuta del giorno", "Senti questa", "Comica"],
  },
  {
    id: "fr",
    name: "Blagues françaises",
    dir: "data/anecdotes-fr",
    source: "corpora/blagues.json",
    emoji: "😂",
    hashtags: "#blagues #humour #drôle #rire #shorts",
    tags: ["blagues", "humour", "drôle", "rire", "blague", "comédie", "shorts"],
    genericTitles: ["Blague", "Blague du jour", "Pour rire", "Tu connais celle-là ?", "Écoute ça", "Drôle"],
  },
  {
    id: "tips",
    name: "Народные лайфхаки",
    dir: "data/tips",
    source: "corpora/tips.json",
    emoji: "💡",
    hashtags: "#лайфхаки #советы #полезное #лайфхак #shorts",
    tags: ["лайфхаки", "советы", "полезное", "лайфхак", "быт", "хитрости", "shorts"],
    genericTitles: ["Лайфхак", "Полезный совет", "На заметку", "Хитрость", "Совет дня", "Запомни"],
    lifehack: true,
    gallery: true,
  },
  {
    id: "tips-de",
    name: "Deutsche Lifehacks",
    dir: "data/tips-de",
    source: "corpora/tips-de.json",
    emoji: "💡",
    hashtags: "#lifehacks #tipps #alltag #lifehack #shorts",
    tags: ["lifehacks", "tipps", "alltagstipps", "lifehack", "haushalt", "tricks", "shorts"],
    genericTitles: ["Lifehack", "Nützlicher Tipp", "Gut zu wissen", "Profi-Trick", "Tipp des Tages", "Merk dir das"],
    lifehack: true,
    gallery: true,
    lifehackVariant: "chaplin", // мужчины с усами Чаплина (немецкая дека)
  },
  {
    id: "psych",
    name: "Psychologie (DE)",
    dir: "data/psych", // cards.json (structured psychology cards), not pack-*.json
    source: "",
    emoji: "🧠",
    hashtags: "#psychologie #mentalegesundheit #achtsamkeit #selbstliebe #shorts",
    tags: ["psychologie", "mentale gesundheit", "achtsamkeit", "selbstliebe", "psyche", "mindset", "shorts"],
    genericTitles: ["Psychologie", "Notiz", "Erkenntnis"],
    psych: true,
    gallery: true,
  },
  {
    id: "islamic",
    name: "آيات وأذكار",
    dir: "data/islamic", // cards.json (Quran ayahs + hadith + dua, exact Arabic), not pack-*.json
    source: "",
    emoji: "🕌",
    hashtags: "#قرآن #اسلام #حديث #دعاء #ذكر #shorts",
    tags: ["قرآن", "اسلام", "حديث", "دعاء", "اذكار", "quran", "islam", "dua", "shorts"],
    genericTitles: ["آية", "حديث", "دعاء", "ذكر"],
    islamic: true,
  },
  {
    id: "christian",
    name: "Holy Bible · KJV",
    dir: "data/christian", // cards.json (English KJV Bible passages, exact text), not pack-*.json
    source: "",
    emoji: "✝️",
    hashtags: "#bible #jesus #faith #scripture #god #christian #kjv #shorts",
    tags: ["bible", "scripture", "jesus", "faith", "god", "christian", "kjv", "bible verse", "daily verse", "shorts"],
    genericTitles: ["Holy Bible", "Scripture", "Bible Verse", "Word of God"],
    christian: true,
    adminOnly: true, // new packs are admin-only by default
  },
  {
    id: "memes-ru",
    name: "Мемы (RU)",
    dir: "data/memes-ru", // cards.json: {caption, imageQuery, photoFile?, format, theme}; whole card as JSON in `text`
    source: "",
    emoji: "😂",
    hashtags: "#мемы #юмор #приколы #relatable #shorts",
    tags: ["мемы", "мем", "юмор", "приколы", "смешное", "relatable", "shorts"],
    genericTitles: ["Мем", "Мемы", "Это про меня", "Знакомо?"],
    meme: true,
    memeBoard: true, // board layout: caption above the meme-template image (templates/meme-board.html)
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-en",
    name: "Memes (EN)",
    dir: "data/memes-en",
    source: "",
    emoji: "😂",
    hashtags: "#memes #funny #relatable #meme #shorts",
    tags: ["memes", "meme", "funny", "relatable", "humor", "lol", "shorts"],
    genericTitles: ["Meme", "Memes", "So relatable", "Me too"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-de",
    name: "Memes (DE)",
    dir: "data/memes-de",
    source: "",
    emoji: "😂",
    hashtags: "#memes #humor #lustig #relatable #shorts",
    tags: ["memes", "meme", "humor", "lustig", "relatable", "shorts"],
    genericTitles: ["Meme", "Memes", "Kennst du das?", "Voll relatable"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-fr",
    name: "Mèmes (FR)",
    dir: "data/memes-fr",
    source: "",
    emoji: "😂",
    hashtags: "#mèmes #humour #drôle #relatable #shorts",
    tags: ["mèmes", "mème", "humour", "drôle", "relatable", "shorts"],
    genericTitles: ["Mème", "Mèmes", "C'est moi", "Tellement vrai"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-it",
    name: "Meme (IT)",
    dir: "data/memes-it",
    source: "",
    emoji: "😂",
    hashtags: "#meme #umorismo #divertente #relatable #shorts",
    tags: ["meme", "umorismo", "divertente", "relatable", "ironia", "shorts"],
    genericTitles: ["Meme", "Io ogni giorno", "Troppo vero", "Mi rivedo"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "fact-en",
    name: "Interesting Facts",
    dir: "data/fact-videos", // videos.json = [{file,title,text,series}] of pre-built mp4s in assets/fact-videos/
    source: "",
    emoji: "🤯",
    hashtags: "#facts #didyouknow #interestingfacts #amazingfacts #shorts",
    tags: ["facts", "interesting facts", "did you know", "amazing facts", "fun facts", "science", "shorts"],
    genericTitles: ["Did You Know?", "Mind-Blowing Fact", "Interesting Fact", "You Won't Believe This"],
    adminOnly: true, // pre-built video pack — admin-only
    preFact: true,
  },
  {
    id: "quotes-de-1",
    name: "Politiker-Zitate (DE) 1",
    dir: "data/quotes-de-1", // videos.json = [{file,title,text,author}]; pre-built mp4s in assets/fact-videos/
    source: "",
    emoji: "🇩🇪",
    hashtags: "#zitate #politik #geschichte #deutschland #staatsmänner #shorts",
    tags: ["zitate", "politik", "geschichte", "deutschland", "staatsmänner", "zitat", "shorts"],
    genericTitles: ["Zitat", "Berühmtes Zitat", "Politiker-Zitat", "Worte der Geschichte"],
    adminOnly: true, // pre-built video pack — admin-only
    grantable: true,
    preFact: true,
  },
  {
    id: "quotes-de-2",
    name: "Politiker-Zitate (DE) 2",
    dir: "data/quotes-de-2", // videos.json = [{file,title,text,author}]; pre-built mp4s in assets/fact-videos/
    source: "",
    emoji: "🇩🇪",
    hashtags: "#zitate #politik #geschichte #deutschland #staatsmänner #shorts",
    tags: ["zitate", "politik", "geschichte", "deutschland", "staatsmänner", "zitat", "shorts"],
    genericTitles: ["Zitat", "Berühmtes Zitat", "Politiker-Zitat", "Worte der Geschichte"],
    adminOnly: true, // pre-built video pack — admin-only
    grantable: true,
    preFact: true,
  },
  {
    id: "quotes-de-3",
    name: "Politiker-Zitate (DE) 3",
    dir: "data/quotes-de-3", // videos.json = [{file,title,text,author}]; pre-built mp4s in assets/fact-videos/
    source: "",
    emoji: "🇩🇪",
    hashtags: "#zitate #politik #geschichte #deutschland #staatsmänner #shorts",
    tags: ["zitate", "politik", "geschichte", "deutschland", "staatsmänner", "zitat", "shorts"],
    genericTitles: ["Zitat", "Berühmtes Zitat", "Politiker-Zitat", "Worte der Geschichte"],
    adminOnly: true, // pre-built video pack — admin-only
    grantable: true,
    preFact: true,
  },
  {
    id: "space",
    name: "Space",
    dir: "data/space", // videos.json = [{file,title,text}] of pre-built montage mp4s in assets/fact-videos/space/
    source: "",
    emoji: "🚀",
    hashtags: "#space #nasa #astronomy #universe #cosmos #shorts",
    tags: ["space", "nasa", "astronomy", "universe", "cosmos", "science", "shorts"],
    genericTitles: ["Space", "The Universe", "Cosmos", "Deep Space"],
    adminOnly: true, // pre-built montage pack — admin-only
    preFact: true,
  },
  {
    id: "visual-riddles",
    name: "Вижу Ответ",
    dir: "data/visual-riddles", // videos.json = [{file,title,text}] synced from /clip-demos visual-riddles
    source: "",
    emoji: "🧩",
    hashtags: "#загадки #ребусы #головоломки #внимание #shorts",
    tags: ["загадки", "ребусы", "головоломки", "визуальные загадки", "логика", "внимание", "shorts"],
    genericTitles: ["Вижу Ответ", "Визуальная загадка", "Задача на внимание", "Ребус"],
    adminOnly: true, // pre-built visual riddle pack — admin-only
    preFact: true,
  },
  {
    id: "animal-superheroes",
    name: "ЗвероГерои",
    dir: "data/animal-superheroes", // videos.json = numbered story episodes with voiceover + subtitles
    source: "",
    emoji: "🦊",
    hashtags: "#животные #супергерои #мультфильм #комикс #shorts",
    tags: ["животные", "супергерои", "комикс", "мультфильм", "история", "shorts"],
    genericTitles: ["ЗвероГерои", "Комикс про животных", "Новая серия", "Супергерои животных"],
    adminOnly: true, // pre-built serial animal comic pack — admin-only
    preFact: true,
    sequential: true,
  },
  {
    id: "animal-superheroes-en",
    name: "Animal Heroes",
    dir: "data/animal-superheroes-en", // videos.json mirrors animal-superheroes, but with English voiceover/subtitles
    source: "",
    emoji: "🦊",
    hashtags: "#animals #superheroes #comic #cartoon #shorts",
    tags: ["animals", "superheroes", "comic", "cartoon", "story", "shorts"],
    genericTitles: ["Animal Heroes", "Animal Comic", "New Episode", "Animal Superheroes"],
    adminOnly: true, // pre-built serial animal comic pack — admin-only
    preFact: true,
    sequential: true,
  },
];

export const DEFAULT_DECK = "ru";

// Кастомные («ручные») паки не входят в статический реестр DECKS — их id вида "pack:<packId>".
// Для них синтезируем минимальную деку (без файлового IO), чтобы видео паков в библиотеке/истории/
// выкладке имели вменяемые метаданные и НЕ ломали существующих потребителей getDeck/ytMeta.
export function isPackDeckId(id?: string | null): boolean {
  return !!id && id.startsWith("pack:");
}
// Язык встроенной деки (для проверки «язык контента = язык канала»). Паки несут свой lang отдельно.
const DECK_LANG: Record<string, string> = {
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en",
  tips: "ru", "tips-de": "de", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "quotes-de-1": "de", "quotes-de-2": "de", "quotes-de-3": "de", space: "en", "visual-riddles": "ru", "animal-superheroes": "ru", "animal-superheroes-en": "en",
  "memes-ru": "ru", "memes-en": "en", "memes-de": "de", "memes-fr": "fr", "memes-it": "it",
};
export function deckLang(id: string): string {
  return DECK_LANG[id] || "";
}
function synthPackDeck(id: string): Deck {
  return {
    id,
    name: "Свой пак",
    dir: "",
    source: "",
    emoji: "✨",
    hashtags: "#shorts",
    tags: ["shorts"],
    genericTitles: ["Карточка"],
  };
}

export function getDeck(id?: string | null): Deck {
  if (isPackDeckId(id)) return synthPackDeck(id as string);
  return DECKS.find((d) => d.id === id) ?? DECKS.find((d) => d.id === DEFAULT_DECK)!;
}

export function pickGenericTitle(deck: Deck): string {
  return deck.genericTitles[Math.floor(Math.random() * deck.genericTitles.length)];
}

// ytMeta() + psychDescription() (YouTube-метаданные / распаковка карточек-JSON) вынесены в ./yt-meta.ts,
// чтобы этот файл остался чистым реестром дек. Импортируй их оттуда (а не отсюда), иначе будет цикл.

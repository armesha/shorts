// Multi-language "decks" (anecdote sources). Each deck = a content pack + its branding.
// Deck id doubles as the language code (ru | de | it), so account.lang maps straight to a deck.
export interface Deck {
  id: string;
  name: string; // UI/metadata label; on-card channel plaques are intentionally not rendered.
  dir: string; // data dir (relative to cwd) with pack-*.json + titled.json + index.json
  source: string; // build source file (relative to cwd) — used by build.ts only
  emoji: string; // appended to the YouTube title
  hashtags: string; // appended to the YouTube description
  tags: string[]; // YouTube tags
  genericTitles: string[]; // fallback headings when an anecdote has no title yet
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
  /** When true, this deck's items are «Что выберешь?» cards (whole card as JSON in `text`:
   *  {q, a:{label,desc,photoFile}, b:{label,desc,photoFile}}), rendered via templates/choose.html. */
  choose?: boolean;
  /** When true, this deck renders DETERMINISTICALLY per card (fixed visual, no random bg) → it is a
   *  static "gallery" pack: shown in the Gallery page where you browse cards and pick a specific one. */
  gallery?: boolean;
  /** When true, this deck is visible & usable ONLY by admins — hidden from every non-admin regardless of per-user deck settings. */
  adminOnly?: boolean;
  /** Admin-only built-in deck that can be explicitly granted to non-admin users from /users. */
  grantable?: boolean;
  /** When true, render anecdotes on the themed russian_jokes/* scenes (text in each bg's paper
   *  safe-zone) via templates/anecdote-russian.html instead of the flat textured card. */
  russianBg?: boolean;
  /** When true, this deck is NOT rendered from text — its items are PRE-BUILT mp4 videos
   *  (voiceover + stock footage + subtitles) listed in <dir>/videos.json, files in assets/fact-videos/.
   *  Generation copies the chosen mp4 into the library instead of rendering a card (see server/fact-gen.ts). */
  preFact?: boolean;
  /** Multilingual sourced quote cards rendered dynamically from titled.json (not pre-built MP4). */
  quote?: boolean;
  /** Quote cards rendered dynamically but assembled with an on-demand TTS voiceover. */
  quoteVideo?: boolean;
  /** Deck-specific audio bed without changing render/data dispatch. */
  audioProfile?: "islamic" | "christian" | "memes" | "jokes";
  /** Pre-built long compilation assembled from many short readable scenes into one 5-15 minute video. */
  longVideo?: boolean;
  /** When true, generation picks the first unused item by videos.json order instead of random. */
  sequential?: boolean;
}

export const MANUAL_VIDEO_DECK = "manual";

function quoteDeckAudioProfile(id: string): Deck["audioProfile"] {
  if (id === "islamic-quotes-ar" || id === "islamic-facts-ar") return "islamic";
  if (id === "christian-quotes-en" || id === "christian-facts-en") return "christian";
  return undefined;
}

function quoteDeck(input: {
  id: string;
  name: string;
  lang: string;
  hashtags: string;
  tags: string[];
  titles: string[];
  source?: string;
  dir?: string;
}): Deck {
  return {
    id: input.id,
    name: input.name,
    dir: input.dir ?? `data/${input.id}`,
    source: input.source ?? "Wikiquote API source ledger in sources.json",
    emoji: "💬",
    hashtags: input.hashtags,
    tags: input.tags,
    genericTitles: input.titles,
    adminOnly: true,
    grantable: true,
    quote: true,
    gallery: true,
    audioProfile: quoteDeckAudioProfile(input.id),
  };
}

function quoteVideoDeck(input: {
  id: string;
  name: string;
  dir: string;
  hashtags: string;
  tags: string[];
  titles: string[];
}): Deck {
  return {
    id: input.id,
    name: input.name,
    dir: input.dir,
    source: "Wikiquote source ledger; edge-tts voiceover generated on demand",
    emoji: "🎙️",
    hashtags: input.hashtags,
    tags: input.tags,
    genericTitles: input.titles,
    adminOnly: true,
    grantable: true,
    quote: true,
    quoteVideo: true,
    gallery: true,
  };
}

export const DECKS: Deck[] = [
  {
    id: "ru",
    name: "Русские анекдоты",
    dir: "data/anecdotes",
    source: "local-assets/Русские анекдоты/anek_djvu.txt",
    emoji: "😂",
    hashtags: "#анекдоты #юмор #приколы #смех #shorts",
    tags: ["анекдоты", "юмор", "приколы", "смешное", "смех", "анекдот", "ржака", "shorts"],
    genericTitles: ["Анекдот", "Свежий анекдот", "Посмеёмся?", "Из жизни", "Народное", "Анекдот дня"],
    russianBg: true, // рендер на тематических сценах russian_jokes/* (лист на кухне/в бане/в поезде…)
    audioProfile: "jokes",
  },
  {
    id: "de",
    name: "Deutsche Witze",
    dir: "data/anecdotes-de",
    source: "local-assets/corpora/witze.sql",
    emoji: "😂",
    hashtags: "#Witze #Humor #lustig #comedy #shorts",
    tags: ["Witze", "Humor", "lustig", "Comedy", "Witz", "Spaß", "shorts"],
    genericTitles: ["Witz", "Witz des Tages", "Zum Lachen", "Kurz & gut", "Schon gehört?", "Lustig"],
    audioProfile: "jokes",
  },
  {
    id: "it",
    name: "Barzellette Italiane",
    dir: "data/anecdotes-it",
    source: "local-assets/corpora/it-barzellette.jsonl",
    emoji: "😂",
    hashtags: "#barzellette #umorismo #divertente #comico #shorts",
    tags: ["barzellette", "umorismo", "divertente", "comico", "ridere", "barzelletta", "shorts"],
    genericTitles: ["Barzelletta", "Ridiamo?", "Che ridere", "Battuta del giorno", "Senti questa", "Comica"],
    audioProfile: "jokes",
  },
  {
    id: "fr",
    name: "Blagues françaises",
    dir: "data/anecdotes-fr",
    source: "local-assets/corpora/blagues.json",
    emoji: "😂",
    hashtags: "#blagues #humour #drôle #rire #shorts",
    tags: ["blagues", "humour", "drôle", "rire", "blague", "comédie", "shorts"],
    genericTitles: ["Blague", "Blague du jour", "Pour rire", "Tu connais celle-là ?", "Écoute ça", "Drôle"],
    audioProfile: "jokes",
  },
  {
    id: "en",
    name: "English Jokes",
    dir: "data/anecdotes-en",
    source: "Project Gutenberg public-domain joke books; see data/anecdotes-en/sources.json",
    emoji: "😂",
    hashtags: "#jokes #humor #funny #laugh #comedy #shorts",
    tags: ["jokes", "humor", "funny", "laugh", "comedy", "shorts"],
    genericTitles: ["Joke", "Quick Joke", "Funny Story", "A Little Laugh", "Classic Joke", "One More Joke"],
    audioProfile: "jokes",
  },
  {
    id: "pt",
    name: "Contos engraçados",
    dir: "data/anecdotes-pt",
    source: "Public-domain Portuguese Wikisource books; see data/anecdotes-pt/sources.json",
    emoji: "😂",
    hashtags: "#piadas #humor #contos #rir #shorts",
    tags: ["piadas", "humor", "contos", "anedotas", "rir", "shorts"],
    genericTitles: ["Conto curto", "Piada clássica", "Para rir", "História curta", "Conto popular"],
    adminOnly: true,
    grantable: true,
    gallery: true,
    audioProfile: "jokes",
  },
  {
    id: "ar",
    name: "نوادر عربية",
    dir: "data/anecdotes-ar",
    source: "Arabic Wikisource public-domain classics; see data/anecdotes-ar/sources.json",
    emoji: "😂",
    hashtags: "#نوادر #طرائف #ضحك #كوميديا #shorts",
    tags: ["نوادر", "طرائف", "ضحك", "كوميديا", "shorts"],
    genericTitles: ["طرفة", "نادرة قصيرة", "ضحكة قديمة", "جواب سريع", "موقف طريف"],
    adminOnly: true,
    grantable: true,
    gallery: true,
    audioProfile: "jokes",
  },
  {
    id: "hi",
    name: "हिंदी हास्य कथाएँ",
    dir: "data/anecdotes-hi",
    source: "Hindi Wikisource public-domain classics; see data/anecdotes-hi/sources.json",
    emoji: "😂",
    hashtags: "#हास्य #चुटकुले #मजेदार #हंसी #shorts",
    tags: ["हास्य", "चुटकुले", "मजेदार", "हंसी", "क्लासिक हास्य", "shorts"],
    genericTitles: ["हास्य कथा", "छोटी हँसी", "मजेदार बात", "क्लासिक मजाक", "हल्की मुस्कान"],
    adminOnly: true,
    grantable: true,
    gallery: true,
    audioProfile: "jokes",
  },
  {
    id: "id",
    name: "Cerita Lucu Indonesia",
    dir: "data/anecdotes-id",
    source: "Indonesian Wikibooks and Abu Nawas source ledger; see data/anecdotes-id/sources.json",
    emoji: "😂",
    hashtags: "#humor #lucu #ceritalucu #komedi #shorts",
    tags: ["humor", "lucu", "cerita lucu", "komedi", "anekdot", "shorts"],
    genericTitles: ["Cerita lucu", "Humor singkat", "Bikin senyum", "Kisah lucu", "Anekdot klasik"],
    adminOnly: true,
    grantable: true,
    gallery: true,
    audioProfile: "jokes",
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
    id: "memes-pt",
    name: "Memes (PT)",
    dir: "data/memes-pt",
    source: "scripts/build-portuguese-board-memes.mjs",
    emoji: "😂",
    hashtags: "#memes #humor #engraçado #relatable #shorts",
    tags: ["memes", "meme", "humor", "engraçado", "relatable", "shorts"],
    genericTitles: ["Meme", "Memes", "Sou eu", "Muito real"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-es",
    name: "Memes (ES)",
    dir: "data/memes-es",
    source: "scripts/build-extra-board-memes.mjs",
    emoji: "😂",
    hashtags: "#memes #humor #gracioso #relatable #shorts",
    tags: ["memes", "meme", "humor", "gracioso", "relatable", "shorts"],
    genericTitles: ["Meme", "Soy yo", "Muy real", "Gracioso"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-hi",
    name: "मीम्स (HI)",
    dir: "data/memes-hi",
    source: "scripts/build-extra-board-memes.mjs",
    emoji: "😂",
    hashtags: "#मीम #हास्य #मजेदार #relatable #shorts",
    tags: ["मीम", "हास्य", "मजेदार", "relatable", "shorts"],
    genericTitles: ["मीम", "बहुत असली", "यह मैं हूं", "मजेदार"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-id",
    name: "Memes (ID)",
    dir: "data/memes-id",
    source: "scripts/build-extra-board-memes.mjs",
    emoji: "😂",
    hashtags: "#meme #humor #lucu #relatable #shorts",
    tags: ["meme", "humor", "lucu", "relatable", "shorts"],
    genericTitles: ["Meme", "Aku banget", "Terlalu nyata", "Lucu"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "memes-ar",
    name: "ميمز (AR)",
    dir: "data/memes-ar",
    source: "scripts/build-extra-board-memes.mjs",
    emoji: "😂",
    hashtags: "#ميمز #ضحك #كوميديا #relatable #shorts",
    tags: ["ميمز", "ضحك", "كوميديا", "relatable", "shorts"],
    genericTitles: ["ميم", "واقعي جدًا", "هذا أنا", "مضحك"],
    meme: true,
    memeBoard: true,
    gallery: true,
    adminOnly: true,
  },
  {
    id: "choose",
    name: "Что выберешь?",
    dir: "data/choose", // cards.json: {q, a:{label,desc,photoFile}, b:{label,desc,photoFile}}; whole card as JSON in `text`
    source: "",
    emoji: "🤔",
    hashtags: "#чтовыберешь #выбор #тест #опрос #дилемма #shorts",
    tags: ["что выберешь", "выбор", "тест", "опрос", "дилемма", "или или", "shorts"],
    genericTitles: ["Что выберешь?", "А ты что выберешь?", "Сложный выбор", "Выбирай", "Что бы ты выбрал?"],
    choose: true,
    gallery: true, // детерминированный рендер per-card → браузится в Галерее (админ)
    adminOnly: true, // новый пак — по умолчанию только админ (как мемы/christian); снять, когда готов к публике
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
    id: "fact-ru",
    name: "Интересный факт",
    dir: "data/fact-videos-ru", // Russian title/text localization of the pre-built Interesting Facts corpus.
    source: "Localized from data/fact-videos/videos.json; see data/fact-videos-ru/sources.json",
    emoji: "🤯",
    hashtags: "#факты #интересныефакты #тызнал #удивительныефакты #shorts",
    tags: ["факты", "интересные факты", "ты знал", "удивительные факты", "наука", "shorts"],
    genericTitles: ["А ты знал?", "Интересный факт", "Удивительный факт", "В это сложно поверить"],
    adminOnly: true,
    preFact: true,
  },
  {
    id: "fact-es",
    name: "Datos curiosos",
    dir: "data/fact-videos-es", // Spanish title/text; generation rebuilds source footage with ES overlay + edge-tts
    source: "Localized from data/fact-videos/videos.json; see data/fact-videos-es/sources.json",
    emoji: "🤯",
    hashtags: "#datoscuriosos #sabiasque #curiosidades #hechosasombrosos #shorts",
    tags: ["datos curiosos", "sabias que", "curiosidades", "hechos asombrosos", "ciencia", "shorts"],
    genericTitles: ["¿Sabías que?", "Dato curioso", "Hecho asombroso", "No lo vas a creer"],
    adminOnly: true,
    preFact: true,
  },
  {
    id: "fact-de",
    name: "Interessante Fakten",
    dir: "data/fact-videos-de",
    source: "Localized from data/fact-videos/videos.json; see data/fact-videos-de/sources.json",
    emoji: "🤯",
    hashtags: "#fakten #wusstestdu #interessantefakten #wissenschaft #shorts",
    tags: ["fakten", "wusstest du", "interessante fakten", "wissenschaft", "shorts"],
    genericTitles: ["Wusstest du?", "Interessanter Fakt", "Erstaunlicher Fakt", "Kaum zu glauben"],
    adminOnly: true,
    preFact: true,
  },
  {
    id: "fact-it",
    name: "Fatti interessanti",
    dir: "data/fact-videos-it",
    source: "Localized from data/fact-videos/videos.json; see data/fact-videos-it/sources.json",
    emoji: "🤯",
    hashtags: "#fatticuriosi #losapevi #curiosita #scienza #shorts",
    tags: ["fatti curiosi", "lo sapevi", "curiosità", "scienza", "shorts"],
    genericTitles: ["Lo sapevi?", "Fatto curioso", "Fatto sorprendente", "Difficile da credere"],
    adminOnly: true,
    preFact: true,
  },
  {
    id: "fact-fr",
    name: "Faits interessants",
    dir: "data/fact-videos-fr",
    source: "Localized from data/fact-videos/videos.json; see data/fact-videos-fr/sources.json",
    emoji: "🤯",
    hashtags: "#faits #lesaviezvous #curiosites #science #shorts",
    tags: ["faits", "le saviez-vous", "curiosités", "science", "shorts"],
    genericTitles: ["Le saviez-vous ?", "Fait intéressant", "Fait étonnant", "Difficile à croire"],
    adminOnly: true,
    preFact: true,
  },
  {
    id: "fact-pt",
    name: "Fatos interessantes",
    dir: "data/fact-videos-pt",
    source: "Localized from data/fact-videos/videos.json; see data/fact-videos-pt/sources.json",
    emoji: "🤯",
    hashtags: "#fatoscuriosos #vocesabia #curiosidades #ciencia #shorts",
    tags: ["fatos curiosos", "você sabia", "curiosidades", "ciência", "shorts"],
    genericTitles: ["Você sabia?", "Fato curioso", "Fato surpreendente", "Difícil de acreditar"],
    adminOnly: true,
    preFact: true,
  },
  quoteDeck({
    id: "quotes-ru",
    name: "Цитаты великих людей",
    lang: "ru",
    hashtags: "#цитаты #мудрость #мотивация #история #shorts",
    tags: ["цитаты", "мудрость", "мотивация", "история", "великие люди", "shorts"],
    titles: ["Цитата", "Мудрые слова", "Великие слова", "Мысль дня"],
  }),
  quoteDeck({
    id: "quotes-ar",
    name: "اقتباسات ملهمة",
    lang: "ar",
    hashtags: "#اقتباسات #حكمة #تحفيز #تاريخ #shorts",
    tags: ["اقتباسات", "حكمة", "تحفيز", "تاريخ", "shorts"],
    titles: ["اقتباس", "كلمات خالدة", "حكمة اليوم"],
  }),
  quoteDeck({
    id: "islamic-quotes-ar",
    name: "اقتباسات إسلامية",
    lang: "ar",
    source: "Derived from the curated Quran/hadith/dua ledger in data/islamic/cards.json; see data/islamic-quotes-ar/sources.json",
    hashtags: "#اقتباسات_إسلامية #الإسلام #القرآن #حديث #دعاء #shorts",
    tags: ["اقتباسات إسلامية", "الإسلام", "القرآن", "حديث", "دعاء", "shorts"],
    titles: ["اقتباس إسلامي", "كلمات إيمانية", "حكمة إسلامية"],
  }),
  quoteDeck({
    id: "islamic-facts-ar",
    name: "معلومات عن الإسلام",
    lang: "ar",
    source: "Original educational Islamic fact cards; see data/islamic-facts-ar/sources.json",
    hashtags: "#الإسلام #معلومات_إسلامية #ثقافة_إسلامية #القرآن #shorts",
    tags: ["معلومات إسلامية", "الإسلام", "ثقافة إسلامية", "القرآن", "حديث", "shorts"],
    titles: ["معلومة إسلامية", "ثقافة إسلامية", "هل تعلم؟"],
  }),
  quoteDeck({
    id: "quotes-en",
    name: "Great Quotes",
    lang: "en",
    hashtags: "#quotes #wisdom #motivation #history #shorts",
    tags: ["quotes", "wisdom", "motivation", "history", "famous quotes", "shorts"],
    titles: ["Quote", "Words of Wisdom", "Great Quote", "Thought of the Day"],
  }),
  quoteDeck({
    id: "christian-quotes-en",
    name: "Christian Quotes",
    lang: "en",
    source: "Derived from public-domain KJV cards in data/christian/cards.json; see data/christian-quotes-en/sources.json",
    hashtags: "#christianquotes #bible #faith #wisdom #prayer #shorts",
    tags: ["christian quotes", "bible", "faith", "wisdom", "prayer", "shorts"],
    titles: ["Christian Quote", "Bible Wisdom", "Words of Faith", "Thought of the Day"],
  }),
  quoteDeck({
    id: "christian-facts-en",
    name: "Christian Facts",
    lang: "en",
    source: "Original educational Christian fact cards; see data/christian-facts-en/sources.json",
    hashtags: "#christianfacts #bible #faith #christianity #shorts",
    tags: ["christian facts", "bible facts", "christianity", "faith", "church history", "shorts"],
    titles: ["Christian Fact", "Bible Context", "Faith Fact"],
  }),
  quoteDeck({
    id: "quotes-it",
    name: "Citazioni famose",
    lang: "it",
    hashtags: "#citazioni #saggezza #motivazione #storia #shorts",
    tags: ["citazioni", "saggezza", "motivazione", "storia", "aforismi", "shorts"],
    titles: ["Citazione", "Parole di saggezza", "Pensiero del giorno"],
  }),
  quoteDeck({
    id: "quotes-es",
    name: "Citas famosas",
    lang: "es",
    hashtags: "#citas #sabiduria #motivacion #historia #shorts",
    tags: ["citas", "sabiduria", "motivacion", "historia", "frases celebres", "shorts"],
    titles: ["Cita", "Palabras de sabiduría", "Pensamiento del día"],
  }),
  quoteDeck({
    id: "quotes-fr",
    name: "Citations celebres",
    lang: "fr",
    hashtags: "#citations #sagesse #motivation #histoire #shorts",
    tags: ["citations", "sagesse", "motivation", "histoire", "phrases celebres", "shorts"],
    titles: ["Citation", "Mots de sagesse", "Pensée du jour"],
  }),
  quoteDeck({
    id: "quotes-pt",
    name: "Citações famosas",
    lang: "pt",
    hashtags: "#citacoes #sabedoria #motivacao #historia #shorts",
    tags: ["citacoes", "sabedoria", "motivacao", "historia", "frases famosas", "shorts"],
    titles: ["Citação", "Palavras de sabedoria", "Pensamento do dia"],
  }),
  quoteDeck({
    id: "quotes-hi",
    name: "प्रेरक उद्धरण",
    lang: "hi",
    hashtags: "#उद्धरण #ज्ञान #प्रेरणा #इतिहास #shorts",
    tags: ["उद्धरण", "ज्ञान", "प्रेरणा", "इतिहास", "shorts"],
    titles: ["उद्धरण", "ज्ञान के शब्द", "आज का विचार"],
  }),
  quoteDeck({
    id: "quotes-id",
    name: "Kutipan Terkenal",
    lang: "id",
    hashtags: "#kutipan #kebijaksanaan #motivasi #sejarah #shorts",
    tags: ["kutipan", "kebijaksanaan", "motivasi", "sejarah", "shorts"],
    titles: ["Kutipan", "Kata Bijak", "Pemikiran Hari Ini"],
  }),
  quoteDeck({
    id: "quotes-de",
    name: "Statische Zitate",
    lang: "de",
    dir: "data/quotes-de-combined",
    source: "Wikiquote source ledger shared with quote-video-de; rendered dynamically without baked-in plaques.",
    hashtags: "#zitate #politik #geschichte #deutschland #staatsmänner #shorts",
    tags: ["zitate", "politik", "geschichte", "deutschland", "staatsmänner", "zitat", "shorts"],
    titles: ["Zitat", "Berühmtes Zitat", "Politiker-Zitat", "Worte der Geschichte"],
  }),
  quoteVideoDeck({
    id: "quote-video-ru",
    name: "Видео-цитаты RU",
    dir: "data/quotes-ru",
    hashtags: "#цитаты #мудрость #мотивация #история #shorts",
    tags: ["цитаты", "мудрость", "мотивация", "история", "великие люди", "shorts"],
    titles: ["Видео-цитата", "Мудрые слова", "Мысль дня"],
  }),
  quoteVideoDeck({
    id: "quote-video-en",
    name: "Video Quotes EN",
    dir: "data/quotes-en",
    hashtags: "#quotes #wisdom #motivation #history #shorts",
    tags: ["quotes", "wisdom", "motivation", "history", "famous quotes", "shorts"],
    titles: ["Video Quote", "Words of Wisdom", "Thought of the Day"],
  }),
  quoteVideoDeck({
    id: "quote-video-es",
    name: "Video citas ES",
    dir: "data/quotes-es",
    hashtags: "#citas #sabiduria #motivacion #historia #shorts",
    tags: ["citas", "sabiduria", "motivacion", "historia", "frases celebres", "shorts"],
    titles: ["Video cita", "Palabras de sabiduria", "Pensamiento del dia"],
  }),
  quoteVideoDeck({
    id: "quote-video-it",
    name: "Video citazioni IT",
    dir: "data/quotes-it",
    hashtags: "#citazioni #saggezza #motivazione #storia #shorts",
    tags: ["citazioni", "saggezza", "motivazione", "storia", "frasi celebri", "shorts"],
    titles: ["Video citazione", "Parole di saggezza", "Pensiero del giorno"],
  }),
  quoteVideoDeck({
    id: "quote-video-fr",
    name: "Video citations FR",
    dir: "data/quotes-fr",
    hashtags: "#citations #sagesse #motivation #histoire #shorts",
    tags: ["citations", "sagesse", "motivation", "histoire", "citations celebres", "shorts"],
    titles: ["Video citation", "Mots de sagesse", "Pensee du jour"],
  }),
  quoteVideoDeck({
    id: "quote-video-pt",
    name: "Video citacoes PT",
    dir: "data/quotes-pt",
    hashtags: "#citacoes #sabedoria #motivacao #historia #shorts",
    tags: ["citacoes", "sabedoria", "motivacao", "historia", "frases famosas", "shorts"],
    titles: ["Video citacao", "Palavras de sabedoria", "Pensamento do dia"],
  }),
  quoteVideoDeck({
    id: "quote-video-hi",
    name: "वीडियो उद्धरण HI",
    dir: "data/quotes-hi",
    hashtags: "#उद्धरण #ज्ञान #प्रेरणा #इतिहास #shorts",
    tags: ["उद्धरण", "ज्ञान", "प्रेरणा", "इतिहास", "shorts"],
    titles: ["वीडियो उद्धरण", "ज्ञान के शब्द", "आज का विचार"],
  }),
  quoteVideoDeck({
    id: "quote-video-id",
    name: "Video kutipan ID",
    dir: "data/quotes-id",
    hashtags: "#kutipan #kebijaksanaan #motivasi #sejarah #shorts",
    tags: ["kutipan", "kebijaksanaan", "motivasi", "sejarah", "shorts"],
    titles: ["Video kutipan", "Kata bijak", "Pemikiran hari ini"],
  }),
  quoteVideoDeck({
    id: "quote-video-ar",
    name: "اقتباسات صوتية AR",
    dir: "data/quotes-ar",
    hashtags: "#اقتباسات #حكمة #تحفيز #تاريخ #shorts",
    tags: ["اقتباسات", "حكمة", "تحفيز", "تاريخ", "shorts"],
    titles: ["اقتباس صوتي", "كلمات حكيمة", "فكرة اليوم"],
  }),
  quoteVideoDeck({
    id: "quote-video-de",
    name: "Video-Zitate DE",
    dir: "data/quote-video-de",
    hashtags: "#zitate #weisheit #motivation #geschichte #shorts",
    tags: ["zitate", "weisheit", "motivation", "geschichte", "berühmte zitate", "shorts"],
    titles: ["Video-Zitat", "Worte der Weisheit", "Gedanke des Tages"],
  }),
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
    id: "prayers-de",
    name: "Gebete",
    dir: "data/prayers-de", // videos.json = [{file,title,text}]; static German prayer-card MP4s
    source: "",
    emoji: "🙏",
    hashtags: "#gebet #glaube #segen #schutz #frieden #amen #shorts",
    tags: ["gebet", "glaube", "segen", "schutz", "frieden", "hoffnung", "amen", "shorts"],
    genericTitles: ["Gebet", "Segen", "Amen", "Frieden", "Hoffnung"],
    // Pre-built prayer-card video pack; admin grants it to regular users from /users.
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "prayers-en",
    name: "Christian Prayers",
    dir: "data/prayers-en", // videos.json = [{file,title,text}]; static English prayer-card MP4s
    source: "",
    emoji: "🙏",
    hashtags: "#prayer #christian #faith #blessing #peace #amen #shorts",
    tags: ["prayer", "christian", "faith", "blessing", "peace", "hope", "amen", "shorts"],
    genericTitles: ["Prayer", "Christian Prayer", "Amen", "Blessing", "Peace"],
    adminOnly: true,
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
    adminOnly: true, // pre-built montage pack — admin grants it to regular users from /users
    grantable: true,
    preFact: true,
  },
  {
    id: "space-es",
    name: "Espacio",
    dir: "data/space-es", // Spanish title/text; generation rebuilds source footage with ES overlay + edge-tts
    source: "Localized from data/space/videos.json; see data/space-es/sources.json",
    emoji: "🚀",
    hashtags: "#espacio #nasa #astronomia #universo #cosmos #shorts",
    tags: ["espacio", "nasa", "astronomia", "universo", "cosmos", "ciencia", "shorts"],
    genericTitles: ["Espacio", "El universo", "Cosmos", "Espacio profundo"],
    adminOnly: true,
    grantable: true,
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
    adminOnly: true, // pre-built visual riddle pack — admin grants it to regular users from /users
    grantable: true,
    preFact: true,
  },
  {
    id: "long-anecdotes-ru",
    name: "Русские анекдоты",
    dir: "data/long-anecdotes-ru", // videos.json = one long MP4 assembled from many RU joke scenes
    source: "data/anecdotes/titled.json",
    emoji: "😂",
    hashtags: "#анекдоты #юмор #русскиеанекдоты #сборниканекдотов #длинноевидео",
    tags: ["анекдоты", "юмор", "русские анекдоты", "сборник анекдотов", "длинное видео", "смешное"],
    genericTitles: ["Русские анекдоты", "Большой сборник русских анекдотов", "Сборник анекдотов"],
    adminOnly: true,
    grantable: true,
    preFact: true,
    longVideo: true,
    sequential: true,
  },
  {
    id: "long-anecdotes-soul-ru",
    name: "Русские анекдоты",
    dir: "data/long-anecdotes-soul-ru", // videos.json = long MP4s assembled from the channel custom joke pack
    source: "data/packs/анекдоты-ру-впн-mqe5ovw1.json",
    emoji: "😂",
    hashtags: "#анекдоты #юмор #русскиеанекдоты #сборниканекдотов #длинноевидео",
    tags: ["анекдоты", "юмор", "русские анекдоты", "сборник анекдотов", "длинное видео", "смешное"],
    genericTitles: ["Русские анекдоты", "Большой выпуск анекдотов", "Смешные анекдоты для отдыха"],
    adminOnly: true,
    grantable: true,
    preFact: true,
    longVideo: true,
    sequential: true,
  },
  {
    id: "long-islamic-ar",
    name: "القرآن والحديث والدعاء",
    dir: "data/long-islamic-ar", // videos.json = long MP4s assembled from exact Islamic Arabic cards
    source: "data/islamic/cards.json",
    emoji: "🕌",
    hashtags: "#قرآن #حديث #دعاء #ذكر #اسلام #ديني",
    tags: ["قرآن", "حديث", "دعاء", "ذكر", "اسلام", "ديني", "quran", "hadith", "dua"],
    genericTitles: ["القرآن والحديث والدعاء", "آيات وأحاديث وأدعية", "ذكر ودعاء"],
    adminOnly: true,
    grantable: true,
    preFact: true,
    longVideo: true,
    sequential: true,
  },
  {
    id: "long-christian-en",
    name: "The Faithful Journey",
    dir: "data/long-christian-en", // videos.json = long MP4s assembled from exact KJV Bible passages
    source: "data/christian/cards.json",
    emoji: "✝️",
    hashtags: "#bible #kjv #scripture #faith #prayer #christian",
    tags: ["bible", "kjv", "scripture", "faith", "prayer", "christian", "bible verses", "quiet time"],
    genericTitles: ["The Faithful Journey", "Peaceful KJV Scripture", "Bible Verses for Quiet Time"],
    adminOnly: true,
    grantable: true,
    preFact: true,
    longVideo: true,
    sequential: true,
  },
  {
    id: "visual-riddles-de",
    name: "Sieh die Antwort",
    dir: "data/visual-riddles-de", // videos.json = [{file,title,text}]; German localization of visual-riddles
    source: "",
    emoji: "🧩",
    hashtags: "#rätsel #denksport #optischetäuschung #suchbild #shorts",
    tags: ["rätsel", "denksport", "optische täuschung", "suchbild", "logik", "aufmerksamkeit", "shorts"],
    genericTitles: ["Sieh die Antwort", "Visuelles Rätsel", "Aufmerksamkeitstest", "Suchbild"],
    adminOnly: true, // pre-built visual riddle pack (DE) — admin grants it to regular users from /users
    grantable: true,
    preFact: true,
  },
  {
    id: "visual-riddles-en",
    name: "Visual Riddles",
    dir: "data/visual-riddles-en", // videos.json = [{file,title,text}]; English localization of visual-riddles
    source: "",
    emoji: "🧩",
    hashtags: "#riddles #visualriddle #brainteaser #opticalillusion #shorts",
    tags: ["riddles", "visual riddle", "brain teaser", "optical illusion", "logic", "attention", "shorts"],
    genericTitles: ["Visual Riddles", "Brain Teaser", "Attention Test", "Can You Solve It?"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "visual-riddles-it",
    name: "Indovinelli visivi",
    dir: "data/visual-riddles-it", // generated-original visual puzzle MP4s for Italian joke/meme channels
    source: "Project-generated HTML/CSS visual puzzles; see data/visual-riddles-it/sources.json",
    emoji: "🧩",
    hashtags: "#indovinelli #illusioniottiche #logica #shorts",
    tags: ["indovinelli", "illusioni ottiche", "logica", "attenzione", "shorts"],
    genericTitles: ["Indovinelli visivi", "Test visivo", "Trova la risposta"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "visual-riddles-es",
    name: "Acertijos visuales",
    dir: "data/visual-riddles-es", // generated-original visual puzzle MP4s for Spanish joke/meme channels
    source: "Project-generated HTML/CSS visual puzzles; see data/visual-riddles-es/sources.json",
    emoji: "🧩",
    hashtags: "#acertijos #ilusionesopticas #logica #shorts",
    tags: ["acertijos", "ilusiones opticas", "logica", "atencion", "shorts"],
    genericTitles: ["Acertijos visuales", "Reto visual", "Encuentra la respuesta"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "visual-riddles-fr",
    name: "Énigmes visuelles",
    dir: "data/visual-riddles-fr", // generated-original visual puzzle MP4s for French joke/meme channels
    source: "Project-generated HTML/CSS visual puzzles; see data/visual-riddles-fr/sources.json",
    emoji: "🧩",
    hashtags: "#enigmes #illusionsoptiques #logique #shorts",
    tags: ["enigmes", "illusions optiques", "logique", "attention", "shorts"],
    genericTitles: ["Énigmes visuelles", "Défi visuel", "Trouve la réponse"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "visual-riddles-pt",
    name: "Enigmas visuais",
    dir: "data/visual-riddles-pt", // generated-original visual puzzle MP4s for Portuguese joke/meme channels
    source: "Project-generated HTML/CSS visual puzzles; see data/visual-riddles-pt/sources.json",
    emoji: "🧩",
    hashtags: "#enigmas #ilusoesopticas #logica #shorts",
    tags: ["enigmas", "ilusoes opticas", "logica", "atencao", "shorts"],
    genericTitles: ["Enigmas visuais", "Desafio visual", "Encontre a resposta"],
    adminOnly: true,
    grantable: true,
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
    adminOnly: true, // pre-built serial animal comic pack — admin grants it to regular users from /users
    grantable: true,
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
    adminOnly: true, // pre-built serial animal comic pack — admin grants it to regular users from /users
    grantable: true,
    preFact: true,
    sequential: true,
  },
  {
    id: "illusions-3d",
    name: "Обмани свой мозг",
    dir: "data/illusions-3d", // videos.json = [{file,title,text}]; rotating ambiguous 3D particle figures
    source: "",
    emoji: "🧊",
    hashtags: "#иллюзия #оптическаяиллюзия #мозг #гипноз #вращение #shorts",
    tags: ["иллюзия", "оптическая иллюзия", "мозг", "вращение", "гипноз", "силой мысли", "shorts"],
    genericTitles: ["Обмани свой мозг", "Иллюзия вращения", "Поверни силой мысли", "Куда она крутится?"],
    adminOnly: true, // pre-built rotating-illusion pack — admin grants it to regular users from /users
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-3d-de",
    name: "Überliste dein Gehirn",
    dir: "data/illusions-3d-de", // videos.json = [{file,title,text}]; German localization of illusions-3d
    source: "",
    emoji: "🧊",
    hashtags: "#illusion #optischetäuschung #gehirn #hypnose #shorts",
    tags: ["illusion", "optische täuschung", "gehirn", "rotation", "gedankenkraft", "shorts"],
    genericTitles: ["Überliste dein Gehirn", "Drehillusion", "Mit Gedankenkraft drehen", "Wohin dreht es sich?"],
    adminOnly: true, // pre-built rotating-illusion pack (DE) — admin grants it to regular users from /users
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-3d-en",
    name: "Mind-Flip 3D Illusions",
    dir: "data/illusions-3d-en", // videos.json = [{file,title,text}]; English localization of illusions-3d
    source: "",
    emoji: "🧊",
    hashtags: "#opticalillusion #illusion #brain #rotation #mindtrick #shorts",
    tags: ["optical illusion", "illusion", "brain", "rotation", "mind trick", "perception", "shorts"],
    genericTitles: ["Mind-Flip 3D Illusions", "Rotation Illusion", "Flip It With Your Mind", "Which Way Is It Turning?"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-en",
    name: "Optical Illusions",
    dir: "data/illusions-en", // videos.json = [{file,title,text}]; multi-class animated optical illusions (EN)
    source: "",
    emoji: "🌀",
    hashtags: "#opticalillusion #illusion #brain #satisfying #mindtricks #shorts",
    tags: ["optical illusion", "illusion", "brain", "satisfying", "mind tricks", "perception", "shorts"],
    genericTitles: ["Optical Illusions", "Trick Your Eyes", "Can You Trust Your Brain?", "Mind-Bending Illusion"],
    adminOnly: true, // pre-built optical-illusions pack (EN) — admin grants it to regular users from /users
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-de",
    name: "Optische Täuschungen",
    dir: "data/illusions-de", // localized optical-illusions pack (DE) — same geometry as illusions-en, German hooks
    source: "",
    emoji: "🌀",
    hashtags: "#optischetäuschung #illusion #gehirn #wahrnehmung #shorts",
    tags: ["optische täuschung", "illusion", "gehirn", "wahrnehmung", "augentrick", "shorts"],
    genericTitles: ["Optische Täuschungen", "Trick für deine Augen", "Kannst du deinem Gehirn trauen?", "Verblüffende Illusion"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-it",
    name: "Illusioni ottiche",
    dir: "data/illusions-it", // localized optical-illusions pack (IT)
    source: "",
    emoji: "🌀",
    hashtags: "#illusioneottica #illusione #cervello #percezione #shorts",
    tags: ["illusione ottica", "illusione", "cervello", "percezione", "inganno visivo", "shorts"],
    genericTitles: ["Illusioni ottiche", "Inganna i tuoi occhi", "Ti puoi fidare del cervello?", "Illusione sorprendente"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-es",
    name: "Ilusiones ópticas",
    dir: "data/illusions-es", // localized optical-illusions pack (ES)
    source: "",
    emoji: "🌀",
    hashtags: "#ilusiónóptica #ilusion #cerebro #percepción #shorts",
    tags: ["ilusión óptica", "ilusión", "cerebro", "percepción", "engaño visual", "shorts"],
    genericTitles: ["Ilusiones ópticas", "Engaña a tus ojos", "¿Puedes confiar en tu cerebro?", "Ilusión asombrosa"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-ru",
    name: "Оптические иллюзии",
    dir: "data/illusions-ru", // localized optical-illusions pack (RU)
    source: "",
    emoji: "🌀",
    hashtags: "#оптическаяиллюзия #иллюзия #мозг #восприятие #shorts",
    tags: ["оптическая иллюзия", "иллюзия", "мозг", "восприятие", "обман зрения", "shorts"],
    genericTitles: ["Оптические иллюзии", "Обмани свои глаза", "Можно ли верить мозгу?", "Поразительная иллюзия"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-fr",
    name: "Illusions optiques",
    dir: "data/illusions-fr", // localized optical-illusions pack (FR)
    source: "",
    emoji: "🌀",
    hashtags: "#illusionoptique #illusion #cerveau #perception #shorts",
    tags: ["illusion optique", "illusion", "cerveau", "perception", "trompe-l'oeil", "shorts"],
    genericTitles: ["Illusions optiques", "Trompe tes yeux", "Peux-tu faire confiance à ton cerveau ?", "Illusion surprenante"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-pt",
    name: "Ilusões ópticas",
    dir: "data/illusions-pt", // localized optical-illusions pack (PT)
    source: "",
    emoji: "🌀",
    hashtags: "#ilusãoóptica #ilusao #cerebro #percepcao #shorts",
    tags: ["ilusão óptica", "ilusão", "cérebro", "percepção", "truque visual", "shorts"],
    genericTitles: ["Ilusões ópticas", "Engane seus olhos", "Você confia no seu cérebro?", "Ilusão surpreendente"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-hi",
    name: "दृष्टि भ्रम",
    dir: "data/illusions-hi", // localized optical-illusions pack (HI)
    source: "",
    emoji: "🌀",
    hashtags: "#opticalillusion #illusion #brain #perception #shorts",
    tags: ["दृष्टि भ्रम", "भ्रम", "दिमाग", "विजुअल ट्रिक", "shorts"],
    genericTitles: ["दृष्टि भ्रम", "अपनी आँखों को चुनौती दें", "क्या आप अपने दिमाग पर भरोसा कर सकते हैं?", "अद्भुत भ्रम"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-id",
    name: "Ilusi Optik",
    dir: "data/illusions-id", // localized optical-illusions pack (ID)
    source: "",
    emoji: "🌀",
    hashtags: "#ilusioptik #ilusi #otak #persepsi #shorts",
    tags: ["ilusi optik", "ilusi", "otak", "persepsi", "trik mata", "shorts"],
    genericTitles: ["Ilusi Optik", "Tipu Matamu", "Bisakah Kamu Percaya Otakmu?", "Ilusi Mengejutkan"],
    adminOnly: true,
    grantable: true,
    preFact: true,
  },
  {
    id: "illusions-ar",
    name: "خدع بصرية",
    dir: "data/illusions-ar", // localized optical-illusions pack (AR)
    source: "",
    emoji: "🌀",
    hashtags: "#خدعبصرية #وهم #دماغ #إدراك #shorts",
    tags: ["خدع بصرية", "وهم بصري", "دماغ", "إدراك", "shorts"],
    genericTitles: ["خدع بصرية", "اخدع عينيك", "هل تثق بدماغك؟", "وهم مذهل"],
    adminOnly: true,
    grantable: true,
    preFact: true,
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
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en", pt: "pt", ar: "ar", hi: "hi", id: "id", choose: "ru", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "fact-ru": "ru", "fact-es": "es", "fact-de": "de", "fact-it": "it", "fact-fr": "fr", "fact-pt": "pt", "quotes-ru": "ru", "quotes-ar": "ar", "islamic-quotes-ar": "ar", "islamic-facts-ar": "ar", "quotes-en": "en", "christian-quotes-en": "en", "christian-facts-en": "en", "quotes-it": "it", "quotes-es": "es", "quotes-fr": "fr", "quotes-pt": "pt", "quotes-hi": "hi", "quotes-id": "id", "quotes-de": "de", "quote-video-ru": "ru", "quote-video-en": "en", "quote-video-es": "es", "quote-video-it": "it", "quote-video-fr": "fr", "quote-video-pt": "pt", "quote-video-hi": "hi", "quote-video-id": "id", "quote-video-ar": "ar", "quote-video-de": "de", "quotes-de-1": "de", "quotes-de-2": "de", "quotes-de-3": "de", "prayers-de": "de", "prayers-en": "en", space: "en", "space-es": "es", "visual-riddles": "ru", "long-anecdotes-ru": "ru", "long-anecdotes-soul-ru": "ru", "long-islamic-ar": "ar", "long-christian-en": "en", "visual-riddles-de": "de", "visual-riddles-en": "en", "visual-riddles-it": "it", "visual-riddles-es": "es", "visual-riddles-fr": "fr", "visual-riddles-pt": "pt", "animal-superheroes": "ru", "animal-superheroes-en": "en", "illusions-3d": "ru", "illusions-3d-de": "de", "illusions-3d-en": "en", "illusions-en": "en", "illusions-de": "de", "illusions-it": "it", "illusions-es": "es", "illusions-ru": "ru", "illusions-fr": "fr", "illusions-pt": "pt", "illusions-hi": "hi", "illusions-id": "id", "illusions-ar": "ar",
  "memes-ru": "ru", "memes-en": "en", "memes-de": "de", "memes-fr": "fr", "memes-it": "it", "memes-pt": "pt", "memes-es": "es", "memes-hi": "hi", "memes-id": "id", "memes-ar": "ar",
};
export function deckLang(id: string): string {
  return DECK_LANG[id] || "";
}
// Localized YouTube metadata for the super-admin «Новые мемы» packs (pack:new-memes-<lang>-superadmin).
// These packs carry the real meme caption in each card (role `title` = caption); the meme deck flavor
// makes ytMeta derive the title from the caption's first line and append proper meme hashtags — instead
// of the old generic "Свой пак ✨ #shorts". Reuses the same hashtags/tags as the built-in memes-* decks.
const NEW_MEMES_META: Record<string, { name: string; hashtags: string; tags: string[] }> = {
  ru: { name: "Новые мемы", hashtags: "#мемы #юмор #приколы #relatable #shorts", tags: ["мемы", "мем", "юмор", "приколы", "смешное", "relatable", "shorts"] },
  en: { name: "New Memes", hashtags: "#memes #funny #relatable #meme #shorts", tags: ["memes", "meme", "funny", "relatable", "humor", "lol", "shorts"] },
  de: { name: "Neue Memes", hashtags: "#memes #humor #lustig #relatable #shorts", tags: ["memes", "meme", "humor", "lustig", "relatable", "shorts"] },
  it: { name: "Nuovi meme", hashtags: "#meme #umorismo #divertente #relatable #shorts", tags: ["meme", "umorismo", "divertente", "relatable", "ironia", "shorts"] },
  es: { name: "Memes nuevos", hashtags: "#memes #humor #gracioso #relatable #shorts", tags: ["memes", "meme", "humor", "gracioso", "relatable", "shorts"] },
  pt: { name: "Memes novos", hashtags: "#memes #humor #engraçado #relatable #shorts", tags: ["memes", "meme", "humor", "engraçado", "relatable", "shorts"] },
  fr: { name: "Nouveaux mèmes", hashtags: "#mèmes #humour #drôle #relatable #shorts", tags: ["mèmes", "mème", "humour", "drôle", "relatable", "shorts"] },
  ar: { name: "ميمز جديدة", hashtags: "#ميمز #ضحك #كوميديا #relatable #shorts", tags: ["ميمز", "ضحك", "كوميديا", "relatable", "shorts"] },
};
function synthPackDeck(id: string): Deck {
  const meme = /^pack:new-memes-([a-z]{2})-superadmin$/.exec(id);
  if (meme) {
    const m = NEW_MEMES_META[meme[1]] ?? NEW_MEMES_META.en;
    return {
      id,
      name: m.name,
      dir: "",
      source: "",
      emoji: "😂",
      hashtags: m.hashtags,
      tags: m.tags,
      genericTitles: ["Мем"],
      meme: true, // ytMeta meme branch: title = caption first line, description = full caption + hashtags
    };
  }
  // Spanish classic-joke packs (pack:chistes-*): each card carries a real per-joke title + the joke body,
  // so the generic ytMeta branch already produces «title 😂 #shorts» + the joke; just give it joke branding.
  if (/^pack:chistes-/.test(id)) {
    return {
      id,
      name: "Chistes",
      dir: "",
      source: "",
      emoji: "😂",
      hashtags: "#chistes #humor #risa #gracioso #shorts",
      tags: ["chistes", "chiste", "humor", "risa", "gracioso", "comedia", "shorts"],
      genericTitles: ["Chiste", "Para reír", "Un clásico"],
    };
  }
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

function synthManualDeck(): Deck {
  return {
    id: MANUAL_VIDEO_DECK,
    name: "Свои нарезки",
    dir: "",
    source: "",
    emoji: "🎬",
    hashtags: "#shorts",
    tags: ["shorts"],
    genericTitles: ["Свой ролик"],
  };
}

export function getDeck(id?: string | null): Deck {
  if (id === MANUAL_VIDEO_DECK) return synthManualDeck();
  if (isPackDeckId(id)) return synthPackDeck(id as string);
  return DECKS.find((d) => d.id === id) ?? DECKS.find((d) => d.id === DEFAULT_DECK)!;
}

export function pickGenericTitle(deck: Deck): string {
  return deck.genericTitles[Math.floor(Math.random() * deck.genericTitles.length)];
}

export function isPlainAnecdoteDeck(deck: Deck): boolean {
  return (
    deck.emoji === "😂" &&
    !deck.psych &&
    !deck.islamic &&
    !deck.christian &&
    !deck.meme &&
    !deck.memeBoard &&
    !deck.choose &&
    !deck.preFact &&
    !deck.quote &&
    !deck.quoteVideo &&
    !deck.longVideo
  );
}

// ytMeta() + psychDescription() (YouTube-метаданные / распаковка карточек-JSON) вынесены в ./yt-meta.ts,
// чтобы этот файл остался чистым реестром дек. Импортируй их оттуда (а не отсюда), иначе будет цикл.

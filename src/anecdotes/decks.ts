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
  /** When true, this deck is visible & usable ONLY by admins — hidden from every non-admin regardless of per-user deck settings. */
  adminOnly?: boolean;
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
    id: "quotes-de",
    name: "Politiker-Zitate (DE)",
    dir: "data/quotes-de", // videos.json = [{file,title,text,author}]; pre-built mp4s shared in assets/fact-videos/
    source: "",
    emoji: "🇩🇪",
    hashtags: "#zitate #politik #geschichte #deutschland #staatsmänner #shorts",
    tags: ["zitate", "politik", "geschichte", "deutschland", "staatsmänner", "zitat", "shorts"],
    genericTitles: ["Zitat", "Berühmtes Zitat", "Politiker-Zitat", "Worte der Geschichte"],
    adminOnly: true, // pre-built video pack — admin-only
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
    id: "funny-animals",
    name: "Funny Animals",
    dir: "data/funny-animals", // videos.json = [{file,title,text}] synced from /clip-demos funny-reactions
    source: "",
    emoji: "😂",
    hashtags: "#funnyanimals #pets #dogs #cats #funny #shorts",
    tags: ["funny animals", "pets", "dogs", "cats", "funny pets", "animals", "shorts"],
    genericTitles: ["Funny Animals", "Funny Pet", "Animal Moment", "Pet Chaos"],
    adminOnly: true, // pre-built animal montage pack — admin-only
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
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en",
  tips: "ru", "tips-de": "de", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "quotes-de": "de", space: "en", "funny-animals": "en",
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

/** Build YouTube title/description/tags for a deck. */
export function ytMeta(
  deck: Deck,
  title: string,
  text: string,
): { title: string; description: string; tags: string[] } {
  // Islamic cards: title = the Arabic reference, body = the exact Arabic text (+ reference).
  if (deck.islamic) {
    let ar = text,
      ref = title,
      refEn = "";
    try {
      const c = JSON.parse(text) as { arabic?: string; ref?: string; ref_en?: string };
      ar = c.arabic ?? text;
      ref = c.ref ?? title;
      refEn = c.ref_en ? `\n${c.ref_en}` : "";
    } catch {
      /* not JSON — use raw text */
    }
    return {
      title: `${ref} ${deck.emoji} #shorts`,
      description: `${ar}\n\n${ref}${refEn}\n\n${deck.hashtags}`,
      tags: deck.tags,
    };
  }
  // Christian cards: title = the reference, body = the exact KJV passage (+ reference).
  if (deck.christian) {
    let body = text,
      ref = title;
    try {
      const c = JSON.parse(text) as { text?: string; ref?: string };
      body = c.text ?? text;
      ref = c.ref ?? title;
    } catch {
      /* not JSON — use raw text */
    }
    return {
      title: `${ref} ${deck.emoji} #shorts`,
      description: `${body}\n\n${ref} (KJV)\n\n${deck.hashtags}`,
      tags: deck.tags,
    };
  }
  // Psychology cards store the whole card as JSON in `text` — render a readable description instead.
  const body = deck.psych ? psychDescription(text) : text;
  return {
    title: `${title} ${deck.emoji} #shorts`,
    description: `${body}\n\n${deck.hashtags}`,
    tags: deck.tags,
  };
}

/** Turn a psychology card (JSON in `text`) into a readable YouTube description (points + CTA). */
function psychDescription(jsonText: string): string {
  try {
    const card = JSON.parse(jsonText) as { items?: Record<string, string>[]; outro?: string };
    const lines: string[] = [];
    for (const it of card.items ?? []) {
      if (it.lead && it.text) lines.push(`• ${it.lead} — ${it.text}`);
      else if (it.term && it.val) lines.push(`• ${it.term} — ${it.val}`);
      else if (it.myth && it.real) lines.push(`• ${it.myth} → ${it.real}`);
      else if (it.quote) lines.push(`„${it.quote}“${it.author ? " — " + it.author : ""}`);
      else if (it.text) lines.push(`• ${it.text}`);
    }
    let desc = lines.join("\n");
    if (card.outro) desc += `\n\n${card.outro}`;
    return desc || jsonText;
  } catch {
    return jsonText;
  }
}

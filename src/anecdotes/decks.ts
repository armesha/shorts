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
  /** Lifehack background style suffix, e.g. "chaplin" → profession_<key>_chaplin.jpg (with moustache).
   *  Omitted → the plain profession_<key>.jpg (no moustache). */
  lifehackVariant?: string;
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
];

export const DEFAULT_DECK = "ru";

export function getDeck(id?: string | null): Deck {
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

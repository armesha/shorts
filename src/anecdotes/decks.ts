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
  return {
    title: `${title} ${deck.emoji} #shorts`,
    description: `${text}\n\n${deck.hashtags}`,
    tags: deck.tags,
  };
}

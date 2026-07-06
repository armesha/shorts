import { deckLang, isPlainAnecdoteDeck, type Deck } from "./decks.ts";

type TagKind = "joke" | "meme";
type Topic = "family" | "work" | "tech" | "animals" | "food" | "money" | "travel";

type LocaleTags = {
  jokeBase: string[];
  memeBase: string[];
  jokePool: string[];
  memePool: string[];
  topics: Record<Topic, string[]>;
};

const MAX_TAGS = 12;
const MAX_TAG_CHARS = 480;

const LOCALES: Record<string, LocaleTags> = {
  ru: {
    jokeBase: ["анекдоты", "юмор", "смешные анекдоты", "русские анекдоты", "shorts"],
    memeBase: ["мемы", "мем", "юмор", "приколы", "shorts"],
    jokePool: ["анекдот дня", "смешные истории", "ржака", "смех", "юмор на каждый день", "жизненный юмор", "короткие шутки", "посмеяться"],
    memePool: ["смешные мемы", "жиза", "relatable", "мемы про жизнь", "приколы из жизни", "смешное видео", "юмор каждый день", "угар"],
    topics: {
      family: ["семейный юмор", "отношения"],
      work: ["офисный юмор", "работа"],
      tech: ["технологии", "интернет юмор"],
      animals: ["животные", "котики"],
      food: ["бытовой юмор", "еда"],
      money: ["деньги", "покупки"],
      travel: ["дорога", "путешествия"],
    },
  },
  en: {
    jokeBase: ["jokes", "humor", "funny jokes", "short jokes", "shorts"],
    memeBase: ["memes", "meme", "funny", "relatable", "shorts"],
    jokePool: ["joke of the day", "funny stories", "comedy", "laugh", "daily humor", "clean humor", "quick jokes", "funny shorts"],
    memePool: ["funny memes", "relatable memes", "daily memes", "internet humor", "lol", "viral humor", "meme shorts", "funny moments"],
    topics: {
      family: ["family humor", "relationships"],
      work: ["work humor", "office jokes"],
      tech: ["tech humor", "internet jokes"],
      animals: ["animal humor", "pets"],
      food: ["food humor", "kitchen jokes"],
      money: ["money jokes", "shopping"],
      travel: ["travel humor", "road trip"],
    },
  },
  de: {
    jokeBase: ["Witze", "Humor", "lustig", "kurze Witze", "shorts"],
    memeBase: ["Memes", "Meme", "Humor", "lustig", "shorts"],
    jokePool: ["Witz des Tages", "deutsche Witze", "zum Lachen", "Alltagshumor", "Comedy", "Spaß", "kurzer Humor", "lustige Shorts"],
    memePool: ["lustige Memes", "Alltagsmemes", "relatable", "Internet Humor", "Meme Shorts", "witzige Memes", "Lachflash", "Humor Shorts"],
    topics: {
      family: ["Familienhumor", "Beziehungen"],
      work: ["Bürohumor", "Arbeit"],
      tech: ["Technik Humor", "Internet Witze"],
      animals: ["Tierhumor", "Haustiere"],
      food: ["Essen Humor", "Küche"],
      money: ["Geld", "Einkaufen"],
      travel: ["Reisen", "Unterwegs"],
    },
  },
  it: {
    jokeBase: ["barzellette", "umorismo", "divertente", "barzelletta", "shorts"],
    memeBase: ["meme", "umorismo", "divertente", "relatable", "shorts"],
    jokePool: ["barzelletta del giorno", "storie divertenti", "ridere", "comicità", "umorismo quotidiano", "battute brevi", "short divertenti", "risate"],
    memePool: ["meme divertenti", "meme quotidiani", "ironia", "internet humor", "meme shorts", "vita quotidiana", "risate", "momenti divertenti"],
    topics: {
      family: ["umorismo familiare", "relazioni"],
      work: ["umorismo da ufficio", "lavoro"],
      tech: ["tecnologia", "internet"],
      animals: ["animali", "animali domestici"],
      food: ["cibo", "cucina"],
      money: ["soldi", "shopping"],
      travel: ["viaggi", "in viaggio"],
    },
  },
  fr: {
    jokeBase: ["blagues", "humour", "drôle", "blague courte", "shorts"],
    memeBase: ["mèmes", "mème", "humour", "drôle", "shorts"],
    jokePool: ["blague du jour", "histoires drôles", "rire", "humour quotidien", "comédie", "blagues courtes", "shorts humour", "moment drôle"],
    memePool: ["mèmes drôles", "mèmes du quotidien", "relatable", "humour internet", "meme shorts", "vie quotidienne", "rire", "moments drôles"],
    topics: {
      family: ["humour familial", "relations"],
      work: ["humour bureau", "travail"],
      tech: ["humour tech", "internet"],
      animals: ["animaux", "animaux de compagnie"],
      food: ["nourriture", "cuisine"],
      money: ["argent", "shopping"],
      travel: ["voyage", "sur la route"],
    },
  },
  es: {
    jokeBase: ["chistes", "humor", "risa", "chiste corto", "shorts"],
    memeBase: ["memes", "meme", "humor", "gracioso", "shorts"],
    jokePool: ["chiste del día", "historias graciosas", "comedia", "para reír", "humor diario", "chistes cortos", "shorts graciosos", "risas"],
    memePool: ["memes graciosos", "memes diarios", "relatable", "humor de internet", "meme shorts", "vida cotidiana", "risas", "momentos graciosos"],
    topics: {
      family: ["humor familiar", "relaciones"],
      work: ["humor de oficina", "trabajo"],
      tech: ["humor tecnológico", "internet"],
      animals: ["animales", "mascotas"],
      food: ["comida", "cocina"],
      money: ["dinero", "compras"],
      travel: ["viajes", "carretera"],
    },
  },
  pl: {
    jokeBase: ["dowcipy", "dowcip", "humor", "żarty", "shorts"],
    memeBase: ["memy", "mem", "humor", "śmieszne", "shorts"],
    jokePool: ["dowcip dnia", "krótkie dowcipy", "śmiech", "komedia", "codzienny humor", "żarty krótkie", "śmieszne shorts", "do śmiechu"],
    memePool: ["śmieszne memy", "memy codzienne", "relatable", "internetowy humor", "meme shorts", "życie codzienne", "bekowe", "śmiech"],
    topics: {
      family: ["humor rodzinny", "relacje"],
      work: ["humor biurowy", "praca"],
      tech: ["technologia", "internet"],
      animals: ["zwierzęta", "pupile"],
      food: ["jedzenie", "kuchnia"],
      money: ["pieniądze", "zakupy"],
      travel: ["podróże", "droga"],
    },
  },
  pt: {
    jokeBase: ["piadas", "humor", "engraçado", "piada curta", "shorts"],
    memeBase: ["memes", "meme", "humor", "engraçado", "shorts"],
    jokePool: ["piada do dia", "histórias engraçadas", "comédia", "rir", "humor diário", "piadas curtas", "shorts engraçados", "risadas"],
    memePool: ["memes engraçados", "memes do dia", "relatable", "humor da internet", "meme shorts", "vida cotidiana", "risadas", "momentos engraçados"],
    topics: {
      family: ["humor de família", "relacionamentos"],
      work: ["humor de escritório", "trabalho"],
      tech: ["humor tech", "internet"],
      animals: ["animais", "pets"],
      food: ["comida", "cozinha"],
      money: ["dinheiro", "compras"],
      travel: ["viagem", "estrada"],
    },
  },
  ar: {
    jokeBase: ["نوادر", "طرائف", "ضحك", "كوميديا", "shorts"],
    memeBase: ["ميمز", "ضحك", "كوميديا", "مضحك", "shorts"],
    jokePool: ["نكت قصيرة", "ضحك يومي", "قصص مضحكة", "فكاهة", "مقاطع مضحكة", "طرائف يومية", "ضحك من القلب", "كوميديا قصيرة"],
    memePool: ["ميمز مضحكة", "ميمز يومية", "relatable", "ضحك", "ميمز قصيرة", "فكاهة الإنترنت", "مواقف مضحكة", "كوميديا"],
    topics: {
      family: ["فكاهة عائلية", "علاقات"],
      work: ["فكاهة العمل", "مكتب"],
      tech: ["تقنية", "إنترنت"],
      animals: ["حيوانات", "حيوانات أليفة"],
      food: ["طعام", "مطبخ"],
      money: ["مال", "تسوق"],
      travel: ["سفر", "طريق"],
    },
  },
  ja: {
    jokeBase: ["笑い話", "ジョーク", "お笑い", "面白い", "shorts"],
    memeBase: ["ミーム", "あるある", "おもしろい", "笑える", "shorts"],
    jokePool: ["今日のジョーク", "短いジョーク", "笑える話", "日常ユーモア", "コメディ", "小話", "面白ショート", "笑い"],
    memePool: ["面白いミーム", "日常ミーム", "relatable", "ネットミーム", "ミームショート", "あるあるネタ", "笑える動画", "おもしろ動画"],
    topics: {
      family: ["家族ネタ", "人間関係"],
      work: ["仕事ネタ", "オフィス"],
      tech: ["テックネタ", "ネット"],
      animals: ["動物", "ペット"],
      food: ["食べ物", "料理"],
      money: ["お金", "買い物"],
      travel: ["旅行", "移動"],
    },
  },
};

const TOPIC_PATTERNS: Record<Topic, RegExp> = {
  family:
    /(муж|жена|мама|папа|сын|дочь|дет|семь|wife|husband|mom|mother|father|dad|child|family|frau|mann|mutter|vater|kind|famil|mari|femme|enfant|moglie|marito|figli|espos|niñ|familia|żona|mąż|dziec|rodzin|妻|夫|子供|家族|زوج|زوجة|أم|أب|طفل)/iu,
  work:
    /(работ|офис|начальник|коллег|work|office|boss|job|arbeit|büro|chef|travail|bureau|patron|lavor|ufficio|capo|trabajo|oficina|jefe|praca|biuro|szef|仕事|会社|上司|عمل|مكتب|مدير)/iu,
  tech:
    /(компьютер|телефон|ноутбук|парол|интернет|сайт|computer|phone|laptop|password|internet|wifi|handy|ordinateur|téléphone|mot de passe|telefono|portatile|contraseña|komputer|telefon|hasło|パソコン|スマホ|ネット|حاسوب|هاتف|إنترنت)/iu,
  animals:
    /(кот|кошка|собак|пес|ворон|животн|cat|dog|pet|animal|katze|hund|tier|chat|chien|animal|gatto|cane|animale|gato|perro|zwierz|kot|pies|猫|犬|動物|قطة|كلب|حيوان)/iu,
  food:
    /(еда|суп|кухн|обед|ужин|рецепт|плита|food|soup|kitchen|lunch|dinner|recipe|küche|essen|cuisine|repas|ricetta|cocina|comida|jedzenie|kuchnia|食べ物|料理|طعام|مطبخ)/iu,
  money:
    /(деньг|доллар|рубл|магазин|купил|money|dollar|shop|buy|geld|kaufen|einkauf|argent|acheter|soldi|comprare|dinero|comprar|pieniądze|sklep|お金|買|مال|تسوق)/iu,
  travel:
    /(машин|такси|поезд|самолет|дорог|тур|car|taxi|train|plane|travel|road|auto|zug|reise|voiture|taxi|train|viaggio|coche|tren|podróż|samochód|車|旅行|قطار|سيارة|سفر)/iu,
};

function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pickTags(pool: string[], seed: string, count: number): string[] {
  return [...pool]
    .map((tag) => ({ tag, score: stableHash(`${seed}|${tag}`) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, count)
    .map((item) => item.tag);
}

function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const tag = String(raw || "").replace(/^#+/, "").replace(/\s+/g, " ").trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function limitTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const tag of normalizeTags(tags)) {
    const next = [...out, tag];
    if (next.length > MAX_TAGS || next.join(",").length > MAX_TAG_CHARS) break;
    out.push(tag);
  }
  return out;
}

function packLang(deckId: string): string {
  const match = /^pack:(?:new-memes|chistes|dowcipy)-([a-z]{2})(?:-|$)/.exec(deckId);
  return match?.[1] || "";
}

function tagKind(deck: Deck): TagKind | null {
  if (deck.meme || /^pack:new-memes-[a-z]{2}-superadmin$/.test(deck.id) || /^memes-/.test(deck.id)) return "meme";
  if (isPlainAnecdoteDeck(deck) || /^pack:(?:chistes|dowcipy)-/.test(deck.id)) return "joke";
  return null;
}

function detectedTopicTags(locale: LocaleTags, text: string): string[] {
  const tags: string[] = [];
  for (const [topic, pattern] of Object.entries(TOPIC_PATTERNS) as [Topic, RegExp][]) {
    if (pattern.test(text)) tags.push(...locale.topics[topic]);
  }
  return tags;
}

export function videoTags(deck: Deck, title: string, text: string): string[] {
  const kind = tagKind(deck);
  if (!kind) return limitTags(deck.tags);

  const lang = deckLang(deck.id) || packLang(deck.id) || "en";
  const locale = LOCALES[lang] ?? LOCALES.en;
  const seed = `${deck.id}|${title}|${text}`;
  const base = kind === "meme" ? locale.memeBase : locale.jokeBase;
  const pool = kind === "meme" ? locale.memePool : locale.jokePool;
  const topicTags = detectedTopicTags(locale, `${title}\n${text}`);

  return limitTags([...base, ...topicTags, ...pickTags(pool, seed, MAX_TAGS)]);
}


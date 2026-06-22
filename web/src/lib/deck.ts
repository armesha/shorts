import { useEffect, useState } from "react";

const KEY = "deckId";

/** Remembered pack/deck choice (ru | de | it), persisted in localStorage so it's not re-picked each time. */
export function useDeck(): [string, (d: string) => void] {
  const [deck, setDeck] = useState<string>(() => localStorage.getItem(KEY) || "ru");
  useEffect(() => {
    localStorage.setItem(KEY, deck);
  }, [deck]);
  return [deck, setDeck];
}

// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for deck / language DISPLAY data.
// These tables used to be hand-copied across Studio, AccountDetail, PackDetail,
// CreatePackForm and Packs (and had already drifted). Import them from here instead.
// NOTE: this is content/branding data, NOT UI strings — deck/language names stay in
// their natural form regardless of the dashboard's UI language.
// ─────────────────────────────────────────────────────────────────────────────

/** Russian gloss for foreign-named built-in decks, shown in parentheses next to the deck name. */
export const DECK_GLOSS_RU: Record<string, string> = {
  de: "Немецкие анекдоты",
  it: "Итальянские анекдоты",
  fr: "Французские анекдоты",
  en: "Английские анекдоты",
  "tips-de": "Немецкие лайфхаки",
  psych: "Психология",
  islamic: "Ислам · арабский",
  christian: "Библия · англ.",
  "fact-en": "Интересные факты · видео",
  "quotes-de-1": "Цитаты политиков · нем.",
  "quotes-de-2": "Цитаты политиков · нем.",
  "quotes-de-3": "Цитаты политиков · нем.",
  "prayers-de": "Молитвы · нем.",
  space: "Космос · видео",
  "visual-riddles": "Визуальные загадки · видео",
  "animal-superheroes": "ЗвероГерои · видео",
  "animal-superheroes-en": "ЗвероГерои · видео · англ.",
  "memes-en": "Мемы · англ.",
  "memes-de": "Мемы · нем.",
  "memes-fr": "Мемы · фр.",
  "memes-it": "Мемы · итал.",
};

/** Deck name + Russian gloss in parentheses (when the name is foreign). */
export const deckLabel = (id: string, name: string): string =>
  DECK_GLOSS_RU[id] ? `${name} (${DECK_GLOSS_RU[id]})` : name;

/** Content language of each built-in deck (deck id → 2-letter lang). Custom packs carry their own lang. */
export const DECK_LANG: Record<string, string> = {
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en",
  tips: "ru", "tips-de": "de", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "quotes-de-1": "de", "quotes-de-2": "de", "quotes-de-3": "de", "prayers-de": "de", space: "en", "visual-riddles": "ru", "animal-superheroes": "ru", "animal-superheroes-en": "en",
  "memes-ru": "ru", "memes-en": "en", "memes-de": "de", "memes-fr": "fr", "memes-it": "it",
};

/** Uppercase 2-letter tag for a language code. */
export const LANG_TAG: Record<string, string> = { ru: "RU", de: "DE", it: "IT", fr: "FR", en: "EN", ar: "AR" };
export const langTag = (code: string): string => LANG_TAG[code] || (code || "").toUpperCase();

/** The content/channel languages a pack or channel can carry (code → human label). */
export const CONTENT_LANGS: { code: string; label: string }[] = [
  { code: "ru", label: "Русский" },
  { code: "de", label: "Немецкий" },
  { code: "it", label: "Итальянский" },
  { code: "fr", label: "Французский" },
  { code: "en", label: "Английский" },
  { code: "ar", label: "Арабский" },
];

/** Built-in content decks selectable as a channel's source (deck id → label shown in the dropdown). */
export const BUILTIN_DECKS: { id: string; label: string }[] = [
  { id: "de", label: "Немецкий" },
  { id: "ru", label: "Русский" },
  { id: "it", label: "Итальянский" },
  { id: "fr", label: "Французский" },
  { id: "en", label: "Английский" },
  { id: "tips", label: "Народные лайфхаки" },
  { id: "tips-de", label: "Немецкие лайфхаки" },
  { id: "psych", label: "Психология (DE)" },
  { id: "islamic", label: "Ислам · арабский (Коран и хадисы)" },
  { id: "christian", label: "Христианство · Библия (англ., KJV)" },
  { id: "fact-en", label: "Интересные факты (видео, EN)" },
  { id: "quotes-de-1", label: "Цитаты политиков 1 (видео, DE)" },
  { id: "quotes-de-2", label: "Цитаты политиков 2 (видео, DE)" },
  { id: "quotes-de-3", label: "Цитаты политиков 3 (видео, DE)" },
  { id: "prayers-de", label: "Gebete (видео, DE)" },
  { id: "space", label: "Космос (видео, EN)" },
  { id: "visual-riddles", label: "Вижу Ответ (видео, RU)" },
  { id: "animal-superheroes", label: "ЗвероГерои (видео, RU)" },
  { id: "animal-superheroes-en", label: "Animal Heroes (видео, EN)" },
  { id: "memes-ru", label: "Мемы (RU)" },
  { id: "memes-en", label: "Мемы (EN)" },
  { id: "memes-de", label: "Мемы (DE)" },
  { id: "memes-fr", label: "Мемы (FR)" },
  { id: "memes-it", label: "Мемы (IT)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Unified deck/pack picker model.
// Built-in decks (generators) and custom packs are merged into ONE list, grouped
// purely by content language (RU/DE/IT/FR/EN/AR) — a custom pack sits in its own
// language group next to the built-ins. There is no built-in-vs-custom split for
// the user — both are just "a content source". Shared by Studio and AccountDetail.
// ─────────────────────────────────────────────────────────────────────────────

export type DeckPickItem = {
  id: string; // built-in deck id ("ru") or custom pack id ("pack:<id>")
  label: string; // display text (without the [видео]/[текст] kind prefix)
  lang: string; // content language code
  video: boolean; // prebuilt-video deck (preFact)
};

export type DeckGroup = { key: string; title: string; items: DeckPickItem[] };

type GenLike = { id: string; name: string; total?: number; preFact?: boolean };
type PackLike = { id: string; name: string; lang: string };

/**
 * Merge generators + custom packs into ONE list, grouped purely by content
 * language (RU/DE/IT/FR/EN/AR, order from CONTENT_LANGS). A custom pack lands in
 * its own language group right next to the built-in decks — there is no
 * built-in-vs-custom split. Within a group, built-in decks come first, then packs.
 */
export function buildDeckGroups(
  gens: GenLike[],
  packs: PackLike[],
  opts: {
    requireTotal?: boolean; // keep only decks that still have cards (Studio)
    excludeIds?: Set<string>; // hide already-picked ids (AccountDetail "add source")
    extraPacks?: { id: string; label: string; lang: string }[]; // e.g. "(нет доступа)" packs
  } = {},
): DeckGroup[] {
  const exclude = opts.excludeIds ?? new Set<string>();
  const byLang = new Map<string, DeckPickItem[]>();
  const push = (lang: string, item: DeckPickItem) => {
    let arr = byLang.get(lang);
    if (!arr) {
      arr = [];
      byLang.set(lang, arr);
    }
    arr.push(item);
  };
  for (const g of gens) {
    if (opts.requireTotal && !(g.total && g.total > 0)) continue;
    if (exclude.has(g.id)) continue;
    const lang = DECK_LANG[g.id] || "en";
    push(lang, { id: g.id, label: deckLabel(g.id, g.name), lang, video: !!g.preFact });
  }
  for (const p of packs) {
    const id = `pack:${p.id}`;
    if (exclude.has(id)) continue;
    const lang = p.lang || "en";
    push(lang, { id, label: p.name, lang, video: false });
  }
  for (const ex of opts.extraPacks ?? []) {
    if (exclude.has(ex.id)) continue;
    push(ex.lang || "en", { id: ex.id, label: ex.label, lang: ex.lang || "en", video: false });
  }
  const groups: DeckGroup[] = [];
  for (const { code, label } of CONTENT_LANGS) {
    const items = byLang.get(code);
    if (items?.length) groups.push({ key: code, title: label, items });
    byLang.delete(code);
  }
  for (const [code, items] of byLang) {
    if (items.length) groups.push({ key: code, title: langTag(code) || code, items });
  }
  return groups;
}

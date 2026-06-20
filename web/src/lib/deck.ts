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
  "quotes-de": "Цитаты политиков · нем.",
  space: "Космос · видео",
  "visual-riddles": "Визуальные загадки · видео",
  "animal-superheroes": "ЗвероГерои · видео",
  "animal-superheroes-en": "ЗвероГерои · видео · англ.",
};

/** Deck name + Russian gloss in parentheses (when the name is foreign). */
export const deckLabel = (id: string, name: string): string =>
  DECK_GLOSS_RU[id] ? `${name} (${DECK_GLOSS_RU[id]})` : name;

/** Content language of each built-in deck (deck id → 2-letter lang). Custom packs carry their own lang. */
export const DECK_LANG: Record<string, string> = {
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en",
  tips: "ru", "tips-de": "de", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "quotes-de": "de", space: "en", "visual-riddles": "ru", "animal-superheroes": "ru", "animal-superheroes-en": "en",
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
  { id: "quotes-de", label: "Цитаты политиков (видео, DE)" },
  { id: "space", label: "Космос (видео, EN)" },
  { id: "visual-riddles", label: "Вижу Ответ (видео, RU)" },
  { id: "animal-superheroes", label: "ЗвероГерои (видео, RU)" },
  { id: "animal-superheroes-en", label: "Animal Heroes (видео, EN)" },
];

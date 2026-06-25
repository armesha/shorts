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
  "tips-es": "Испанские лайфхаки",
  "tips-ar": "Арабские лайфхаки",
  "tips-en": "Английские лайфхаки",
  "tips-it": "Итальянские лайфхаки",
  "tips-fr": "Французские лайфхаки",
  "tips-pt": "Португальские лайфхаки",
  "tips-hi": "Лайфхаки · хинди",
  "tips-id": "Индонезийские лайфхаки",
  psych: "Психология",
  islamic: "Ислам · арабский",
  christian: "Библия · англ.",
  "fact-en": "Интересные факты · видео",
  "quotes-ru": "Цитаты · рус.",
  "quotes-ar": "Цитаты · араб.",
  "quotes-en": "Цитаты · англ.",
  "quotes-it": "Цитаты · итал.",
  "quotes-es": "Цитаты · исп.",
  "quotes-fr": "Цитаты · фр.",
  "quotes-pt": "Цитаты · порт.",
  "quotes-hi": "Цитаты · хинди",
  "quotes-id": "Цитаты · индон.",
  "quotes-de": "Цитаты политиков · нем.",
  "quotes-de-1": "Цитаты политиков · нем.",
  "quotes-de-2": "Цитаты политиков · нем.",
  "quotes-de-3": "Цитаты политиков · нем.",
  "prayers-de": "Молитвы · нем.",
  space: "Космос · видео",
  "visual-riddles": "Визуальные загадки · видео",
  "long-anecdotes-ru": "Русские анекдоты · длинное видео",
  "long-anecdotes-soul-ru": "Русские анекдоты · длинное видео",
  "long-islamic-ar": "Ислам · длинное видео · арабский",
  "long-christian-en": "Христианство · длинное видео · англ.",
  "visual-riddles-de": "Sieh die Antwort · видео (DE)",
  "visual-riddles-en": "Визуальные загадки · видео · англ.",
  "animal-superheroes": "ЗвероГерои · видео",
  "animal-superheroes-en": "ЗвероГерои · видео · англ.",
  "illusions-3d": "Иллюзия вращения · видео",
  "illusions-3d-de": "Überliste dein Gehirn · видео (DE)",
  "illusions-3d-en": "3D-иллюзии вращения · видео · англ.",
  "illusions-en": "Оптические иллюзии · видео · англ.",
  "illusions-de": "Оптические иллюзии · видео · нем.",
  "illusions-it": "Оптические иллюзии · видео · итал.",
  "illusions-es": "Оптические иллюзии · видео · исп.",
  "illusions-ru": "Оптические иллюзии · видео",
  "illusions-fr": "Оптические иллюзии · видео · фр.",
  "illusions-pt": "Оптические иллюзии · видео · порт.",
  "illusions-hi": "Оптические иллюзии · видео · хинди",
  "illusions-id": "Оптические иллюзии · видео · индон.",
  "illusions-ar": "Оптические иллюзии · видео · араб.",
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
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en", choose: "ru",
  tips: "ru", "tips-de": "de", "tips-es": "es", "tips-ar": "ar", "tips-en": "en", "tips-it": "it", "tips-fr": "fr", "tips-pt": "pt", "tips-hi": "hi", "tips-id": "id", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "quotes-ru": "ru", "quotes-ar": "ar", "quotes-en": "en", "quotes-it": "it", "quotes-es": "es", "quotes-fr": "fr", "quotes-pt": "pt", "quotes-hi": "hi", "quotes-id": "id", "quotes-de": "de", "quotes-de-1": "de", "quotes-de-2": "de", "quotes-de-3": "de", "prayers-de": "de", space: "en", "visual-riddles": "ru", "long-anecdotes-ru": "ru", "long-anecdotes-soul-ru": "ru", "long-islamic-ar": "ar", "long-christian-en": "en", "visual-riddles-de": "de", "visual-riddles-en": "en", "animal-superheroes": "ru", "animal-superheroes-en": "en", "illusions-3d": "ru", "illusions-3d-de": "de", "illusions-3d-en": "en", "illusions-en": "en", "illusions-de": "de", "illusions-it": "it", "illusions-es": "es", "illusions-ru": "ru", "illusions-fr": "fr", "illusions-pt": "pt", "illusions-hi": "hi", "illusions-id": "id", "illusions-ar": "ar",
  "memes-ru": "ru", "memes-en": "en", "memes-de": "de", "memes-fr": "fr", "memes-it": "it",
};

/** Uppercase 2-letter tag for a language code. */
export const LANG_TAG: Record<string, string> = {
  ru: "RU",
  de: "DE",
  it: "IT",
  fr: "FR",
  en: "EN",
  es: "ES",
  ar: "AR",
  pt: "PT",
  hi: "HI",
  id: "ID",
};
export const langTag = (code: string): string => LANG_TAG[code] || (code || "").toUpperCase();

/** The content/channel languages a pack or channel can carry (code → human label). */
export const CONTENT_LANGS: { code: string; label: string }[] = [
  { code: "ru", label: "Русский" },
  { code: "ar", label: "Арабский" },
  { code: "en", label: "Английский" },
  { code: "it", label: "Итальянский" },
  { code: "es", label: "Испанский" },
  { code: "de", label: "Немецкий" },
  { code: "pt", label: "Португальский" },
  { code: "hi", label: "Хинди" },
  { code: "id", label: "Индонезийский" },
  { code: "fr", label: "Французский" },
];

/** Built-in content decks selectable as a channel's source (deck id → label shown in the dropdown). */
export const BUILTIN_DECKS: { id: string; label: string }[] = [
  { id: "de", label: "Немецкий" },
  { id: "ru", label: "Русский" },
  { id: "it", label: "Итальянский" },
  { id: "fr", label: "Французский" },
  { id: "en", label: "Английский" },
  { id: "tips", label: "Народные лайфхаки" },
  { id: "choose", label: "Что выберешь? (RU)" },
  { id: "tips-de", label: "Немецкие лайфхаки" },
  { id: "tips-es", label: "Trucos utiles (ES)" },
  { id: "tips-ar", label: "نصائح يومية (AR)" },
  { id: "tips-en", label: "Everyday Lifehacks (EN)" },
  { id: "tips-it", label: "Consigli utili (IT)" },
  { id: "tips-fr", label: "Astuces utiles (FR)" },
  { id: "tips-pt", label: "Dicas úteis (PT)" },
  { id: "tips-hi", label: "रोज़मर्रा के टिप्स (HI)" },
  { id: "tips-id", label: "Tips Harian (ID)" },
  { id: "psych", label: "Психология (DE)" },
  { id: "islamic", label: "Ислам · арабский (Коран и хадисы)" },
  { id: "christian", label: "Христианство · Библия (англ., KJV)" },
  { id: "fact-en", label: "Интересные факты (видео, EN)" },
  { id: "quotes-ru", label: "Цитаты великих людей (RU)" },
  { id: "quotes-ar", label: "اقتباسات ملهمة (AR)" },
  { id: "quotes-en", label: "Great Quotes (EN)" },
  { id: "quotes-it", label: "Citazioni famose (IT)" },
  { id: "quotes-es", label: "Citas famosas (ES)" },
  { id: "quotes-fr", label: "Citations celebres (FR)" },
  { id: "quotes-pt", label: "Citações famosas (PT)" },
  { id: "quotes-hi", label: "प्रेरक उद्धरण (HI)" },
  { id: "quotes-id", label: "Kutipan Terkenal (ID)" },
  { id: "quotes-de", label: "Politiker-Zitate (DE)" },
  { id: "quotes-de-1", label: "Цитаты политиков 1 (видео, DE)" },
  { id: "quotes-de-2", label: "Цитаты политиков 2 (видео, DE)" },
  { id: "quotes-de-3", label: "Цитаты политиков 3 (видео, DE)" },
  { id: "prayers-de", label: "Gebete (видео, DE)" },
  { id: "space", label: "Космос (видео, EN)" },
  { id: "visual-riddles", label: "Вижу Ответ (видео, RU)" },
  { id: "long-anecdotes-ru", label: "Русские анекдоты (длинное видео, RU)" },
  { id: "long-anecdotes-soul-ru", label: "Русские анекдоты (длинное видео, RU)" },
  { id: "long-islamic-ar", label: "القرآن والحديث والدعاء (длинное видео, AR)" },
  { id: "long-christian-en", label: "The Faithful Journey (длинное видео, EN)" },
  { id: "visual-riddles-de", label: "Sieh die Antwort (видео, DE)" },
  { id: "visual-riddles-en", label: "Visual Riddles (видео, EN)" },
  { id: "animal-superheroes", label: "ЗвероГерои (видео, RU)" },
  { id: "animal-superheroes-en", label: "Animal Heroes (видео, EN)" },
  { id: "illusions-3d", label: "Обмани свой мозг (видео, RU)" },
  { id: "illusions-3d-de", label: "Überliste dein Gehirn (видео, DE)" },
  { id: "illusions-3d-en", label: "Mind-Flip 3D Illusions (видео, EN)" },
  { id: "illusions-en", label: "Optical Illusions (видео, EN)" },
  { id: "illusions-de", label: "Optische Täuschungen (видео, DE)" },
  { id: "illusions-it", label: "Illusioni ottiche (видео, IT)" },
  { id: "illusions-es", label: "Ilusiones ópticas (видео, ES)" },
  { id: "illusions-ru", label: "Оптические иллюзии (видео, RU)" },
  { id: "illusions-fr", label: "Illusions optiques (видео, FR)" },
  { id: "illusions-pt", label: "Ilusões ópticas (видео, PT)" },
  { id: "illusions-hi", label: "दृष्टि भ्रम (видео, HI)" },
  { id: "illusions-id", label: "Ilusi Optik (видео, ID)" },
  { id: "illusions-ar", label: "خدع بصرية (видео, AR)" },
  { id: "memes-ru", label: "Мемы (RU)" },
  { id: "memes-en", label: "Мемы (EN)" },
  { id: "memes-de", label: "Мемы (DE)" },
  { id: "memes-fr", label: "Мемы (FR)" },
  { id: "memes-it", label: "Мемы (IT)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Unified deck/pack picker model.
// Built-in decks (generators) and custom packs are merged into ONE list, grouped
// purely by content language — a custom pack sits in its own
// language group next to the built-ins. There is no built-in-vs-custom split for
// the user — both are just "a content source". Shared by Studio and AccountDetail.
// ─────────────────────────────────────────────────────────────────────────────

export type DeckPickItem = {
  id: string; // built-in deck id ("ru") or custom pack id ("pack:<id>")
  label: string; // display text (without the [видео]/[текст] kind prefix)
  lang: string; // content language code
  video: boolean; // prebuilt-video deck (preFact)
  longVideo?: boolean; // long prebuilt compilation
};

export type DeckGroup = { key: string; title: string; items: DeckPickItem[] };

type GenLike = { id: string; name: string; total?: number; preFact?: boolean; longVideo?: boolean };
type PackLike = { id: string; name: string; lang: string };

/**
 * Merge generators + custom packs into ONE list, grouped purely by content
 * language (order from CONTENT_LANGS). A custom pack lands in
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
    push(lang, { id: g.id, label: deckLabel(g.id, g.name), lang, video: !!g.preFact, longVideo: !!g.longVideo });
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

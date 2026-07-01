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
  pt: "Португальские анекдоты",
  psych: "Психология",
  islamic: "Ислам · арабский",
  christian: "Библия · англ.",
  "fact-en": "Интересные факты · видео",
  "fact-ru": "Интересные факты · видео · рус.",
  "fact-es": "Интересные факты · видео · исп.",
  "quotes-ru": "Цитаты · рус.",
  "quotes-ar": "Цитаты · араб.",
  "islamic-quotes-ar": "Исламские цитаты · араб.",
  "islamic-facts-ar": "Факты об исламе · араб.",
  "quotes-en": "Цитаты · англ.",
  "christian-quotes-en": "Христианские цитаты · англ.",
  "christian-facts-en": "Факты о христианстве · англ.",
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
  "quote-video-ru": "Видео-цитаты · рус.",
  "quote-video-en": "Видео-цитаты · англ.",
  "quote-video-es": "Видео-цитаты · исп.",
  "quote-video-it": "Видео-цитаты · итал.",
  "quote-video-fr": "Видео-цитаты · фр.",
  "quote-video-pt": "Видео-цитаты · порт.",
  "quote-video-hi": "Видео-цитаты · хинди",
  "quote-video-id": "Видео-цитаты · индон.",
  "quote-video-ar": "Видео-цитаты · араб.",
  "quote-video-de": "Видео-цитаты · нем.",
  "prayers-de": "Молитвы · нем.",
  "prayers-en": "Молитвы · англ.",
  space: "Космос · видео",
  "space-es": "Космос · видео · исп.",
  "visual-riddles": "Визуальные загадки · видео",
  "long-anecdotes-ru": "Русские анекдоты · длинное видео",
  "long-anecdotes-soul-ru": "Русские анекдоты · длинное видео",
  "long-islamic-ar": "Ислам · длинное видео · арабский",
  "long-christian-en": "Христианство · длинное видео · англ.",
  "visual-riddles-de": "Sieh die Antwort · видео (DE)",
  "visual-riddles-en": "Визуальные загадки · видео · англ.",
  "visual-riddles-it": "Визуальные загадки · видео · итал.",
  "visual-riddles-es": "Визуальные загадки · видео · исп.",
  "visual-riddles-fr": "Визуальные загадки · видео · фр.",
  "visual-riddles-pt": "Визуальные загадки · видео · порт.",
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
  "memes-pt": "Мемы · порт.",
  "memes-es": "Мемы · исп.",
  "memes-hi": "Мемы · хинди",
  "memes-id": "Мемы · индон.",
  "memes-ar": "Мемы · араб.",
};

/** Deck name + Russian gloss in parentheses (when the name is foreign). */
export const deckLabel = (id: string, name: string): string =>
  DECK_GLOSS_RU[id] ? `${name} (${DECK_GLOSS_RU[id]})` : name;

/** Content language of each built-in deck (deck id → 2-letter lang). Custom packs carry their own lang. */
export const DECK_LANG: Record<string, string> = {
  ru: "ru", de: "de", it: "it", fr: "fr", en: "en", pt: "pt", choose: "ru", psych: "de", islamic: "ar", christian: "en", "fact-en": "en", "fact-ru": "ru", "fact-es": "es", "quotes-ru": "ru", "quotes-ar": "ar", "islamic-quotes-ar": "ar", "islamic-facts-ar": "ar", "quotes-en": "en", "christian-quotes-en": "en", "christian-facts-en": "en", "quotes-it": "it", "quotes-es": "es", "quotes-fr": "fr", "quotes-pt": "pt", "quotes-hi": "hi", "quotes-id": "id", "quotes-de": "de", "quote-video-ru": "ru", "quote-video-en": "en", "quote-video-es": "es", "quote-video-it": "it", "quote-video-fr": "fr", "quote-video-pt": "pt", "quote-video-hi": "hi", "quote-video-id": "id", "quote-video-ar": "ar", "quote-video-de": "de", "quotes-de-1": "de", "quotes-de-2": "de", "quotes-de-3": "de", "prayers-de": "de", "prayers-en": "en", space: "en", "space-es": "es", "visual-riddles": "ru", "long-anecdotes-ru": "ru", "long-anecdotes-soul-ru": "ru", "long-islamic-ar": "ar", "long-christian-en": "en", "visual-riddles-de": "de", "visual-riddles-en": "en", "visual-riddles-it": "it", "visual-riddles-es": "es", "visual-riddles-fr": "fr", "visual-riddles-pt": "pt", "animal-superheroes": "ru", "animal-superheroes-en": "en", "illusions-3d": "ru", "illusions-3d-de": "de", "illusions-3d-en": "en", "illusions-en": "en", "illusions-de": "de", "illusions-it": "it", "illusions-es": "es", "illusions-ru": "ru", "illusions-fr": "fr", "illusions-pt": "pt", "illusions-hi": "hi", "illusions-id": "id", "illusions-ar": "ar",
  "memes-ru": "ru", "memes-en": "en", "memes-de": "de", "memes-fr": "fr", "memes-it": "it", "memes-pt": "pt", "memes-es": "es", "memes-hi": "hi", "memes-id": "id", "memes-ar": "ar",
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

export const REMOVED_SUPER_ADMIN_OPTICAL_DECKS = new Set([
  "visual-riddles",
  "visual-riddles-de",
  "visual-riddles-en",
  "visual-riddles-it",
  "visual-riddles-es",
  "visual-riddles-fr",
  "visual-riddles-pt",
  "illusions-3d",
  "illusions-3d-de",
  "illusions-3d-en",
  "illusions-en",
  "illusions-de",
  "illusions-it",
  "illusions-es",
  "illusions-ru",
  "illusions-fr",
  "illusions-pt",
  "illusions-hi",
  "illusions-id",
  "illusions-ar",
]);

export const LEGACY_SUPER_ADMIN_MEME_DECKS = new Set([
  "memes-ru",
  "memes-en",
  "memes-de",
  "memes-it",
  "memes-es",
  "memes-fr",
  "memes-pt",
  "memes-hi",
  "memes-id",
  "memes-ar",
]);

export const MGS_ONLY_SUPER_ADMIN_DECKS = new Set([
  "pack:психология-mgs-mqe2kfjv",
  "pack:психология-mgs-mqp9hqle",
  "pack:mgs-psychologie-eigen",
]);

export const RETIRED_SUPER_ADMIN_STATIC_FACT_DECKS = new Set([
  "pack:static-facts-en-superadmin",
  "pack:static-facts-de-superadmin",
  "pack:static-facts-es-superadmin",
]);

export const RETIRED_SUPER_ADMIN_RUSSIAN_MOTIVATION_DECKS = new Set([
  "pack:motivation-ru-superadmin",
]);

export const RETIRED_SUPER_ADMIN_RELIGIOUS_DECKS = new Set([
  "islamic",
  "islamic-quotes-ar",
  "islamic-facts-ar",
  "christian",
  "prayers-en",
  "prayers-de",
  "christian-quotes-en",
  "christian-facts-en",
  "long-islamic-ar",
  "long-christian-en",
]);

export const RETIRED_SUPER_ADMIN_SOVIET_POSTER_DECKS = new Set([
  "pack:soviet-posters-ru",
]);

export const FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS = new Set([
  ...REMOVED_SUPER_ADMIN_OPTICAL_DECKS,
  ...LEGACY_SUPER_ADMIN_MEME_DECKS,
  ...MGS_ONLY_SUPER_ADMIN_DECKS,
  ...RETIRED_SUPER_ADMIN_STATIC_FACT_DECKS,
  ...RETIRED_SUPER_ADMIN_RUSSIAN_MOTIVATION_DECKS,
  ...RETIRED_SUPER_ADMIN_RELIGIOUS_DECKS,
  ...RETIRED_SUPER_ADMIN_SOVIET_POSTER_DECKS,
]);

export const isRemovedSuperAdminOpticalDeck = (id: string): boolean =>
  REMOVED_SUPER_ADMIN_OPTICAL_DECKS.has(id);

export const isForbiddenSuperAdminSourceDeck = (id: string): boolean =>
  FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS.has(id);

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
  { id: "pt", label: "Португальский" },
  { id: "choose", label: "Что выберешь? (RU)" },
  { id: "psych", label: "Психология (DE)" },
  { id: "islamic", label: "Ислам · арабский (Коран и хадисы)" },
  { id: "christian", label: "Христианство · Библия (англ., KJV)" },
  { id: "fact-en", label: "Интересные факты (видео, EN)" },
  { id: "fact-es", label: "Datos curiosos (видео, ES)" },
  { id: "fact-ru", label: "Интересный факт (видео, RU)" },
  { id: "quotes-ru", label: "Цитаты великих людей (RU)" },
  { id: "quotes-ar", label: "اقتباسات ملهمة (AR)" },
  { id: "islamic-quotes-ar", label: "اقتباسات إسلامية (AR)" },
  { id: "islamic-facts-ar", label: "حقائق عن الإسلام (AR)" },
  { id: "quotes-en", label: "Great Quotes (EN)" },
  { id: "christian-quotes-en", label: "Christian Quotes (EN)" },
  { id: "christian-facts-en", label: "Christian Facts (EN)" },
  { id: "quotes-it", label: "Citazioni famose (IT)" },
  { id: "quotes-es", label: "Citas famosas (ES)" },
  { id: "quotes-fr", label: "Citations celebres (FR)" },
  { id: "quotes-pt", label: "Citações famosas (PT)" },
  { id: "quotes-hi", label: "प्रेरक उद्धरण (HI)" },
  { id: "quotes-id", label: "Kutipan Terkenal (ID)" },
  { id: "quotes-de", label: "Politiker-Zitate (DE)" },
  { id: "quote-video-ru", label: "Видео-цитаты (RU)" },
  { id: "quote-video-en", label: "Video Quotes (EN)" },
  { id: "quote-video-es", label: "Video citas (ES)" },
  { id: "quote-video-it", label: "Video citazioni (IT)" },
  { id: "quote-video-fr", label: "Video citations (FR)" },
  { id: "quote-video-pt", label: "Video citacoes (PT)" },
  { id: "quote-video-hi", label: "वीडियो उद्धरण (HI)" },
  { id: "quote-video-id", label: "Video kutipan (ID)" },
  { id: "quote-video-ar", label: "اقتباسات صوتية (AR)" },
  { id: "quote-video-de", label: "Video-Zitate (DE)" },
  { id: "quotes-de-1", label: "Цитаты политиков 1 (видео, DE)" },
  { id: "quotes-de-2", label: "Цитаты политиков 2 (видео, DE)" },
  { id: "quotes-de-3", label: "Цитаты политиков 3 (видео, DE)" },
  { id: "prayers-de", label: "Gebete (видео, DE)" },
  { id: "prayers-en", label: "Christian Prayers (видео, EN)" },
  { id: "space", label: "Космос (видео, EN)" },
  { id: "space-es", label: "Espacio (видео, ES)" },
  { id: "visual-riddles", label: "Вижу Ответ (видео, RU)" },
  { id: "long-anecdotes-ru", label: "Русские анекдоты (длинное видео, RU)" },
  { id: "long-anecdotes-soul-ru", label: "Русские анекдоты (длинное видео, RU)" },
  { id: "long-islamic-ar", label: "القرآن والحديث والدعاء (длинное видео, AR)" },
  { id: "long-christian-en", label: "The Faithful Journey (длинное видео, EN)" },
  { id: "visual-riddles-de", label: "Sieh die Antwort (видео, DE)" },
  { id: "visual-riddles-en", label: "Visual Riddles (видео, EN)" },
  { id: "visual-riddles-it", label: "Indovinelli visivi (видео, IT)" },
  { id: "visual-riddles-es", label: "Acertijos visuales (видео, ES)" },
  { id: "visual-riddles-fr", label: "Énigmes visuelles (видео, FR)" },
  { id: "visual-riddles-pt", label: "Enigmas visuais (видео, PT)" },
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
  { id: "memes-pt", label: "Memes (PT)" },
  { id: "memes-es", label: "Memes (ES)" },
  { id: "memes-hi", label: "मीम्स (HI)" },
  { id: "memes-id", label: "Memes (ID)" },
  { id: "memes-ar", label: "ميمز (AR)" },
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

// Pure channel-source derivations for the channel page.
// Everything here is a function of its explicit inputs (packs / generators / t / …),
// NEVER of component state setters. Anything that needs setState stays in index.tsx.

import type { Generator, PackSummary } from "../../lib/api";
import { BUILTIN_DECKS, DECK_LANG, langTag, buildDeckGroups, type DeckGroup } from "../../lib/deck";

type T = (key: string, vars?: Record<string, string | number>) => string;

export const GENERATE_ALL_DECKS = "__all_decks__";

/** Look up a generator (built-in deck) by id. */
export const genById = (gens: Generator[], id: string): Generator | undefined =>
  gens.find((g) => g.id === id);

/**
 * Остаток = СВОБОДНЫЕ (неиспользованные) карточки выбранного контента.
 * Для пака — available (cards − used), не общее число.
 */
export const sourceRemaining = (packs: PackSummary[], gens: Generator[], deckId: string): number => {
  if (deckId.startsWith("pack:")) {
    const p = packs.find((pp) => `pack:${pp.id}` === deckId);
    return p?.available ?? p?.cards ?? 0;
  }
  return gens.find((gg) => gg.id === deckId)?.available ?? 0;
};

const SUFFIX_LANGS = new Set(["ru", "ar", "en", "it", "es", "de", "fr", "pt", "ro", "cs", "nl", "hi", "id"]);

const inferredBuiltinLang = (id: string): string => {
  if (DECK_LANG[id]) return DECK_LANG[id];
  const suffix = id.toLowerCase().split("-").pop() || "";
  return SUFFIX_LANGS.has(suffix) ? suffix : "";
};

/** Язык выбранного контента (встроенный или свой пак) — для тега и проверки совпадения с языком канала. */
export const contentLang = (packs: PackSummary[], id: string): string =>
  id.startsWith("pack:")
    ? packs.find((p) => `pack:${p.id}` === id)?.lang || ""
    : id.startsWith("telegram-circles:")
      ? "ru"
      : inferredBuiltinLang(id);

/** Источники, чей язык не совпадает с языком канала. */
export const mismatchedSources = (
  packs: PackSummary[],
  selectedSources: string[],
  channelLang: string,
): string[] =>
  selectedSources.filter((deckId) => {
    const lng = contentLang(packs, deckId);
    return !!channelLang && !!lng && lng !== channelLang;
  });

/** Display name of a deck/pack id. */
export const deckName = (packs: PackSummary[], gens: Generator[], t: T, deckId: string): string => {
  if (deckId.startsWith("pack:")) {
    const p = packs.find((x) => `pack:${x.id}` === deckId);
    return p ? p.name : `${deckId.slice(5)} ${t("account.noAccess")}`;
  }
  return genById(gens, deckId)?.name || BUILTIN_DECKS.find((d) => d.id === deckId)?.label || deckId;
};

/** "<LANG> · N карточек/доступно" meta line for a deck/pack id. */
export const deckMeta = (packs: PackSummary[], gens: Generator[], t: T, deckId: string): string => {
  const lng = contentLang(packs, deckId);
  const count = sourceRemaining(packs, gens, deckId);
  const suffix = deckId.startsWith("pack:")
    ? t("account.cardsCount", { n: count })
    : t("account.availableCount", { n: count });
  return `${langTag(lng)} · ${suffix}`;
};

/**
 * Единый пикер источников: встроенные деки + кастомные паки, сгруппированы только по языку.
 * Возвращает ГРУППЫ (данные) — JSX-рендер (<optgroup>) остаётся в компоненте. Общий хелпер со Студией.
 */
export const deckGroups = (
  packs: PackSummary[],
  gens: Generator[],
  visibleLangs: { id: string; label: string }[],
  selectedSources: string[],
  packIds: Set<string>,
  t: T,
  excludeSelected = false,
  hiddenIds?: Set<string>,
): DeckGroup[] => {
  const exclude = new Set<string>(hiddenIds ?? []);
  if (excludeSelected) for (const source of selectedSources) exclude.add(source);
  const extraPacks = selectedSources
    .filter((x) => x.startsWith("pack:") && !packIds.has(x) && !exclude.has(x))
    .map((x) => ({ id: x, label: `${x.slice(5)} ${t("account.noAccess")}`, lang: "" }));
  const builtinGens = visibleLangs.map(({ id, label }) => genById(gens, id) ?? { id, name: label });
  return buildDeckGroups(builtinGens, packs, { excludeIds: exclude.size ? exclude : undefined, extraPacks });
};

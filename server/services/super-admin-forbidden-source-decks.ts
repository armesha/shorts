// Super-admin-only source guard for decks armen has retired from the thematic grid.
// These decks remain in the global catalog for other users, but armen's source
// pickers, block defaults, schedule slots, generation, live smoke checks and
// post-now paths must not use them.
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

export const RETIRED_SUPER_ADMIN_FACT_VIDEO_DECKS = new Set([
  "fact-ru",
  "fact-en",
  "fact-de",
  "fact-es",
  "fact-fr",
  "fact-it",
  "fact-pt",
]);

export const RETIRED_SUPER_ADMIN_STATIC_FACT_DECKS = new Set([
  "pack:static-facts-en-superadmin",
  "pack:static-facts-de-superadmin",
  "pack:static-facts-es-superadmin",
]);

export const RETIRED_SUPER_ADMIN_RUSSIAN_MOTIVATION_DECKS = new Set([
  "pack:motivation-ru-superadmin",
]);

export const RETIRED_SUPER_ADMIN_FOREIGN_MOTIVATION_DECKS = new Set([
  "pack:motivation-en-superadmin",
  "pack:motivation-de-superadmin",
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

export const RETIRED_SUPER_ADMIN_PSYCHOLOGY_DECKS = new Set([
  "pack:psychology-ru-superadmin",
  "pack:psychology-en-superadmin",
  "pack:psychology-de-superadmin",
  "pack:psychology-it-superadmin",
  "pack:psychology-es-superadmin",
  "pack:psychology-fr-superadmin",
  "pack:psychology-pt-superadmin",
]);

export const RETIRED_SUPER_ADMIN_SOVIET_POSTER_DECKS = new Set([
  "pack:soviet-posters-ru",
]);

export const FORBIDDEN_SUPER_ADMIN_SOURCE_GROUPS = [
  {
    group: "removed armen visual/optical decks",
    decks: [...REMOVED_SUPER_ADMIN_OPTICAL_DECKS],
  },
  {
    group: "legacy meme decks",
    decks: [...LEGACY_SUPER_ADMIN_MEME_DECKS],
  },
  {
    group: "mgs-only psychology decks",
    decks: [...MGS_ONLY_SUPER_ADMIN_DECKS],
  },
  {
    group: "retired armen fact video decks",
    decks: [...RETIRED_SUPER_ADMIN_FACT_VIDEO_DECKS],
  },
  {
    group: "retired armen static fact decks",
    decks: [...RETIRED_SUPER_ADMIN_STATIC_FACT_DECKS],
  },
  {
    group: "retired armen russian motivation decks",
    decks: [...RETIRED_SUPER_ADMIN_RUSSIAN_MOTIVATION_DECKS],
  },
  {
    group: "retired armen foreign motivation decks",
    decks: [...RETIRED_SUPER_ADMIN_FOREIGN_MOTIVATION_DECKS],
  },
  {
    group: "retired armen religious decks",
    decks: [...RETIRED_SUPER_ADMIN_RELIGIOUS_DECKS],
  },
  {
    group: "retired armen psychology decks",
    decks: [...RETIRED_SUPER_ADMIN_PSYCHOLOGY_DECKS],
  },
  {
    group: "retired armen soviet poster decks",
    decks: [...RETIRED_SUPER_ADMIN_SOVIET_POSTER_DECKS],
  },
];

export const FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS = new Set(
  FORBIDDEN_SUPER_ADMIN_SOURCE_GROUPS.flatMap((group) => group.decks),
);

export function isRemovedSuperAdminOpticalDeck(deckId: string): boolean {
  return REMOVED_SUPER_ADMIN_OPTICAL_DECKS.has(deckId);
}

export function isForbiddenSuperAdminSourceDeck(deckId: string): boolean {
  return FORBIDDEN_SUPER_ADMIN_SOURCE_DECKS.has(deckId);
}

export function cleanSuperAdminSourceDecks(deckIds: string[]): string[] {
  return [...new Set(deckIds)].filter((deckId) => !isForbiddenSuperAdminSourceDeck(deckId));
}

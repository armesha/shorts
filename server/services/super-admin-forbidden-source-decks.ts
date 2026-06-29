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

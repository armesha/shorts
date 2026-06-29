// Super-admin-only removal guard for the old visual/optical source family.
// These decks remain in the global catalog for other users, but armen's
// thematic grid, source pickers, schedule slots, generation and post-now paths
// must not use them.
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

export function isRemovedSuperAdminOpticalDeck(deckId: string): boolean {
  return REMOVED_SUPER_ADMIN_OPTICAL_DECKS.has(deckId);
}

export function cleanSuperAdminSourceDecks(deckIds: string[]): string[] {
  return [...new Set(deckIds)].filter((deckId) => !isRemovedSuperAdminOpticalDeck(deckId));
}

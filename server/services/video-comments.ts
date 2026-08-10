export const SHORTROBOT_VIDEO_COMMENT =
  "@shortrobot — Telegram-бот для скачивания видео с YouTube, Instagram, TikTok и других платформ. Ссылка — в профиле канала.";

export function automaticVideoCommentForDeck(deckId: string): string | null {
  return deckId === "shortrobot1" ? SHORTROBOT_VIDEO_COMMENT : null;
}

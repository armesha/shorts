const DECORATIVE_EMOJI_RE = /[\p{Extended_Pictographic}\uFE0F]/gu;

export function cleanDisplayText(value: string): string {
  return value.replace(DECORATIVE_EMOJI_RE, "").replace(/\s{2,}/g, " ").trim();
}

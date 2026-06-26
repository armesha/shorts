// Shared chart/number formatters for the Statistics page (web/src/pages/Statistics/*) and its
// admin «Сводка» tab (web/src/pages/Statistics/SystemOverview.tsx). Extracted verbatim from the
// previously duplicated copies. For UTC parsing / compact numbers, reuse web/src/lib/format.
import { compactNumber } from "./format";

// Compact integer-ish number (k/m/b…). Thin alias kept so call sites read `fmt(n)`.
export function fmt(n: number): string {
  return compactNumber(n);
}

// "+1.2k" / "−340" / "" (zero) — signed compact number.
export function signed(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}${fmt(Math.abs(n))}`;
}

// "YYYY-MM-DD" → "DD.MM" (ru-RU). Parsed at local midnight so the day never shifts.
export function shortDate(s: string): string {
  return new Date(`${s}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

// YouTube Analytics finalizes per-day metrics with a ~2–3 day lag, so the most recent day(s) come back
// all-zero and draw a misleading vertical cliff to 0 at the right edge of a daily chart. Strip only the
// trailing empty days (interior zeros are real data and stay) so the line ends on the last real day.
// `isEmpty` must look at per-day delta metrics only (views/watch/…), never cumulative totals.
export function trimTrailingEmptyDays<T>(rows: readonly T[], isEmpty: (row: T) => boolean): T[] {
  let end = rows.length;
  while (end > 0 && isEmpty(rows[end - 1] as T)) end -= 1;
  return rows.slice(0, end);
}

// In an AGGREGATE chart (all of a user's / all users' channels), a leading run of all-zero days is
// pre-history — the window simply predates any channel producing views (a real "every channel got 0
// views" day does not occur once there's activity). That flat strip wastes width, so trim it — but keep
// ONE zero day before the first active day so the "grew from zero" start stays visible. Interior zeros
// are untouched (only the contiguous head is removed). Returns [] when every day is empty.
// Same contract as trimTrailingEmptyDays: `isEmpty` must read per-day deltas only, never cumulative totals.
export function trimLeadingEmptyDays<T>(rows: readonly T[], isEmpty: (row: T) => boolean): T[] {
  const firstActive = rows.findIndex((r) => !isEmpty(r));
  if (firstActive < 0) return [];
  return rows.slice(Math.max(0, firstActive - 1));
}

// Watch time from minutes → "12h" / "1.5 h" / "30 m". Keeps one decimal in the 1..100 h band:
// compactNumber() integer-rounds values <1000, which would turn 1.5 h into "2 h", so the hours are
// formatted directly there instead of routing through compactNumber.
export function formatWatchMinutes(n: number): string {
  if (n >= 6000) return `${compactNumber(Math.round(n / 60))} h`;
  if (n >= 60) return `${(Math.round((n / 60) * 10) / 10).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} h`;
  return `${Math.round(n).toLocaleString("ru-RU")} m`;
}

// Seconds → "m:ss" (or "Ns" under a minute).
export function formatSeconds(n: number): string {
  const sec = Math.max(0, Math.round(n));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

// Overview-chart axis/tooltip formatter. The "watch" series is one-decimal hours; compactNumber()
// integer-rounds anything <1000, so it would flatten 0.3 h → "0" and 1.5 h → "2". Keep the tenths.
export function formatMetricValue(n: number, metric: "views" | "watch" | "engaged" | "subscribers"): string {
  if (metric === "watch") return n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return compactNumber(n);
}

// "YT_FOO_BAR" → "Foo bar" — humanise a YouTube breakdown key.
export function labelValue(v: string): string {
  return v
    .replace(/^YT_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function genderLabel(g: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const key = g.toLowerCase();
  if (key.includes("female")) return t("stats.genderFemale");
  if (key.includes("male")) return t("stats.genderMale");
  return t("stats.genderOther");
}

// Friendly names for YouTube sharingService values (proper nouns left untranslated).
export const SHARING_NAMES: Record<string, string> = {
  WHATS_APP: "WhatsApp",
  TELEGRAM: "Telegram",
  FACEBOOK: "Facebook",
  FACEBOOK_MESSENGER: "Messenger",
  TWITTER: "X (Twitter)",
  REDDIT: "Reddit",
  PINTEREST: "Pinterest",
  TUMBLR: "Tumblr",
  KAKAO: "KakaoTalk",
  LINE: "LINE",
  VKONTAKTE: "VK",
  COPY_PASTE: "Copy link",
  EMAIL: "Email",
  TEXT_MESSAGE: "Messages",
  ANDROID_MESSAGES: "Messages",
  EMBED: "Embed",
};
export function sharingLabel(s: string): string {
  return SHARING_NAMES[s] ?? labelValue(s);
}

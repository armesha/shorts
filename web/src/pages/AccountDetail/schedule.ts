// Pure scheduling helpers + slot-cap constants for the channel page.
// No component state here — these are functions of their inputs only.

// N posts/day spread ~evenly across 24h, but with a small RANDOM per-channel offset + jitter,
// so two channels with the same N never all fire at the same minute. `avoid` = minutes already
// used elsewhere (the user's other channels) — collisions are nudged forward a minute.
export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export type ScheduleWindow = { startMinute: number; endMinute: number };
export const FULL_DAY_SCHEDULE_WINDOW: ScheduleWindow = { startMinute: 0, endMinute: 1440 };
export const SUPER_ADMIN_SCHEDULE_START_HOUR = 8;
export const SUPER_ADMIN_SCHEDULE_WINDOW: ScheduleWindow = {
  startMinute: SUPER_ADMIN_SCHEDULE_START_HOUR * 60,
  endMinute: 1440,
};

type WeightedScheduleWindow = ScheduleWindow & { weight?: number };
type LocalScheduleWindow = { start: string; end: string; weight?: number };
type LanguageSchedulePolicy = {
  lang: string;
  audience: string;
  timeZone: string;
  windows: LocalScheduleWindow[];
};

const DEFAULT_SHORTS_SCHEDULE_POLICY: LanguageSchedulePolicy = {
  lang: "default",
  audience: "Local audience",
  timeZone: "Europe/Prague",
  windows: [
    { start: "12:00", end: "14:00", weight: 2 },
    { start: "17:00", end: "21:30", weight: 4 },
  ],
};

const SHORTS_SCHEDULE_POLICIES: Record<string, LanguageSchedulePolicy> = {
  ru: { lang: "ru", audience: "Russia / RU", timeZone: "Europe/Moscow", windows: [{ start: "09:00", end: "11:00", weight: 1 }, { start: "12:00", end: "14:00", weight: 1 }, { start: "18:00", end: "23:00", weight: 4 }] },
  ar: { lang: "ar", audience: "MENA / AR", timeZone: "Asia/Riyadh", windows: [{ start: "12:00", end: "14:00", weight: 1 }, { start: "18:00", end: "23:00", weight: 4 }] },
  en: { lang: "en", audience: "US Eastern / EN", timeZone: "America/New_York", windows: [{ start: "07:00", end: "09:00", weight: 1 }, { start: "12:00", end: "14:00", weight: 1 }, { start: "17:00", end: "21:00", weight: 4 }] },
  it: { lang: "it", audience: "Italy / IT", timeZone: "Europe/Rome", windows: [{ start: "09:30", end: "11:00", weight: 1 }, { start: "12:00", end: "14:00", weight: 2 }, { start: "17:00", end: "21:30", weight: 4 }] },
  es: { lang: "es", audience: "Spain / ES", timeZone: "Europe/Madrid", windows: [{ start: "09:30", end: "11:00", weight: 1 }, { start: "12:00", end: "14:00", weight: 2 }, { start: "17:30", end: "22:00", weight: 4 }] },
  pl: { lang: "pl", audience: "Poland / PL", timeZone: "Europe/Warsaw", windows: [{ start: "09:30", end: "11:00", weight: 1 }, { start: "12:00", end: "14:00", weight: 2 }, { start: "17:30", end: "22:00", weight: 4 }] },
  de: { lang: "de", audience: "Germany / DE", timeZone: "Europe/Berlin", windows: [{ start: "09:30", end: "11:00", weight: 1 }, { start: "12:00", end: "14:00", weight: 2 }, { start: "17:00", end: "21:30", weight: 4 }] },
  fr: { lang: "fr", audience: "France / FR", timeZone: "Europe/Paris", windows: [{ start: "09:30", end: "11:00", weight: 1 }, { start: "12:00", end: "14:00", weight: 2 }, { start: "17:00", end: "21:30", weight: 4 }] },
  pt: { lang: "pt", audience: "Brazil / PT", timeZone: "America/Sao_Paulo", windows: [{ start: "12:00", end: "14:00", weight: 1 }, { start: "19:00", end: "23:00", weight: 4 }] },
  hi: { lang: "hi", audience: "India / HI", timeZone: "Asia/Kolkata", windows: [{ start: "09:00", end: "11:00", weight: 1 }, { start: "13:00", end: "15:00", weight: 1 }, { start: "19:00", end: "23:00", weight: 4 }] },
  id: { lang: "id", audience: "Indonesia / ID", timeZone: "Asia/Jakarta", windows: [{ start: "12:00", end: "13:00", weight: 1 }, { start: "19:00", end: "22:30", weight: 4 }] },
  ja: { lang: "ja", audience: "Japan / JA", timeZone: "Asia/Tokyo", windows: [{ start: "07:00", end: "09:00", weight: 1 }, { start: "12:00", end: "13:00", weight: 1 }, { start: "18:00", end: "22:00", weight: 4 }] },
};

const timeToMin = (time: string): number | null => (/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? toMin(time) : null);

const localTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Prague";
  } catch {
    return "Europe/Prague";
  }
};

const zoneOffsetMinutes = (timeZone: string, referenceDate: Date): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(referenceDate);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - referenceDate.getTime()) / 60_000);
};

const localMinuteToSystemMinute = (localMinute: number, targetTimeZone: string, referenceDate: Date): number => {
  const targetOffset = zoneOffsetMinutes(targetTimeZone, referenceDate);
  const systemOffset = zoneOffsetMinutes(localTimeZone(), referenceDate);
  return ((localMinute - targetOffset + systemOffset) % 1440 + 1440) % 1440;
};

const splitWindow = (startMinute: number, endMinute: number, weight = 1): WeightedScheduleWindow[] => {
  if (startMinute === endMinute) return [];
  if (startMinute < endMinute) return [{ startMinute, endMinute, weight }];
  return [
    { startMinute, endMinute: 1440, weight },
    { startMinute: 0, endMinute, weight },
  ];
};

export const shortsSchedulePolicyForLanguage = (lang: string | null | undefined): LanguageSchedulePolicy =>
  SHORTS_SCHEDULE_POLICIES[String(lang || "").trim().toLowerCase()] ?? DEFAULT_SHORTS_SCHEDULE_POLICY;

export const shortsScheduleWindowsForLanguage = (
  lang: string | null | undefined,
  referenceDate = new Date(),
): WeightedScheduleWindow[] => {
  const policy = shortsSchedulePolicyForLanguage(lang);
  return policy.windows.flatMap((window) => {
    const start = timeToMin(window.start);
    const end = timeToMin(window.end);
    if (start == null || end == null) return [];
    return splitWindow(
      localMinuteToSystemMinute(start, policy.timeZone, referenceDate),
      localMinuteToSystemMinute(end, policy.timeZone, referenceDate),
      window.weight ?? 1,
    );
  });
};

const isMinuteInWindows = (minute: number, windows: ScheduleWindow[]): boolean =>
  windows.some((window) => minute >= window.startMinute && minute < window.endMinute);

export const describeShortsSchedulePolicy = (lang: string | null | undefined): string => {
  const policy = shortsSchedulePolicyForLanguage(lang);
  return `${policy.lang.toUpperCase()} (${policy.audience}, ${policy.timeZone}): ${policy.windows
    .map((window) => `${window.start}-${window.end}`)
    .join(", ")}`;
};

export const isSuperAdminScheduleTimeAllowed = (time: string, channelLang?: string | null): boolean => {
  const minute = timeToMin(time);
  if (minute == null) return false;
  if (channelLang) return isMinuteInWindows(minute, shortsScheduleWindowsForLanguage(channelLang));
  return minute >= SUPER_ADMIN_SCHEDULE_WINDOW.startMinute;
};

export const cleanSuperAdminScheduleTimes = (times: string[], channelLang?: string | null): string[] =>
  times.filter((time) => isSuperAdminScheduleTimeAllowed(time, channelLang));

// Per-channel daily slot cap follows the channel OWNER's profile: admins keep 20/day, mgs keeps the
// legacy regular-user profile, every other non-admin is capped at 5/day.
// (Backend mirror: server/infra/account-limits.ts — it's the authoritative enforcement.)
export const ADMIN_ACCOUNT_DAILY_SLOT_CAP = 20;
export const USER_ACCOUNT_DAILY_SLOT_CAP = 5;
export const MGS_ACCOUNT_DAILY_SLOT_CAP = 18;
export const USER_DAILY_SLOT_CAP = 50;
export const MGS_DAILY_SLOT_CAP = 92;
export const SUPER_ADMIN_DAILY_SLOT_CAP = 100;
export const USER_BATCH_VIDEO_CAP = 10;
export const USER_CHANNEL_LIBRARY_CAP = 50;
export const accountDailySlotCap = (ownerIsAdmin: boolean, ownerIsMgs = false): number =>
  ownerIsAdmin ? ADMIN_ACCOUNT_DAILY_SLOT_CAP : ownerIsMgs ? MGS_ACCOUNT_DAILY_SLOT_CAP : USER_ACCOUNT_DAILY_SLOT_CAP;
export const googleKeyDailySlotCap = (ownerIsSuperAdmin: boolean, ownerIsMgs = false): number =>
  ownerIsSuperAdmin ? SUPER_ADMIN_DAILY_SLOT_CAP : ownerIsMgs ? MGS_DAILY_SLOT_CAP : USER_DAILY_SLOT_CAP;

const normalizeScheduleWindows = (windows: ScheduleWindow | WeightedScheduleWindow[]): WeightedScheduleWindow[] =>
  (Array.isArray(windows) ? windows : [windows]).filter((window) => window.endMinute > window.startMinute);

const countsByWindow = (n: number, windows: WeightedScheduleWindow[]): number[] => {
  const weights = windows.map((window) => Math.max(1, window.endMinute - window.startMinute) * Math.max(0.1, window.weight ?? 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) => (n * weight) / total);
  const counts = exact.map(Math.floor);
  let remaining = n - counts.reduce((sum, count) => sum + count, 0);
  for (const item of exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest)) {
    if (remaining <= 0) break;
    counts[item.index] += 1;
    remaining -= 1;
  }
  return counts;
};

const randomWindowTimes = (n: number, avoid: Set<number>, used: Set<number>, window: ScheduleWindow): number[] => {
  if (n <= 0) return [];
  const windowMinutes = Math.max(1, window.endMinute - window.startMinute);
  const interval = windowMinutes / n;
  const phase = window.startMinute + Math.random() * interval; // per-channel random start within the first slot
  const jitter = Math.min(interval * 0.35, 20); // small → intervals stay roughly equal
  const mins: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = Math.round(phase + i * interval + (Math.random() * 2 - 1) * jitter);
    while (m < window.startMinute) m += windowMinutes;
    while (m >= window.endMinute) m -= windowMinutes;
    let guard = 0;
    while ((used.has(m) || avoid.has(m)) && guard++ < windowMinutes) {
      m += 1;
      if (m >= window.endMinute) m = window.startMinute;
    }
    used.add(m);
    mins.push(m);
  }
  return mins;
};

export const randomDayTimes = (
  n: number,
  avoid: Set<number> = new Set(),
  windows: ScheduleWindow | WeightedScheduleWindow[] = FULL_DAY_SCHEDULE_WINDOW,
): string[] => {
  if (n <= 0) return [];
  const normalized = normalizeScheduleWindows(windows);
  const safeWindows = normalized.length ? normalized : [SUPER_ADMIN_SCHEDULE_WINDOW];
  const counts = countsByWindow(n, safeWindows);
  const used = new Set<number>();
  const mins = safeWindows.flatMap((window, index) => randomWindowTimes(counts[index] ?? 0, avoid, used, window));
  return mins
    .sort((a, b) => a - b)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
};

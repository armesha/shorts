// Per-channel daily video cap (= number of schedule slots on ONE channel). The ceiling follows the
// channel OWNER's profile: admins keep the historical 20/day; mgs keeps the legacy regular-user
// profile; every other non-admin channel is capped at 5/day.
export const ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP = 20;
export const USER_ACCOUNT_DAILY_SCHEDULE_CAP = 5;
export const MGS_ACCOUNT_DAILY_SCHEDULE_CAP = 18;

/** Back-compat alias (the admin ceiling) — kept for older callers/tests that referenced one constant. */
export const ACCOUNT_DAILY_SCHEDULE_CAP = ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP;

// Per Google key (Cloud project): total slots across ALL channels sharing that key — YouTube's upload
// quota is per project, not per channel. Super admin intentionally uses the full 100/day project quota.
export const USER_DAILY_SCHEDULE_CAP = 50;
export const MGS_DAILY_SCHEDULE_CAP = 92;
export const SUPER_ADMIN_DAILY_SCHEDULE_CAP = 100;

export const USER_BATCH_VIDEO_CAP = 10;
export const USER_CHANNEL_LIBRARY_CAP = 50;
export const MGS_LEGACY_USER_ID = Number(process.env.MGS_LEGACY_USER_ID || 3);
export const SUPER_ADMIN_SCHEDULE_START_HOUR = 8;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ScheduleWindow = { startMinute: number; endMinute: number; weight?: number };

type LocalScheduleWindow = { start: string; end: string; weight?: number };
type LanguageSchedulePolicy = {
  lang: string;
  audience: string;
  timeZone: string;
  avoidLocal: string[];
  windows: LocalScheduleWindow[];
};

const DEFAULT_SHORTS_SCHEDULE_POLICY: LanguageSchedulePolicy = {
  lang: "default",
  audience: "Local audience",
  timeZone: "Europe/Prague",
  avoidLocal: ["00:00-08:59", "22:30-23:59"],
  windows: [
    { start: "12:00", end: "14:00", weight: 2 },
    { start: "17:00", end: "21:30", weight: 4 },
  ],
};

const SHORTS_SCHEDULE_POLICIES: Record<string, LanguageSchedulePolicy> = {
  ru: {
    lang: "ru",
    audience: "Russia / RU",
    timeZone: "Europe/Moscow",
    avoidLocal: ["00:00-08:59", "23:00-23:59"],
    windows: [
      { start: "09:00", end: "11:00", weight: 1 },
      { start: "12:00", end: "14:00", weight: 1 },
      { start: "18:00", end: "23:00", weight: 4 },
    ],
  },
  ar: {
    lang: "ar",
    audience: "MENA / AR",
    timeZone: "Asia/Riyadh",
    avoidLocal: ["00:00-08:59"],
    windows: [
      { start: "12:00", end: "14:00", weight: 1 },
      { start: "18:00", end: "23:00", weight: 4 },
    ],
  },
  en: {
    lang: "en",
    audience: "US Eastern / EN",
    timeZone: "America/New_York",
    avoidLocal: ["00:00-06:59", "22:00-23:59"],
    windows: [
      { start: "07:00", end: "09:00", weight: 1 },
      { start: "12:00", end: "14:00", weight: 1 },
      { start: "17:00", end: "21:00", weight: 4 },
    ],
  },
  it: {
    lang: "it",
    audience: "Italy / IT",
    timeZone: "Europe/Rome",
    avoidLocal: ["00:00-08:59", "22:00-23:59"],
    windows: [
      { start: "09:30", end: "11:00", weight: 1 },
      { start: "12:00", end: "14:00", weight: 2 },
      { start: "17:00", end: "21:30", weight: 4 },
    ],
  },
  es: {
    lang: "es",
    audience: "Spain / ES",
    timeZone: "Europe/Madrid",
    avoidLocal: ["00:00-08:59", "22:30-23:59"],
    windows: [
      { start: "09:30", end: "11:00", weight: 1 },
      { start: "12:00", end: "14:00", weight: 2 },
      { start: "17:30", end: "22:00", weight: 4 },
    ],
  },
  pl: {
    lang: "pl",
    audience: "Poland / PL",
    timeZone: "Europe/Warsaw",
    avoidLocal: ["00:00-08:59", "22:30-23:59"],
    windows: [
      { start: "09:30", end: "11:00", weight: 1 },
      { start: "12:00", end: "14:00", weight: 2 },
      { start: "17:30", end: "22:00", weight: 4 },
    ],
  },
  de: {
    lang: "de",
    audience: "Germany / DE",
    timeZone: "Europe/Berlin",
    avoidLocal: ["00:00-08:59", "22:00-23:59"],
    windows: [
      { start: "09:30", end: "11:00", weight: 1 },
      { start: "12:00", end: "14:00", weight: 2 },
      { start: "17:00", end: "21:30", weight: 4 },
    ],
  },
  fr: {
    lang: "fr",
    audience: "France / FR",
    timeZone: "Europe/Paris",
    avoidLocal: ["00:00-08:59", "22:00-23:59"],
    windows: [
      { start: "09:30", end: "11:00", weight: 1 },
      { start: "12:00", end: "14:00", weight: 2 },
      { start: "17:00", end: "21:30", weight: 4 },
    ],
  },
  pt: {
    lang: "pt",
    audience: "Brazil / PT",
    timeZone: "America/Sao_Paulo",
    avoidLocal: ["00:00-08:59", "23:00-23:59"],
    windows: [
      { start: "12:00", end: "14:00", weight: 1 },
      { start: "19:00", end: "23:00", weight: 4 },
    ],
  },
  hi: {
    lang: "hi",
    audience: "India / HI",
    timeZone: "Asia/Kolkata",
    avoidLocal: ["00:00-08:59"],
    windows: [
      { start: "09:00", end: "11:00", weight: 1 },
      { start: "13:00", end: "15:00", weight: 1 },
      { start: "19:00", end: "23:00", weight: 4 },
    ],
  },
  id: {
    lang: "id",
    audience: "Indonesia / ID",
    timeZone: "Asia/Jakarta",
    avoidLocal: ["00:00-08:59", "22:30-23:59"],
    windows: [
      { start: "12:00", end: "13:00", weight: 1 },
      { start: "19:00", end: "22:30", weight: 4 },
    ],
  },
  ja: {
    lang: "ja",
    audience: "Japan / JA",
    timeZone: "Asia/Tokyo",
    avoidLocal: ["00:00-06:59", "22:00-23:59"],
    windows: [
      { start: "07:00", end: "09:00", weight: 1 },
      { start: "12:00", end: "13:00", weight: 1 },
      { start: "18:00", end: "22:00", weight: 4 },
    ],
  },
};

export function isMgsUser(user: { id?: number | null; username?: string | null } | null | undefined): boolean {
  return Number(user?.id) === MGS_LEGACY_USER_ID && String(user?.username ?? "").trim().toLowerCase() === "mgs";
}

/** Per-channel daily slot ceiling for an owner of the given role. */
export function accountDailyScheduleCap(isAdminOwner: boolean, isMgsOwner = false): number {
  if (isAdminOwner) return ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP;
  return isMgsOwner ? MGS_ACCOUNT_DAILY_SCHEDULE_CAP : USER_ACCOUNT_DAILY_SCHEDULE_CAP;
}

export function googleKeyDailyScheduleCap(isSuperAdminOwner: boolean, isMgsOwner = false): number {
  if (isSuperAdminOwner) return SUPER_ADMIN_DAILY_SCHEDULE_CAP;
  return isMgsOwner ? MGS_DAILY_SCHEDULE_CAP : USER_DAILY_SCHEDULE_CAP;
}

export function channelLibraryVideoCap(isAdminOwner: boolean, isMgsOwner = false): number | null {
  return isAdminOwner || isMgsOwner ? null : USER_CHANNEL_LIBRARY_CAP;
}

export function channelLibraryLimitError(
  currentCount: number,
  addingCount: number,
  isAdminOwner: boolean,
  isMgsOwner = false,
): string | null {
  const cap = channelLibraryVideoCap(isAdminOwner, isMgsOwner);
  if (cap == null) return null;
  const current = Math.max(0, Math.floor(currentCount) || 0);
  const adding = Math.max(1, Math.floor(addingCount) || 1);
  if (current + adding <= cap) return null;
  return `В библиотеке канала максимум ${cap} видео. Сейчас ${current}, можно добавить ещё ${Math.max(0, cap - current)}.`;
}

export function scheduleTimeMinutes(time: string): number | null {
  const match = HHMM_RE.exec(String(time || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Prague";
  } catch {
    return "Europe/Prague";
  }
}

function zoneOffsetMinutes(timeZone: string, referenceDate: Date): number {
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
}

function localMinuteToSystemMinute(localMinute: number, targetTimeZone: string, referenceDate: Date): number {
  const targetOffset = zoneOffsetMinutes(targetTimeZone, referenceDate);
  const systemOffset = zoneOffsetMinutes(localTimeZone(), referenceDate);
  return ((localMinute - targetOffset + systemOffset) % 1440 + 1440) % 1440;
}

function splitWindow(startMinute: number, endMinute: number, weight = 1): ScheduleWindow[] {
  if (startMinute === endMinute) return [];
  if (startMinute < endMinute) return [{ startMinute, endMinute, weight }];
  return [
    { startMinute, endMinute: 1440, weight },
    { startMinute: 0, endMinute, weight },
  ];
}

export function shortsSchedulePolicyForLanguage(lang: string | null | undefined): LanguageSchedulePolicy {
  return SHORTS_SCHEDULE_POLICIES[String(lang || "").trim().toLowerCase()] ?? DEFAULT_SHORTS_SCHEDULE_POLICY;
}

export function shortsScheduleWindowsForLanguage(
  lang: string | null | undefined,
  referenceDate = new Date(),
): ScheduleWindow[] {
  const policy = shortsSchedulePolicyForLanguage(lang);
  return policy.windows.flatMap((window) => {
    const start = scheduleTimeMinutes(window.start);
    const end = scheduleTimeMinutes(window.end);
    if (start == null || end == null) return [];
    return splitWindow(
      localMinuteToSystemMinute(start, policy.timeZone, referenceDate),
      localMinuteToSystemMinute(end, policy.timeZone, referenceDate),
      window.weight ?? 1,
    );
  });
}

function isMinuteInWindows(minute: number, windows: ScheduleWindow[]): boolean {
  return windows.some((window) => minute >= window.startMinute && minute < window.endMinute);
}

export function describeShortsSchedulePolicy(lang: string | null | undefined): string {
  const policy = shortsSchedulePolicyForLanguage(lang);
  const windows = policy.windows.map((window) => `${window.start}-${window.end}`).join(", ");
  const avoid = policy.avoidLocal.join(", ");
  return `${policy.lang.toUpperCase()} (${policy.audience}, ${policy.timeZone}): постить ${windows}; не постить ${avoid}`;
}

export function isSuperAdminScheduleTimeAllowed(time: string, channelLang?: string | null): boolean {
  const minutes = scheduleTimeMinutes(time);
  if (minutes == null) return false;
  if (channelLang) return isMinuteInWindows(minutes, shortsScheduleWindowsForLanguage(channelLang));
  return minutes >= SUPER_ADMIN_SCHEDULE_START_HOUR * 60;
}

export function forbiddenSuperAdminScheduleTimes(schedule: unknown, channelLang?: string | null): string[] {
  if (!Array.isArray(schedule)) return [];
  return schedule
    .map((time) => String(time || "").trim())
    .filter((time) => time && !isSuperAdminScheduleTimeAllowed(time, channelLang));
}

export function dailyScheduleLimitError(
  scheduleCount: number,
  otherSlots: number,
  isAdminOwner = true,
  isSuperAdminOwner = false,
  isMgsOwner = false,
): string | null {
  const perChannel = accountDailyScheduleCap(isAdminOwner, isMgsOwner);
  const perKey = googleKeyDailyScheduleCap(isSuperAdminOwner, isMgsOwner);
  if (scheduleCount > perChannel) {
    return `Максимум ${perChannel} видео в сутки на один канал.`;
  }
  if (otherSlots + scheduleCount > perKey) {
    return `Лимит ${perKey} публикаций в сутки на один Google-ключ (проект). На других каналах этого ключа уже ${otherSlots}, этому каналу доступно ${Math.max(0, perKey - otherSlots)}.`;
  }
  return null;
}

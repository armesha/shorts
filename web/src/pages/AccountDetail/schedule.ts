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

export const isSuperAdminScheduleTimeAllowed = (time: string): boolean => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  return toMin(time) >= SUPER_ADMIN_SCHEDULE_WINDOW.startMinute;
};

export const cleanSuperAdminScheduleTimes = (times: string[]): string[] =>
  times.filter(isSuperAdminScheduleTimeAllowed);

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

export const randomDayTimes = (
  n: number,
  avoid: Set<number> = new Set(),
  window = FULL_DAY_SCHEDULE_WINDOW,
): string[] => {
  if (n <= 0) return [];
  const windowMinutes = Math.max(1, window.endMinute - window.startMinute);
  const interval = windowMinutes / n;
  const phase = window.startMinute + Math.random() * interval; // per-channel random start within the first slot
  const jitter = Math.min(interval * 0.35, 20); // small → intervals stay roughly equal
  const used = new Set<number>();
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
  return mins
    .sort((a, b) => a - b)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
};

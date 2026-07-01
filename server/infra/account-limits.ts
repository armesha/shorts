// Per-channel daily video cap (= number of schedule slots on ONE channel). The ceiling follows the
// channel OWNER's role: admins keep the historical 20/day; every non-admin channel is capped at 18/day.
export const ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP = 20;
export const USER_ACCOUNT_DAILY_SCHEDULE_CAP = 18;

/** Back-compat alias (the admin ceiling) — kept for older callers/tests that referenced one constant. */
export const ACCOUNT_DAILY_SCHEDULE_CAP = ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP;

// Per Google key (Cloud project): total slots across ALL channels sharing that key — YouTube's upload
// quota is per project, not per channel. Super admin intentionally uses the full 100/day project quota;
// regular users keep the safer 92/day ceiling.
export const USER_DAILY_SCHEDULE_CAP = 92;
export const SUPER_ADMIN_DAILY_SCHEDULE_CAP = 100;

export const SUPER_ADMIN_SCHEDULE_START_HOUR = 8;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Per-channel daily slot ceiling for an owner of the given role. */
export function accountDailyScheduleCap(isAdminOwner: boolean): number {
  return isAdminOwner ? ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP : USER_ACCOUNT_DAILY_SCHEDULE_CAP;
}

export function googleKeyDailyScheduleCap(isSuperAdminOwner: boolean): number {
  return isSuperAdminOwner ? SUPER_ADMIN_DAILY_SCHEDULE_CAP : USER_DAILY_SCHEDULE_CAP;
}

export function scheduleTimeMinutes(time: string): number | null {
  const match = HHMM_RE.exec(String(time || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isSuperAdminScheduleTimeAllowed(time: string): boolean {
  const minutes = scheduleTimeMinutes(time);
  return minutes != null && minutes >= SUPER_ADMIN_SCHEDULE_START_HOUR * 60;
}

export function forbiddenSuperAdminScheduleTimes(schedule: unknown): string[] {
  if (!Array.isArray(schedule)) return [];
  return schedule
    .map((time) => String(time || "").trim())
    .filter((time) => time && !isSuperAdminScheduleTimeAllowed(time));
}

export function dailyScheduleLimitError(
  scheduleCount: number,
  otherSlots: number,
  isAdminOwner = true,
  isSuperAdminOwner = false,
): string | null {
  const perChannel = accountDailyScheduleCap(isAdminOwner);
  const perKey = googleKeyDailyScheduleCap(isSuperAdminOwner);
  if (scheduleCount > perChannel) {
    return `Максимум ${perChannel} видео в сутки на один канал.`;
  }
  if (otherSlots + scheduleCount > perKey) {
    return `Лимит ${perKey} публикаций в сутки на один Google-ключ (проект). На других каналах этого ключа уже ${otherSlots}, этому каналу доступно ${Math.max(0, perKey - otherSlots)}.`;
  }
  return null;
}

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

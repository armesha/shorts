// Per-channel daily video cap (= number of schedule slots on ONE channel). The ceiling follows the
// channel OWNER's role: admins keep the historical 20/day; every non-admin channel is capped at 18/day.
export const ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP = 20;
export const USER_ACCOUNT_DAILY_SCHEDULE_CAP = 18;

/** Back-compat alias (the admin ceiling) — kept for older callers/tests that referenced one constant. */
export const ACCOUNT_DAILY_SCHEDULE_CAP = ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP;

// Per Google key (Cloud project): total slots across ALL channels sharing that key — YouTube's upload
// quota is per project, not per channel. This one is role-agnostic.
export const USER_DAILY_SCHEDULE_CAP = 92;

/** Per-channel daily slot ceiling for an owner of the given role. */
export function accountDailyScheduleCap(isAdminOwner: boolean): number {
  return isAdminOwner ? ADMIN_ACCOUNT_DAILY_SCHEDULE_CAP : USER_ACCOUNT_DAILY_SCHEDULE_CAP;
}

export function dailyScheduleLimitError(scheduleCount: number, otherSlots: number, isAdminOwner = true): string | null {
  const perChannel = accountDailyScheduleCap(isAdminOwner);
  if (scheduleCount > perChannel) {
    return `Максимум ${perChannel} видео в сутки на один канал.`;
  }
  if (otherSlots + scheduleCount > USER_DAILY_SCHEDULE_CAP) {
    return `Лимит ${USER_DAILY_SCHEDULE_CAP} публикаций в сутки на один Google-ключ (проект). На других каналах этого ключа уже ${otherSlots}, этому каналу доступно ${Math.max(0, USER_DAILY_SCHEDULE_CAP - otherSlots)}.`;
  }
  return null;
}

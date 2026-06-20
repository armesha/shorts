export const ACCOUNT_DAILY_SCHEDULE_CAP = 20;
export const USER_DAILY_SCHEDULE_CAP = 92;

export function dailyScheduleLimitError(scheduleCount: number, otherSlots: number): string | null {
  if (scheduleCount > ACCOUNT_DAILY_SCHEDULE_CAP) {
    return `Максимум ${ACCOUNT_DAILY_SCHEDULE_CAP} видео в сутки на один канал.`;
  }
  if (otherSlots + scheduleCount > USER_DAILY_SCHEDULE_CAP) {
    return `Лимит ${USER_DAILY_SCHEDULE_CAP} публикаций в сутки на один Google-ключ (проект). На других каналах этого ключа уже ${otherSlots}, этому каналу доступно ${Math.max(0, USER_DAILY_SCHEDULE_CAP - otherSlots)}.`;
  }
  return null;
}

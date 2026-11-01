/** Calendar days, rather than 24-hour intervals, keep the quota stable over DST. */
export const CIRCLE_TIME_ZONE = "Europe/Moscow";
export const DAILY_CIRCLE_LIMIT = 2;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CIRCLE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: CIRCLE_TIME_ZONE, hour: "2-digit", hourCycle: "h23",
});

export function circleGenerationStarted(time: number): boolean {
  if (!Number.isFinite(time)) throw new Error("Invalid schedule time");
  const hour = Number(hourFormatter.format(new Date(time)));
  return hour >= 1 && hour < 18;
}

export function circleDay(time: number): string {
  if (!Number.isFinite(time)) throw new Error("Invalid schedule time");
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(time)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function circleGenerationDay(time: number): string {
  return circleDay(time);
}

export function circlePublicationSlot(time: number): 0 | 1 | null {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: CIRCLE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(time));
  const hour = Number(parts.find(part => part.type === "hour")?.value);
  const minute = Number(parts.find(part => part.type === "minute")?.value);
  return minute <= 4 ? hour === 10 ? 0 : hour === 18 ? 1 : null : null;
}

export type CircleScheduleEntry = {
  day: string;
  slot: 0 | 1 | 2;
  state: "queued" | "running" | "ready" | "failed";
};

/** Reserve a unique slot for today's work. Persist the mutation before starting work. */
export function claimCircleSlot(entries: CircleScheduleEntry[], now: number): CircleScheduleEntry | null {
  const day = circleGenerationDay(now);
  const todays = entries.filter(entry => entry.day === day);
  if (todays.some(entry => entry.state === "queued" || entry.state === "running")) return null;
  for (const slot of [0, 1] as const) {
    const existing = todays.find(entry => entry.slot === slot);
    if (existing?.state === "failed") {
      existing.state = "queued";
      return existing;
    }
    if (!existing) {
      const entry: CircleScheduleEntry = { day, slot, state: "queued" };
      entries.push(entry);
      return entry;
    }
  }
  return null;
}

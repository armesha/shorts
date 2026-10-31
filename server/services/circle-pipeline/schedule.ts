/** Calendar days, rather than 24-hour intervals, keep the quota stable over DST. */
export const CIRCLE_TIME_ZONE = "Europe/Prague";
export const DAILY_CIRCLE_LIMIT = 2;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CIRCLE_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
});

export function circleDay(time: number): string {
  if (!Number.isFinite(time)) throw new Error("Invalid schedule time");
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(time)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export type CircleScheduleEntry = {
  day: string;
  slot: 0 | 1;
  state: "queued" | "running" | "ready" | "failed";
};

/** Reserve a unique slot for today's work. Persist the mutation before starting work. */
export function claimCircleSlot(entries: CircleScheduleEntry[], now: number): CircleScheduleEntry | null {
  const day = circleDay(now);
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

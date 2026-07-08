export const DEFAULT_ACCOUNT_TIMEZONE = "Europe/Prague";

export function normalizeTimeZone(raw: unknown): string {
  const timeZone = String(raw ?? "").trim();
  if (!timeZone) return DEFAULT_ACCOUNT_TIMEZONE;
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone || DEFAULT_ACCOUNT_TIMEZONE;
  } catch {
    return DEFAULT_ACCOUNT_TIMEZONE;
  }
}

export function timePartsInTimeZone(date: Date, rawTimeZone: unknown): { day: string; hhmm: string; timeZone: string } {
  const timeZone = normalizeTimeZone(rawTimeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour").padStart(2, "0");
  const minute = get("minute").padStart(2, "0");
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    hhmm: `${hour}:${minute}`,
    timeZone,
  };
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function localDateTimeToUtc(ymd: string, hhmm: string, rawTimeZone: unknown): Date | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return null;
  const timeZone = normalizeTimeZone(rawTimeZone);
  const [year, month, day] = ymd.split("-").map((part) => Number(part));
  const [hour, minute] = hhmm.split(":").map((part) => Number(part));
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const targetLocalMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(targetLocalMs);
  for (let i = 0; i < 3; i += 1) {
    const parts = timePartsInTimeZone(candidate, timeZone);
    const [py, pm, pd] = parts.day.split("-").map((part) => Number(part));
    const [ph, pmin] = parts.hhmm.split(":").map((part) => Number(part));
    const actualLocalMs = Date.UTC(py, pm - 1, pd, ph, pmin, 0, 0);
    const delta = targetLocalMs - actualLocalMs;
    if (delta === 0) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }
  return candidate;
}

export function nextLocalTimeAt(hhmm: string, rawTimeZone: unknown, now = new Date()): string | null {
  const current = timePartsInTimeZone(now, rawTimeZone);
  for (let offset = 0; offset <= 2; offset += 1) {
    const ymd = addDaysToYmd(current.day, offset);
    const candidate = localDateTimeToUtc(ymd, hhmm, current.timeZone);
    if (candidate && candidate > now) return candidate.toISOString();
  }
  return null;
}

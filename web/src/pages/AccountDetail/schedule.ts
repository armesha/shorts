// Pure scheduling helpers + slot-cap constants for the channel page.
// No component state here — these are functions of their inputs only.

// N posts/day spread ~evenly across 24h, but with a small RANDOM per-channel offset + jitter,
// so two channels with the same N never all fire at the same minute. `avoid` = minutes already
// used elsewhere (the user's other channels) — collisions are nudged forward a minute.
export const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Per-channel daily slot cap follows the channel OWNER's role: admins keep 20/day, every non-admin 18/day.
// (Backend mirror: server/infra/account-limits.ts — it's the authoritative enforcement.)
export const ADMIN_ACCOUNT_DAILY_SLOT_CAP = 20;
export const USER_ACCOUNT_DAILY_SLOT_CAP = 18;
export const accountDailySlotCap = (ownerIsAdmin: boolean): number =>
  ownerIsAdmin ? ADMIN_ACCOUNT_DAILY_SLOT_CAP : USER_ACCOUNT_DAILY_SLOT_CAP;
export const USER_DAILY_SLOT_CAP = 92;

export const randomDayTimes = (n: number, avoid: Set<number> = new Set()): string[] => {
  if (n <= 0) return [];
  const interval = 1440 / n;
  const phase = Math.random() * interval; // per-channel random start within the first slot
  const jitter = Math.min(interval * 0.35, 20); // small → intervals stay roughly equal
  const used = new Set<number>();
  const mins: number[] = [];
  for (let i = 0; i < n; i++) {
    let m = Math.round(phase + i * interval + (Math.random() * 2 - 1) * jitter);
    m = ((m % 1440) + 1440) % 1440;
    let guard = 0;
    while ((used.has(m) || avoid.has(m)) && guard++ < 120) m = (m + 1) % 1440;
    used.add(m);
    mins.push(m);
  }
  return mins
    .sort((a, b) => a - b)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
};

export const RATE_LIMIT_MESSAGE = "Слишком много генераций, подождите немного.";

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  ok: boolean;
  retryAfterMs?: number;
}

interface WindowCounter {
  startedAt: number;
  count: number;
}

const windows = new Map<string, WindowCounter>();
const active = new Map<string, number>();
let cleanupTick = 0;

export class RateLimitError extends Error {
  statusCode = 429;
  retryAfterMs: number;

  constructor(message = RATE_LIMIT_MESSAGE, retryAfterMs = 1_000) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function cleanupExpired(now: number): void {
  cleanupTick++;
  if (cleanupTick % 200 !== 0) return;
  for (const [key, counter] of windows) {
    if (now - counter.startedAt >= 60 * 60 * 1000) windows.delete(key);
  }
}

export function checkRateLimit(key: string, rule: RateLimitRule, now = Date.now()): RateLimitDecision {
  cleanupExpired(now);
  if (!Number.isFinite(rule.limit) || rule.limit <= 0) return { ok: true };
  let counter = windows.get(key);
  if (!counter || now - counter.startedAt >= rule.windowMs) {
    counter = { startedAt: now, count: 0 };
    windows.set(key, counter);
  }
  if (counter.count >= rule.limit) {
    return { ok: false, retryAfterMs: Math.max(1_000, counter.startedAt + rule.windowMs - now) };
  }
  counter.count++;
  return { ok: true };
}

export function heavyActiveKey(userId: number, isAdmin: boolean, _route: string): string {
  return isAdmin ? "admin:heavy" : `user:${userId}:heavy`;
}

export async function withActiveLimit<T>(key: string, maxActive: number, fn: () => Promise<T>): Promise<T> {
  if (!Number.isFinite(maxActive) || maxActive <= 0) return fn();
  const current = active.get(key) ?? 0;
  if (current >= maxActive) throw new RateLimitError();
  active.set(key, current + 1);
  try {
    return await fn();
  } finally {
    const next = Math.max(0, (active.get(key) ?? 1) - 1);
    if (next) active.set(key, next);
    else active.delete(key);
  }
}

export function activeLimitCount(key: string): number {
  return active.get(key) ?? 0;
}

export function clearRateLimitStateForTest(): void {
  windows.clear();
  active.clear();
  cleanupTick = 0;
}

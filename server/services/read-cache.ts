type CacheEntry<T> = {
  expiresAt: number;
  version: number;
  value: T;
};

let version = 0;
const cache = new Map<string, CacheEntry<unknown>>();

export function invalidateReadCache(): void {
  version++;
  if (version > Number.MAX_SAFE_INTEGER - 1000) version = 1;
}

export function cachedRead<T>(key: string, ttlMs: number, build: () => T): T {
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.version === version && entry.expiresAt > now) return entry.value;
  const value = build();
  cache.set(key, { value, version, expiresAt: now + Math.max(0, ttlMs) });
  return value;
}

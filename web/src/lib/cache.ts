export interface CachedValue<T> {
  value: T;
  savedAt: string;
}

export function readCache<T>(key: string): CachedValue<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedValue<T>;
    if (!parsed || typeof parsed.savedAt !== "string" || !("value" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ value, savedAt: new Date().toISOString() }));
  } catch {
    /* Storage can be unavailable in private mode or when quota is exceeded. */
  }
}

export function fmtCacheTime(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

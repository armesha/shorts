export function readCreatorUsage(key: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([id, value]): [string, number] => [id, Number(value)])
        .filter(([, value]) => Number.isFinite(value) && value > 0),
    );
  } catch {
    return {};
  }
}

export function bumpCreatorUsage(key: string, current: Record<string, number>, id: string): Record<string, number> {
  const next = { ...current, [id]: (current[id] ?? 0) + 1 };
  const trimmed = Object.fromEntries(
    Object.entries(next)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80),
  );
  try {
    window.localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    /* local usage history is optional */
  }
  return trimmed;
}

const SETTINGS_MIN_RUNWAY_DAYS = "readiness.minRunwayDays";

export const DEFAULT_READINESS_MIN_RUNWAY_DAYS = 2.5;
export const HARD_MIN_READINESS_RUNWAY_DAYS = 0.5;
export const HARD_MAX_READINESS_RUNWAY_DAYS = 30;

export interface ReadinessLimits {
  minRunwayDays: number;
}

export interface ReadinessSettingsStore {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
}

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

export function getReadinessLimits(store: Pick<ReadinessSettingsStore, "getSetting">): ReadinessLimits {
  return {
    minRunwayDays: clampNumber(
      store.getSetting(SETTINGS_MIN_RUNWAY_DAYS),
      DEFAULT_READINESS_MIN_RUNWAY_DAYS,
      HARD_MIN_READINESS_RUNWAY_DAYS,
      HARD_MAX_READINESS_RUNWAY_DAYS,
    ),
  };
}

export function setReadinessLimits(
  store: ReadinessSettingsStore,
  input: Partial<ReadinessLimits>,
): ReadinessLimits {
  const minRunwayDays = clampNumber(
    input.minRunwayDays,
    DEFAULT_READINESS_MIN_RUNWAY_DAYS,
    HARD_MIN_READINESS_RUNWAY_DAYS,
    HARD_MAX_READINESS_RUNWAY_DAYS,
  );
  store.setSetting(SETTINGS_MIN_RUNWAY_DAYS, String(minRunwayDays));
  return { minRunwayDays };
}

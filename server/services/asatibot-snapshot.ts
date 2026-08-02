import { constants } from "node:fs";
import { open } from "node:fs/promises";

// This is intentionally a fixed, host-local hand-off file. Shorts never opens the
// AsatiBot database, Telegram session, or its environment files.
export const ASATIBOT_SNAPSHOT_PATH = "/var/lib/asatibot/shareboard-signals.json";
export const MAX_ASATIBOT_SNAPSHOT_BYTES = 128 * 1024;
export const MAX_ASATIBOT_SNAPSHOT_AGE_MS = 90_000;

const MAX_POSITIONS = 50;
const MAX_RECENT_SIGNALS = 20;
const MAX_CONTRACTS_PER_SIGNAL = 5;
const MAX_MONEY_USD = 1_000_000_000_000_000;
const MAX_COUNT = 1_000_000;
const MAX_INITIAL_BANKROLL_USD = 1_000_000;
const MAX_DAILY_AI_LIMIT_USD = 50;
const MAX_MONTHLY_AI_LIMIT_USD = 1_000;
const MAX_OPEN_POSITIONS = 100;

export const ASATIBOT_SETTING_KEYS = [
  "initialBankrollUsd",
  "lowConfidencePercent",
  "defaultPositionPercent",
  "maxPositionPercent",
  "maxTotalExposurePercent",
  "maxOpenPositions",
  "dailyAiLimitUsd",
  "monthlyAiLimitUsd",
] as const;

export type AsatibotSettings = {
  initialBankrollUsd: number;
  lowConfidencePercent: number;
  defaultPositionPercent: number;
  maxPositionPercent: number;
  maxTotalExposurePercent: number;
  maxOpenPositions: number;
  dailyAiLimitUsd: number;
  monthlyAiLimitUsd: number;
};

export type AsatibotHealthState = "running" | "starting" | "stopped" | "failed" | "unknown";
export type AsatibotControlStatus = "idle" | "applied" | "invalid" | "unavailable";

export type AsatibotSnapshot = {
  version: 1;
  generatedAt: string;
  lastMessageAt?: string;
  settings: AsatibotSettings;
  health: {
    state: AsatibotHealthState;
    restartCount: number;
    lastExitCode?: number;
  };
  controlStatus: AsatibotControlStatus;
  summary: {
    signalCount: number;
    paperPositionCount: number;
    totalNotionalUsd: number;
    totalPnlUsd: number;
    portfolioValueUsd?: number;
    todayAiSpendUsd: number;
    monthAiSpendUsd: number;
    dailyAiLimitUsd: number;
    monthlyAiLimitUsd: number;
  };
  positions: Array<{
    contract: string;
    chain: string | null;
    status: string;
    openedAt: string | null;
    detectedAt: string | null;
    notionalUsd: number;
    riskPercent: number | null;
    entryPriceUsd: number | null;
    currentPriceUsd: number | null;
    multiple: number | null;
    pnlUsd: number | null;
    updatedAt: string | null;
  }>;
  recentSignals: Array<{
    detectedAt: string | null;
    status: string;
    chain: string | null;
    contracts: string[];
    classification: string | null;
    confidence: number | null;
  }>;
};

export type AsatibotSnapshotResponse =
  | { available: true; snapshot: AsatibotSnapshot }
  | { available: false; reason: "stale" | "unavailable" };

export function unavailableAsatibotSnapshot(reason: "stale" | "unavailable" = "unavailable"): AsatibotSnapshotResponse {
  return { available: false, reason };
}

/** Reads only the production hand-off file; no caller can select another path. */
export async function readAsatibotSnapshot(): Promise<AsatibotSnapshotResponse> {
  return readAsatibotSnapshotFile(ASATIBOT_SNAPSHOT_PATH);
}

/** Exported for focused tests; production code must use readAsatibotSnapshot(). */
export async function readAsatibotSnapshotFile(path: string): Promise<AsatibotSnapshotResponse> {
  try {
    // O_NOFOLLOW prevents a writable bot directory from redirecting this read to an arbitrary
    // host file. The post-open stat is deliberately performed on the same file descriptor.
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = await file.stat();
      if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_ASATIBOT_SNAPSHOT_BYTES) {
        return unavailableAsatibotSnapshot();
      }
      if (Date.now() - metadata.mtimeMs > MAX_ASATIBOT_SNAPSHOT_AGE_MS) return unavailableAsatibotSnapshot("stale");
      const raw = await file.readFile();
      if (raw.byteLength > MAX_ASATIBOT_SNAPSHOT_BYTES) return unavailableAsatibotSnapshot();
      return parseAsatibotSnapshotJson(raw.toString("utf8"));
    } finally {
      await file.close();
    }
  } catch {
    // Deliberately do not expose file-system or bot errors through Shareboard.
    return unavailableAsatibotSnapshot();
  }
}

export function parseAsatibotSnapshotJson(raw: string): AsatibotSnapshotResponse {
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    const snapshot = sanitizeSnapshot(parsed);
    return snapshot ? { available: true, snapshot } : unavailableAsatibotSnapshot();
  } catch {
    return unavailableAsatibotSnapshot();
  }
}

/** Strict body parser for the privileged settings-write endpoint. */
export function parseAsatibotSettingsRequest(value: unknown): AsatibotSettings | null {
  return sanitizeSettings(value, true);
}

function sanitizeSnapshot(value: unknown): AsatibotSnapshot | null {
  if (!isRecord(value) || value.version !== 1) return null;
  const generatedAt = safeTimestamp(value.generatedAt);
  const settings = sanitizeSettings(value.settings, false);
  const health = sanitizeHealth(value.health);
  const controlStatus = sanitizeControlStatus(value.controlStatus);
  const summary = sanitizeSummary(value.summary);
  if (!generatedAt || !settings || !health || !controlStatus || !summary || !Array.isArray(value.positions) || !Array.isArray(value.recentSignals)) return null;

  const lastMessageAt = optionalTimestamp(value.lastMessageAt);
  const positions = sanitizeList(value.positions, MAX_POSITIONS, sanitizePosition);
  const recentSignals = sanitizeList(value.recentSignals, MAX_RECENT_SIGNALS, sanitizeRecentSignal);
  if (!positions || !recentSignals) return null;

  return {
    version: 1,
    generatedAt,
    ...(lastMessageAt ? { lastMessageAt } : {}),
    settings,
    health,
    controlStatus,
    summary,
    positions,
    recentSignals,
  };
}

function sanitizeSettings(value: unknown, rejectUnknownKeys: boolean): AsatibotSettings | null {
  if (!isRecord(value)) return null;
  if (rejectUnknownKeys) {
    const keys = Object.keys(value);
    if (keys.length !== ASATIBOT_SETTING_KEYS.length || keys.some((key) => !ASATIBOT_SETTING_KEYS.includes(key as (typeof ASATIBOT_SETTING_KEYS)[number]))) {
      return null;
    }
  }
  const initialBankrollUsd = safeNumber(value.initialBankrollUsd, 1, MAX_INITIAL_BANKROLL_USD);
  const lowConfidencePercent = safeNumber(value.lowConfidencePercent, 0, 100);
  const defaultPositionPercent = safeNumber(value.defaultPositionPercent, 0, 100);
  const maxPositionPercent = safeNumber(value.maxPositionPercent, 0, 100);
  const maxTotalExposurePercent = safeNumber(value.maxTotalExposurePercent, 0, 100);
  const maxOpenPositions = safeInteger(value.maxOpenPositions, 1, MAX_OPEN_POSITIONS);
  const dailyAiLimitUsd = safeNumber(value.dailyAiLimitUsd, 0, MAX_DAILY_AI_LIMIT_USD);
  const monthlyAiLimitUsd = safeNumber(value.monthlyAiLimitUsd, 0, MAX_MONTHLY_AI_LIMIT_USD);
  if (
    initialBankrollUsd == null ||
    lowConfidencePercent == null ||
    defaultPositionPercent == null ||
    maxPositionPercent == null ||
    maxTotalExposurePercent == null ||
    maxOpenPositions == null ||
    dailyAiLimitUsd == null ||
    monthlyAiLimitUsd == null ||
    lowConfidencePercent > maxPositionPercent ||
    defaultPositionPercent > maxPositionPercent ||
    maxPositionPercent > maxTotalExposurePercent ||
    dailyAiLimitUsd > monthlyAiLimitUsd
  ) {
    return null;
  }
  return {
    initialBankrollUsd,
    lowConfidencePercent,
    defaultPositionPercent,
    maxPositionPercent,
    maxTotalExposurePercent,
    maxOpenPositions,
    dailyAiLimitUsd,
    monthlyAiLimitUsd,
  };
}

function sanitizeHealth(value: unknown): AsatibotSnapshot["health"] | null {
  if (!isRecord(value)) return null;
  const state = safeHealthState(value.state);
  const restartCount = safeInteger(value.restartCount, 0, MAX_COUNT);
  if (!state || restartCount == null) return null;
  const lastExitCode = optionalInteger(value.lastExitCode, 0, 255);
  return {
    state,
    restartCount,
    ...(lastExitCode != null ? { lastExitCode } : {}),
  };
}

function safeHealthState(value: unknown): AsatibotHealthState | null {
  return value === "running" || value === "starting" || value === "stopped" || value === "failed" || value === "unknown" ? value : null;
}

function sanitizeControlStatus(value: unknown): AsatibotControlStatus | null {
  return value === "idle" || value === "applied" || value === "invalid" || value === "unavailable" ? value : null;
}

function sanitizeSummary(value: unknown): AsatibotSnapshot["summary"] | null {
  if (!isRecord(value)) return null;
  const signalCount = safeCount(value.signalCount);
  const paperPositionCount = safeCount(value.paperPositionCount);
  const totalNotionalUsd = safeUsd(value.totalNotionalUsd, false);
  const totalPnlUsd = safeUsd(value.totalPnlUsd, true);
  const todayAiSpendUsd = safeUsd(value.todayAiSpendUsd, false);
  const monthAiSpendUsd = safeUsd(value.monthAiSpendUsd, false);
  const dailyAiLimitUsd = safeUsd(value.dailyAiLimitUsd, false);
  const monthlyAiLimitUsd = safeUsd(value.monthlyAiLimitUsd, false);
  if (
    signalCount == null ||
    paperPositionCount == null ||
    totalNotionalUsd == null ||
    totalPnlUsd == null ||
    todayAiSpendUsd == null ||
    monthAiSpendUsd == null ||
    dailyAiLimitUsd == null ||
    monthlyAiLimitUsd == null
  ) {
    return null;
  }
  const portfolioValueUsd = optionalUsd(value.portfolioValueUsd, false);
  return {
    signalCount,
    paperPositionCount,
    totalNotionalUsd,
    totalPnlUsd,
    ...(portfolioValueUsd != null ? { portfolioValueUsd } : {}),
    todayAiSpendUsd,
    monthAiSpendUsd,
    dailyAiLimitUsd,
    monthlyAiLimitUsd,
  };
}

function sanitizePosition(value: unknown): AsatibotSnapshot["positions"][number] | null {
  if (!isRecord(value)) return null;
  const contract = safeContract(value.contract);
  const chain = safeCode(value.chain, 48);
  const status = safeCode(value.status, 48);
  const openedAt = safeTimestamp(value.openedAt);
  const detectedAt = safeTimestamp(value.detectedAt);
  const notionalUsd = safeUsd(value.notionalUsd, false);
  const multiple = safeNumber(value.multiple, 0, MAX_MONEY_USD);
  const pnlUsd = safeUsd(value.pnlUsd, true);
  const updatedAt = safeTimestamp(value.updatedAt);
  if (!contract || !status || notionalUsd == null) {
    return null;
  }
  const riskPercent = safeNumber(value.riskPercent, 0, 100);
  const entryPriceUsd = safeUsd(value.entryPriceUsd, false);
  const currentPriceUsd = safeUsd(value.currentPriceUsd, false);
  return {
    contract,
    chain,
    status,
    openedAt,
    detectedAt,
    notionalUsd,
    riskPercent,
    entryPriceUsd,
    currentPriceUsd,
    multiple,
    pnlUsd,
    updatedAt,
  };
}

function sanitizeRecentSignal(value: unknown): AsatibotSnapshot["recentSignals"][number] | null {
  if (!isRecord(value)) return null;
  const detectedAt = safeTimestamp(value.detectedAt);
  const status = safeCode(value.status, 48);
  const chain = safeCode(value.chain, 48);
  const rawContracts = Array.isArray(value.contracts) ? value.contracts.slice(0, MAX_CONTRACTS_PER_SIGNAL) : [];
  const contracts = [...new Set(rawContracts.flatMap((contract) => {
    const clean = safeContract(contract);
    return clean ? [clean] : [];
  }))];
  if (!status) return null;
  const classification = safeCode(value.classification, 64);
  const confidence = safeNumber(value.confidence, 0, 100);
  return {
    detectedAt,
    status,
    chain,
    contracts,
    classification,
    confidence,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeList<T>(items: unknown[], maxItems: number, sanitize: (item: unknown) => T | null): T[] | null {
  if (items.length > maxItems) return null;
  const clean: T[] = [];
  for (const item of items) {
    const value = sanitize(item);
    if (value) clean.push(value);
  }
  return clean;
}

function safeTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 40) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function optionalTimestamp(value: unknown): string | undefined {
  if (value == null) return undefined;
  return safeTimestamp(value) ?? undefined;
}

function safeContract(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= 160 && /^[A-Za-z0-9][A-Za-z0-9._:@/$+-]*$/.test(text) ? text : null;
}

function safeCode(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength && /^[A-Za-z0-9][A-Za-z0-9._:@/$+-]*$/.test(text) ? text : null;
}

function safeCount(value: unknown): number | null {
  return safeInteger(value, 0, MAX_COUNT);
}

function safeInteger(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function safeUsd(value: unknown, signed: boolean): number | null {
  return safeNumber(value, signed ? -MAX_MONEY_USD : 0, MAX_MONEY_USD);
}

function optionalUsd(value: unknown, signed: boolean): number | undefined {
  if (value == null) return undefined;
  return safeUsd(value, signed) ?? undefined;
}

function safeNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function optionalInteger(value: unknown, min: number, max: number): number | undefined {
  if (value == null) return undefined;
  return safeInteger(value, min, max) ?? undefined;
}

import { constants } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { parseAsatibotSettingsRequest, type AsatibotSettings } from "./asatibot-snapshot.ts";

// Separate, fixed control hand-off. It must be writable by Shorts and readable by the
// AsatiBot exporter, but never contain Telegram credentials or API keys.
export const ASATIBOT_CONTROL_DIRECTORY = "/var/lib/asatibot-control";
export const ASATIBOT_CONTROL_REQUEST_PATH = "/var/lib/asatibot-control/request.json";
export const MAX_ASATIBOT_CONTROL_REQUEST_BYTES = 4 * 1024;

export type AsatibotControlRequest = {
  version: 1;
  requestedAt: string;
  settings: AsatibotSettings;
};

let writeTail: Promise<void> = Promise.resolve();

/** Queues one idempotent desired-settings request at the fixed production path. */
export function writeAsatibotControlRequest(settings: AsatibotSettings): Promise<boolean> {
  return enqueueWrite(() => writeControlRequestInDirectory(ASATIBOT_CONTROL_DIRECTORY, settings));
}

/** Exported for focused tests; production code must use writeAsatibotControlRequest(). */
export function writeAsatibotControlRequestInDirectoryForTest(directory: string, settings: AsatibotSettings): Promise<boolean> {
  return enqueueWrite(() => writeControlRequestInDirectory(directory, settings));
}

function enqueueWrite(write: () => Promise<boolean>): Promise<boolean> {
  const result = writeTail.then(write, write);
  writeTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function writeControlRequestInDirectory(directory: string, input: AsatibotSettings): Promise<boolean> {
  // Re-validate even for internal callers, then construct a fresh object instead of serializing
  // arbitrary input. The file is an idempotent desired state, not a command/RPC channel.
  const settings = parseAsatibotSettingsRequest(input);
  if (!settings) return false;
  const request: AsatibotControlRequest = {
    version: 1,
    requestedAt: new Date().toISOString(),
    settings: {
      initialBankrollUsd: settings.initialBankrollUsd,
      lowConfidencePercent: settings.lowConfidencePercent,
      defaultPositionPercent: settings.defaultPositionPercent,
      maxPositionPercent: settings.maxPositionPercent,
      maxTotalExposurePercent: settings.maxTotalExposurePercent,
      maxOpenPositions: settings.maxOpenPositions,
      dailyAiLimitUsd: settings.dailyAiLimitUsd,
      monthlyAiLimitUsd: settings.monthlyAiLimitUsd,
    },
  };
  const body = Buffer.from(`${JSON.stringify(request)}\n`, "utf8");
  if (body.byteLength > MAX_ASATIBOT_CONTROL_REQUEST_BYTES) return false;

  let directoryHandle: Awaited<ReturnType<typeof open>> | null = null;
  let temporaryHandle: Awaited<ReturnType<typeof open>> | null = null;
  let temporaryPath: string | null = null;
  try {
    directoryHandle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    if (!(await directoryHandle.stat()).isDirectory()) return false;

    temporaryPath = join(directory, `.request-${process.pid}-${randomUUID()}.tmp`);
    temporaryHandle = await open(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o640,
    );
    // The service umask can only remove group-read here, so restore the exact hand-off mode.
    await temporaryHandle.chmod(0o640);
    await temporaryHandle.writeFile(body);
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = null;

    // Rename inside the same directory is atomic. It replaces a pre-existing link rather than
    // following it, so an attacker cannot redirect writes through request.json.
    await rename(temporaryPath, join(directory, "request.json"));
    temporaryPath = null;
    try {
      await directoryHandle.sync();
    } catch {
      // Directory fsync is unavailable on some filesystems; the already-fsynced request is valid.
    }
    return true;
  } catch {
    return false;
  } finally {
    if (temporaryHandle) {
      try {
        await temporaryHandle.close();
      } catch {
        // Best-effort cleanup only.
      }
    }
    if (temporaryPath) {
      try {
        await unlink(temporaryPath);
      } catch {
        // Best-effort cleanup only.
      }
    }
    if (directoryHandle) {
      try {
        await directoryHandle.close();
      } catch {
        // Best-effort cleanup only.
      }
    }
  }
}

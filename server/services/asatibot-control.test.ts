import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ASATIBOT_CONTROL_REQUEST_PATH,
  writeAsatibotControlRequestInDirectoryForTest,
} from "./asatibot-control.ts";
import type { AsatibotSettings } from "./asatibot-snapshot.ts";

const SETTINGS: AsatibotSettings = {
  initialBankrollUsd: 100,
  lowConfidencePercent: 5,
  defaultPositionPercent: 5,
  maxPositionPercent: 10,
  maxTotalExposurePercent: 30,
  maxOpenPositions: 5,
  dailyAiLimitUsd: 3,
  monthlyAiLimitUsd: 50,
};

test("AsatiBot control writer atomically writes only the v1 desired-settings envelope", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asatibot-control-"));
  const requestPath = join(directory, "request.json");
  try {
    assert.equal(await writeAsatibotControlRequestInDirectoryForTest(directory, SETTINGS), true);
    const request = JSON.parse(readFileSync(requestPath, "utf8")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(request).sort(), ["requestedAt", "settings", "version"]);
    assert.equal(request.version, 1);
    assert.match(String(request.requestedAt), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(request.settings, SETTINGS);
    assert.deepEqual(Object.keys(request.settings as Record<string, unknown>).sort(), Object.keys(SETTINGS).sort());
    assert.equal(readFileSync(requestPath, "utf8").includes("telegramSession"), false);
    assert.equal(statSync(requestPath).mode & 0o777, 0o640);
    assert.deepEqual(readdirSync(directory).filter((name) => name.endsWith(".tmp")), []);

    const newer = { ...SETTINGS, dailyAiLimitUsd: 4 };
    const [first, second] = await Promise.all([
      writeAsatibotControlRequestInDirectoryForTest(directory, SETTINGS),
      writeAsatibotControlRequestInDirectoryForTest(directory, newer),
    ]);
    assert.equal(first, true);
    assert.equal(second, true);
    const finalRequest = JSON.parse(readFileSync(requestPath, "utf8")) as { settings: AsatibotSettings };
    assert.deepEqual(finalRequest.settings, newer);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("AsatiBot control writer rejects invalid settings and unsafe directories without writing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asatibot-control-"));
  const linkedDirectory = `${directory}-link`;
  try {
    const unknown = { ...SETTINGS, path: "/etc/passwd" } as unknown as AsatibotSettings;
    assert.equal(await writeAsatibotControlRequestInDirectoryForTest(directory, unknown), false);
    assert.equal(readdirSync(directory).length, 0);

    const badBudget = { ...SETTINGS, dailyAiLimitUsd: 51 };
    assert.equal(await writeAsatibotControlRequestInDirectoryForTest(directory, badBudget), false);
    assert.equal(readdirSync(directory).length, 0);

    symlinkSync(directory, linkedDirectory);
    assert.equal(await writeAsatibotControlRequestInDirectoryForTest(linkedDirectory, SETTINGS), false);
    assert.equal(ASATIBOT_CONTROL_REQUEST_PATH, "/var/lib/asatibot-control/request.json");
  } finally {
    rmSync(linkedDirectory, { recursive: true, force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});

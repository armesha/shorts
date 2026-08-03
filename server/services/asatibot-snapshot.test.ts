import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ASATIBOT_SNAPSHOT_PATH,
  MAX_ASATIBOT_SNAPSHOT_AGE_MS,
  MAX_ASATIBOT_SNAPSHOT_BYTES,
  readAsatibotSnapshotFile,
} from "./asatibot-snapshot.ts";

function validSnapshot() {
  return {
    version: 1,
    generatedAt: "2026-08-02T03:36:04.000Z",
    lastMessageAt: "2026-08-02T03:35:00+00:00",
    settings: {
      initialBankrollUsd: 100,
      lowConfidencePercent: 5,
      defaultPositionPercent: 5,
      maxPositionPercent: 10,
      maxTotalExposurePercent: 30,
      maxOpenPositions: 5,
      dailyAiLimitUsd: 3,
      monthlyAiLimitUsd: 50,
    },
    health: { state: "running", restartCount: 2, lastExitCode: 0 },
    controlStatus: "applied",
    summary: {
      signalCount: 2,
      paperPositionCount: 1,
      openPositionCount: 1,
      blockedRiskCount: 0,
      totalNotionalUsd: 125.5,
      totalPnlUsd: -3.25,
      portfolioValueUsd: 996.75,
      todayAiSpendUsd: 0.12,
      monthAiSpendUsd: 2.4,
      dailyAiLimitUsd: 3,
      monthlyAiLimitUsd: 50,
    },
    positions: [
      {
        contract: "0xA1b2c3D4",
        chain: "ethereum",
        status: "open",
        openedAt: "2026-08-02T03:10:00Z",
        detectedAt: "2026-08-02T03:05:00Z",
        notionalUsd: 125.5,
        riskPercent: 2,
        entryPriceUsd: 1.25,
        currentPriceUsd: 1.21,
        multiple: 0.968,
        pnlUsd: -3.25,
        updatedAt: "2026-08-02T03:36:00Z",
      },
    ],
    recentSignals: [
      {
        detectedAt: "2026-08-02T03:05:00Z",
        status: "paper_open",
        chain: "ethereum",
        contracts: ["0xA1b2c3D4", "0xA1b2c3D4"],
        classification: "new_signal",
        confidence: 0.87,
      },
    ],
    recentAudit: {
      generatedAt: "2026-08-03T08:00:00Z",
      reviewModel: "gpt-5.6-sol",
      periodStart: "2026-07-31T08:00:00Z",
      periodEnd: "2026-08-03T08:00:00Z",
      periodDays: 3,
      signalCount: 38,
      threadCount: 8,
      needsReviewBefore: 5,
      needsReviewAfter: 2,
      correctedCount: 3,
      blockedBefore: 3,
      blockedAfter: 1,
      lifecycleUpdates: 1,
      aiCostUsd: 0.004,
      items: [
        {
          contract: "0xA1b2c3D4",
          chain: "ethereum",
          positionStatus: "open",
          riskManagement: "5% виртуального банка",
          takeProfits: [{ target: "2x", status: "hit" }],
          stopLoss: "Стоп перенесён в безубыток",
          principalRemoval: "Тело забрано на 2x",
          lifecycleState: "body_out",
          brief: "Тело выведено, остаток позиции сопровождается.",
          correctionAction: "auto_corrected",
          correctionReason: "Подтверждено двумя проверками.",
          confidence: 0.94,
          lastEventAt: "2026-08-03T07:30:00Z",
        },
      ],
    },
  };
}

test("AsatiBot snapshot v1 returns only the approved whitelist", async () => {
  const dir = mkdtempSync(join(tmpdir(), "asatibot-snapshot-"));
  const file = join(dir, "shareboard-signals.json");
  try {
    const raw = validSnapshot() as Record<string, unknown>;
    raw.source = "private telegram channel";
    raw.chat = { id: 123, title: "Private chat" };
    raw.message = "confidential message";
    raw.sender = "private_sender";
    raw.text = "do not expose";
    raw.raw = { response: "private LLM output" };
    raw.error = "private stack";
    raw.keys = { openRouter: "paid-secret" };
    (raw.positions as Array<Record<string, unknown>>)[0]!.telegramSession = "session-secret";
    (raw.recentSignals as Array<Record<string, unknown>>)[0]!.sourceText = "private source text";
    (raw.recentAudit as { items: Array<Record<string, unknown>> }).items[0]!.rawMessage = "private audit source text";
    (raw.recentAudit as Record<string, unknown>).apiKey = "private audit key";

    writeFileSync(file, JSON.stringify(raw));
    const response = await readAsatibotSnapshotFile(file);
    assert.equal(response.available, true);
    if (!response.available) assert.fail("valid snapshot must be available");

    assert.deepEqual(response.snapshot, {
      version: 1,
      generatedAt: "2026-08-02T03:36:04.000Z",
      lastMessageAt: "2026-08-02T03:35:00.000Z",
      settings: validSnapshot().settings,
      health: { state: "running", restartCount: 2, lastExitCode: 0 },
      controlStatus: "applied",
      summary: validSnapshot().summary,
      positions: [
        {
          contract: "0xA1b2c3D4",
          chain: "ethereum",
          status: "open",
          openedAt: "2026-08-02T03:10:00.000Z",
          detectedAt: "2026-08-02T03:05:00.000Z",
          notionalUsd: 125.5,
          riskPercent: 2,
          entryPriceUsd: 1.25,
          currentPriceUsd: 1.21,
          multiple: 0.968,
          pnlUsd: -3.25,
          updatedAt: "2026-08-02T03:36:00.000Z",
        },
      ],
      recentSignals: [
        {
          detectedAt: "2026-08-02T03:05:00.000Z",
          status: "paper_open",
          chain: "ethereum",
          contracts: ["0xA1b2c3D4"],
          classification: "new_signal",
          confidence: 0.87,
        },
      ],
      recentAudit: {
        ...validSnapshot().recentAudit,
        generatedAt: "2026-08-03T08:00:00.000Z",
        periodStart: "2026-07-31T08:00:00.000Z",
        periodEnd: "2026-08-03T08:00:00.000Z",
        items: [
          {
            ...validSnapshot().recentAudit.items[0],
            lastEventAt: "2026-08-03T07:30:00.000Z",
          },
        ],
      },
    });

    const publicBody = JSON.stringify(response);
    for (const privateValue of ["private telegram channel", "confidential message", "paid-secret", "session-secret", "private source text", "private audit source text", "private audit key"]) {
      assert.equal(publicBody.includes(privateValue), false);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AsatiBot snapshot keeps unpriced rows truthful and drops only malformed individual entries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "asatibot-snapshot-"));
  const file = join(dir, "shareboard-signals.json");
  try {
    const raw = validSnapshot() as Record<string, unknown>;
    (raw.positions as unknown[]).push(
      {
        contract: "0xUnpriced",
        status: "watching",
        notionalUsd: 0,
        chain: null,
        openedAt: null,
        detectedAt: null,
        riskPercent: null,
        entryPriceUsd: null,
        currentPriceUsd: null,
        multiple: null,
        pnlUsd: null,
        updatedAt: null,
      },
      { contract: "0xMalformed", notionalUsd: 1 },
    );
    (raw.recentSignals as unknown[]).push(
      { status: "observed", chain: null, contracts: null, detectedAt: null, classification: null, confidence: null },
      { chain: "ethereum", contracts: ["0xMalformed"] },
    );
    writeFileSync(file, JSON.stringify(raw));

    const response = await readAsatibotSnapshotFile(file);
    assert.equal(response.available, true);
    if (!response.available) assert.fail("partial rows must not make the whole snapshot unavailable");
    assert.deepEqual(response.snapshot.positions[1], {
      contract: "0xUnpriced",
      chain: null,
      status: "watching",
      openedAt: null,
      detectedAt: null,
      notionalUsd: 0,
      riskPercent: null,
      entryPriceUsd: null,
      currentPriceUsd: null,
      multiple: null,
      pnlUsd: null,
      updatedAt: null,
    });
    assert.equal(response.snapshot.positions.length, 2);
    assert.deepEqual(response.snapshot.recentSignals[1], {
      detectedAt: null,
      status: "observed",
      chain: null,
      contracts: [],
      classification: null,
      confidence: null,
    });
    assert.equal(response.snapshot.recentSignals.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("AsatiBot snapshot reader fails closed for missing, malformed, invalid, and oversized files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "asatibot-snapshot-"));
  const file = join(dir, "shareboard-signals.json");
  try {
    assert.deepEqual(await readAsatibotSnapshotFile(file), { available: false, reason: "unavailable" });

    writeFileSync(file, "{not json");
    assert.deepEqual(await readAsatibotSnapshotFile(file), { available: false, reason: "unavailable" });

    const invalidVersion = validSnapshot();
    invalidVersion.version = 2;
    writeFileSync(file, JSON.stringify(invalidVersion));
    assert.deepEqual(await readAsatibotSnapshotFile(file), { available: false, reason: "unavailable" });

    const invalidHealth = validSnapshot();
    invalidHealth.health.state = "private_failure";
    writeFileSync(file, JSON.stringify(invalidHealth));
    assert.deepEqual(await readAsatibotSnapshotFile(file), { available: false, reason: "unavailable" });

    const invalidControl = validSnapshot();
    invalidControl.controlStatus = "queued";
    writeFileSync(file, JSON.stringify(invalidControl));
    assert.deepEqual(await readAsatibotSnapshotFile(file), { available: false, reason: "unavailable" });

    writeFileSync(file, "x".repeat(MAX_ASATIBOT_SNAPSHOT_BYTES + 1));
    assert.deepEqual(await readAsatibotSnapshotFile(file), { available: false, reason: "unavailable" });

    const directory = join(dir, "not-a-file");
    mkdirSync(directory);
    assert.deepEqual(await readAsatibotSnapshotFile(directory), { available: false, reason: "unavailable" });

    const target = join(dir, "target.json");
    const symlink = join(dir, "snapshot-link.json");
    writeFileSync(target, JSON.stringify(validSnapshot()));
    symlinkSync(target, symlink);
    assert.deepEqual(await readAsatibotSnapshotFile(symlink), { available: false, reason: "unavailable" });

    writeFileSync(file, JSON.stringify(validSnapshot()));
    const staleAt = new Date(Date.now() - MAX_ASATIBOT_SNAPSHOT_AGE_MS - 1_000);
    utimesSync(file, staleAt, staleAt);
    assert.deepEqual(await readAsatibotSnapshotFile(file), { available: false, reason: "stale" });

    assert.equal(ASATIBOT_SNAPSHOT_PATH, "/var/lib/asatibot/shareboard-signals.json");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

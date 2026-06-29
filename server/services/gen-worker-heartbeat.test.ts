import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicGenWorkerStatus,
  readGenWorkerHeartbeat,
  writeGenWorkerHeartbeat,
  type GenWorkerHeartbeat,
} from "./gen-worker-heartbeat.ts";

function settingsStore() {
  const values = new Map<string, string>();
  return {
    getSetting: (key: string) => values.get(key) ?? null,
    setSetting: (key: string, value: string) => values.set(key, value),
  };
}

test("generation worker heartbeat reports fresh external worker online", () => {
  const store = settingsStore();
  const heartbeat: GenWorkerHeartbeat = {
    version: 1,
    pid: 123,
    startedAt: 1_000,
    beatAt: 10_000,
    queueRunning: true,
    stopping: false,
    pollMs: 1500,
  };
  writeGenWorkerHeartbeat(store, heartbeat);

  assert.deepEqual(readGenWorkerHeartbeat(store), heartbeat);
  assert.deepEqual(publicGenWorkerStatus(store, { mode: "external", now: 12_000, staleMs: 5_000 }), {
    mode: "external",
    online: true,
    stale: false,
    ageMs: 2_000,
    heartbeat,
  });
});

test("generation worker heartbeat treats stale or stopping external worker as offline", () => {
  const store = settingsStore();
  writeGenWorkerHeartbeat(store, {
    version: 1,
    pid: 123,
    startedAt: 1_000,
    beatAt: 10_000,
    queueRunning: false,
    stopping: true,
    pollMs: 1500,
  });

  const stopping = publicGenWorkerStatus(store, { mode: "external", now: 11_000, staleMs: 5_000 });
  assert.equal(stopping.online, false);
  assert.equal(stopping.stale, false);

  const stale = publicGenWorkerStatus(store, { mode: "external", now: 20_001, staleMs: 5_000 });
  assert.equal(stale.online, false);
  assert.equal(stale.stale, true);
  assert.equal(stale.ageMs, 10_001);
});

test("embedded generation worker mode is online without heartbeat", () => {
  assert.deepEqual(publicGenWorkerStatus(settingsStore(), { mode: "embedded" }), {
    mode: "embedded",
    online: true,
    stale: false,
    ageMs: null,
    heartbeat: null,
  });
});

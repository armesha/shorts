import test from "node:test";
import assert from "node:assert/strict";
import { gracefulShutdown } from "./shutdown.ts";

test("waits for in-flight work to drain, then closes server then db (correct order)", async () => {
  const events: string[] = [];
  let activePolls = 2; // report 'render busy' for 2 polls, then idle
  const r = await gracefulShutdown(
    {
      log: () => {},
      stopScheduler: () => events.push("stopScheduler"),
      drainQueue: () => events.push("drainQueue"),
      activeCounts: () => {
        const busy = activePolls > 0;
        if (busy) activePolls--;
        return { render: busy ? 1 : 0, upload: 0 };
      },
      closeServer: async () => {
        events.push("closeServer");
      },
      closeDb: () => events.push("closeDb"),
    },
    { pollMs: 5, timeoutMs: 2000 },
  );

  assert.equal(r.drained, true, "should drain on its own");
  // intake is stopped (scheduler + queue) BEFORE we close anything
  assert.deepEqual(events.slice(0, 2).sort(), ["drainQueue", "stopScheduler"]);
  // server closes BEFORE db, and both come last
  assert.deepEqual(events.slice(-2), ["closeServer", "closeDb"]);
});

test("forces a clean close after the timeout if work never drains", async () => {
  const events: string[] = [];
  const r = await gracefulShutdown(
    {
      log: () => {},
      stopScheduler: () => {},
      drainQueue: () => {},
      activeCounts: () => ({ render: 1, upload: 0 }), // never clears
      closeServer: async () => {
        events.push("closeServer");
      },
      closeDb: () => events.push("closeDb"),
    },
    { pollMs: 5, timeoutMs: 40 },
  );

  assert.equal(r.drained, false, "reports it did NOT drain in time");
  assert.ok(r.waitedMs >= 35, `waited ~the timeout before forcing (${r.waitedMs}ms)`);
  assert.deepEqual(events, ["closeServer", "closeDb"], "still closes cleanly after timeout");
});

test("closes immediately when already idle", async () => {
  const r = await gracefulShutdown(
    {
      log: () => {},
      stopScheduler: () => {},
      drainQueue: () => {},
      activeCounts: () => ({ render: 0, upload: 0 }),
      closeServer: async () => {},
      closeDb: () => {},
    },
    { pollMs: 50, timeoutMs: 1000 },
  );
  assert.equal(r.drained, true);
  assert.ok(r.waitedMs < 50, `idle shutdown should be near-instant (${r.waitedMs}ms)`);
});

test("also waits on in-flight UPLOADS (not just renders)", async () => {
  let uploadPolls = 3;
  const order: string[] = [];
  const r = await gracefulShutdown(
    {
      log: () => {},
      stopScheduler: () => {},
      drainQueue: () => {},
      activeCounts: () => {
        const busy = uploadPolls > 0;
        if (busy) uploadPolls--;
        return { render: 0, upload: busy ? 1 : 0 };
      },
      closeServer: async () => {
        order.push("close");
      },
      closeDb: () => {},
    },
    { pollMs: 5, timeoutMs: 2000 },
  );
  assert.equal(r.drained, true);
  assert.equal(uploadPolls, 0, "waited until the upload finished");
  assert.deepEqual(order, ["close"]);
});

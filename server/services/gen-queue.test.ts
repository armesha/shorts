import test from "node:test";
import assert from "node:assert/strict";
import { createGenQueue } from "./gen-queue.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("processes all videos ONE AT A TIME (never concurrent)", async () => {
  const q = createGenQueue();
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  q.initWorker(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await sleep(5);
    active--;
    calls++;
    return "made";
  });
  const job = q.enqueue(1, 1, 4);
  for (let i = 0; i < 200 && q.jobStatus(job.id)!.state !== "done"; i++) await sleep(5);
  const st = q.jobStatus(job.id)!;
  assert.equal(st.state, "done");
  assert.equal(st.done, 4);
  assert.equal(calls, 4);
  assert.equal(maxActive, 1, "must never run more than ONE video at a time");
});

test("drain: finishes the in-flight video, starts no new ones, leaves job unfinished", async () => {
  const q = createGenQueue();
  let calls = 0;
  q.initWorker(async () => {
    calls++;
    await sleep(40);
    return "made";
  });
  const job = q.enqueue(1, 1, 5);
  await sleep(10); // let video #1 start (in flight)
  q.drain(); // request graceful drain mid-flight
  await sleep(140); // let the in-flight video finish + pump settle
  const st = q.jobStatus(job.id)!;
  assert.equal(calls, 1, "only the in-flight video should have run");
  assert.equal(st.done, 1, "the one in-flight video is still saved");
  assert.ok(st.state !== "done", `interrupted job must not be 'done' (was ${st.state})`);
  assert.equal(q.isRunning(), false, "pump must be idle after drain");
});

test("drain BEFORE any work starts → queue stays idle (nothing runs)", async () => {
  const q = createGenQueue();
  let calls = 0;
  q.initWorker(async () => {
    calls++;
    return "made";
  });
  q.drain();
  q.enqueue(1, 1, 3);
  await sleep(50);
  assert.equal(calls, 0, "a draining queue must not start work");
});

test("FIFO: second job waits behind the first (position + ahead)", async () => {
  const q = createGenQueue();
  q.initWorker(async () => {
    await sleep(20);
    return "made";
  });
  q.enqueue(1, 1, 3); // job A: 3 videos
  const b = q.enqueue(2, 2, 2); // job B: waits
  await sleep(5);
  const sb = q.jobStatus(b.id)!;
  assert.equal(sb.position, 1, "second job is behind the first");
  assert.ok(sb.ahead >= 1, "reports videos ahead before its turn");
  q.drain(); // let the test exit promptly
});

test("counts unfinished videos per user across running and queued jobs", async () => {
  const q = createGenQueue();
  q.initWorker(async () => {
    await sleep(40);
    return "made";
  });
  q.enqueue(1, 1, 3);
  q.enqueue(1, 2, 4);
  q.enqueue(2, 3, 5);
  await sleep(5);
  assert.equal(q.queuedRemainingForUser(1), 7);
  assert.equal(q.queuedRemainingForUser(2), 5);
  q.drain();
});

test("queuedRemainingForOwnerDecks: counts per OWNER and only overlapping deck-sets", async () => {
  const q = createGenQueue();
  q.initWorker(async () => {
    await sleep(40);
    return "made";
  });
  // enqueue(userId, accountId, total, ownerUserId, deckIds)
  q.enqueue(1, 1, 3, 10, ["ru"]); // owner 10, ru
  q.enqueue(1, 2, 4, 10, ["de"]); // owner 10, de
  q.enqueue(2, 3, 5, 20, ["ru"]); // owner 20, ru
  q.enqueue(1, 4, 2, 10, undefined); // owner 10, deck-set unknown → shares any pool
  await sleep(5); // first is running (done=0), rest queued — all remaining = their totals
  // ru pool of owner 10 = ru job (3) + unknown-deck job (2); the de job draws a disjoint pool.
  assert.equal(q.queuedRemainingForOwnerDecks(10, ["ru"]), 5);
  assert.equal(q.queuedRemainingForOwnerDecks(10, ["de"]), 6); // de job (4) + unknown job (2)
  assert.equal(q.queuedRemainingForOwnerDecks(20, ["ru"]), 5); // only owner 20's ru job
  assert.equal(q.queuedRemainingForOwnerDecks(20, ["de"]), 0); // owner 20 has no de/unknown job → disjoint
  assert.equal(q.queuedRemainingForOwnerDecks(99, ["ru"]), 0); // unknown owner
  q.drain();
});

test("queuedRemainingForAccount: sums unfinished videos per CHANNEL across its jobs", async () => {
  const q = createGenQueue();
  q.initWorker(async () => {
    await sleep(40);
    return "made";
  });
  // The "top up to N days re-clicked" shape: two batches piled onto the SAME channel (account 1) plus
  // an unrelated channel (account 2). The helper must see BOTH batches of channel 1 as still-in-flight,
  // which is exactly what stops the top-up planner from stacking a third batch on top.
  q.enqueue(1, 1, 3);
  q.enqueue(1, 1, 4);
  q.enqueue(1, 2, 5);
  await sleep(5); // first job running (done=0), rest queued — all remaining = their totals
  assert.equal(q.queuedRemainingForAccount(1), 7, "both batches for channel 1 (3 + 4)");
  assert.equal(q.queuedRemainingForAccount(2), 5);
  assert.equal(q.queuedRemainingForAccount(99), 0, "unknown channel → 0");
  q.drain();
});

test("exhausted: worker reporting 'exhausted' stops the job softly", async () => {
  const q = createGenQueue();
  let calls = 0;
  q.initWorker(async () => {
    calls++;
    return calls >= 2 ? "exhausted" : "made"; // 1 made, then deck runs out
  });
  const job = q.enqueue(1, 1, 10);
  for (let i = 0; i < 200 && q.jobStatus(job.id)!.position !== -1; i++) await sleep(5);
  const st = q.jobStatus(job.id)!;
  assert.equal(st.state, "exhausted");
  assert.equal(st.done, 1, "only the cards that existed were made");
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DailyCuttingService, pragueDay } from "./daily-cutting.ts";
import { VideoCuttingService } from "./video-cutting.ts";

test("daily schedule alternates selection, excludes repeats and survives restart", async () => {
  const base = resolve("tmp/daily-cutting-tests");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "run-"));
  let now = new Date("2026-10-29T12:00:00Z");
  const videos = [
    { id: "aaaaaaaaaaa", views: 10, duration: 600 },
    { id: "bbbbbbbbbbb", views: 100, duration: 600 },
    { id: "ccccccccccc", views: 50, duration: 600 },
  ];
  const cutting = new VideoCuttingService({ root: resolve(root, "jobs"), outputDir: root, execute: async () => {} });
  const create = cutting.create.bind(cutting);
  const selectedBanners: unknown[] = [];
  cutting.create = async (owner, input, daily) => {
    const data = input as { bannerId?: unknown };
    selectedBanners.push(data.bannerId);
    return create(owner, { ...(input as object), bannerId: null }, daily);
  };
  const options = { file: resolve(root, "state.json"), now: () => now, fetch: async () => videos, bannerId: () => "active-banner" };
  let daily = new DailyCuttingService(cutting, options);
  const awaitJobs = async (count: number) => {
    for (let i = 0; i < 100; i++) {
      const jobs = await cutting.dailyJobs(7);
      if (jobs.length === count && jobs.every(j => j.status === "completed")) return jobs;
      await delay(10);
    }
    throw new Error("Daily job did not complete");
  };
  try {
    await daily.start(); await daily.enable(7);
    let jobs = await awaitJobs(1);
    assert.match(jobs[0].input.url, /bbbbbbbbbbb/);
    await daily.tick(); assert.equal((await cutting.dailyJobs(7)).length, 1);
    daily.close(); daily = new DailyCuttingService(cutting, options); await daily.start();
    await delay(30); assert.equal((await cutting.dailyJobs(7)).length, 1);
    now = new Date("2026-10-30T12:00:00Z");
    await daily.tick(); jobs = await awaitJobs(2);
    assert.ok(jobs.some(j => j.input.url.includes("aaaaaaaaaaa")));
    await daily.tick(); assert.equal((await cutting.dailyJobs(7)).length, 2);
    await daily.runNow(7, "https://youtu.be/ccccccccccc");
    jobs = await awaitJobs(3);
    assert.ok(jobs.some(j => j.input.url.includes("ccccccccccc")));
    assert.deepEqual(selectedBanners, ["active-banner", "active-banner", "active-banner"]);
    await assert.rejects(daily.runNow(7, "https://youtu.be/ccccccccccc"), /уже выбиралось/);
    assert.equal(pragueDay(new Date("2026-10-30T23:30:00Z")), "2026-10-31");
  } finally { daily.close(); await cutting.close(); await rm(root, { recursive: true, force: true }); }
});

test("a corrupt schedule cannot be overwritten or restarted", async () => {
  const base = resolve("tmp/daily-cutting-tests"); await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "broken-"));
  const file = resolve(root, "state.json"); await writeFile(file, "invalid");
  const cutting = new VideoCuttingService({ root: resolve(root, "jobs"), outputDir: root, execute: async () => {} });
  const daily = new DailyCuttingService(cutting, { file, fetch: async () => { throw new Error("must not fetch"); } });
  try {
    await assert.rejects(daily.start());
    await assert.rejects(daily.enable(7));
    assert.equal(await readFile(file, "utf8"), "invalid");
    assert.match((await daily.info(7)).error || "", /истори/);
  } finally { daily.close(); await cutting.close(); await rm(root, { recursive: true, force: true }); }
});

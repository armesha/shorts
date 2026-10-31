import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MapPipelineService, type PipelineOptions } from "./service.ts";
import { DAY_MS, CAMPAIGN_DAYS } from "./schedule.ts";
import { withGlobalRenderSlot } from "../../infra/rate-limits.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "map-service-"));
  let now = Date.UTC(2026, 9, 29, 12);
  let calls = 0;
  const options: PipelineOptions = { root: join(root, "state"), source: root, now: () => now,
    generate: async (job, directory) => {
      calls++;
      await writeFile(join(directory, "video.mp4"), "synthetic-media");
      await writeFile(join(directory, "poster.jpg"), "synthetic-poster");
      return { seconds: 90, idea: { themeId: `metric-${job.id}`, title: "Тест", hook: "Тест", reason: "Проверка" } };
    } };
  return { root, options, advance: (days: number) => { now += days * DAY_MS; }, calls: () => calls };
}

test("two samples remain separate from the configured daily slots, including after restart", async () => {
  const f = await fixture();
  let service = new MapPipelineService(f.options);
  try {
    await Promise.all([service.samples(1), service.samples(1)]);
    assert.equal((await service.list(1)).jobs.length, 2);
    for (let i = 0; i < 2; i++) { await service.tick(); await service.idle(); }
    await service.begin(1);
    const end = (await service.list(1)).campaign!.endsAt;
    for (let day = 0; day < CAMPAIGN_DAYS; day++) {
      await service.tick(); await service.idle();
      await service.tick(); await service.idle();
      if (day === 15) {
        await service.close(); service = new MapPipelineService(f.options);
        await service.begin(1);
        assert.equal((await service.list(1)).campaign!.endsAt, end);
      }
      f.advance(1);
    }
    await service.tick(); await service.idle();
    const list = await service.list(1);
    assert.equal(list.jobs.filter(j => j.kind === "daily").length, CAMPAIGN_DAYS);
    assert.equal(list.jobs.filter(j => j.status === "ready").length, CAMPAIGN_DAYS + 2);
    assert.equal(f.calls(), CAMPAIGN_DAYS + 2);
    assert.equal((await service.list(2)).jobs.length, 0);
    const job = list.jobs[0];
    assert.equal(await service.file(2, job.id, "video.mp4"), null);
    assert.ok(await service.file(1, job.id, "video.mp4"));
  } finally { await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("explicit stop cannot be undone by repeated start and does not delete the library", async () => {
  const f = await fixture(); const service = new MapPipelineService(f.options);
  try {
    await service.begin(1); await service.tick(); await service.idle();
    await service.stop(1); f.advance(1); await service.begin(1); await service.tick(); await service.idle();
    assert.equal(f.calls(), 1);
    assert.equal((await service.list(1)).jobs[0].status, "ready");
  } finally { await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("rebuilding old videos keeps their original files if generation fails", async () => {
  const f = await fixture(); const service = new MapPipelineService(f.options);
  try {
    await service.samples(1);
    for (let i = 0; i < 2; i++) { await service.tick(); await service.idle(); }
    const old = (await service.list(1)).jobs[0];
    f.options.generate = async () => { throw new Error("Render failed"); };
    await service.rebuildOld(1); await service.tick(); await service.idle();
    assert.ok(await readFile(join(service.directory(old), "video.mp4"), "utf8"));
  } finally { await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("legacy thirty-day schedule can be shortened by date without extending or resetting it", async () => {
  const f = await fixture(); let service = new MapPipelineService(f.options);
  try {
    await service.begin(1); await service.tick(); await service.idle(); await service.close();
    const file = join(f.options.root!, "state.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    state.campaigns[1].endsAt = new Date(Date.parse(state.campaigns[1].startedAt) + 30 * DAY_MS).toISOString();
    await writeFile(file, JSON.stringify(state));
    service = new MapPipelineService(f.options);
    const original = (await service.list(1)).campaign!;
    await service.shortenDeadline(1, "2026-11-19T23:00:00.000Z");
    await service.begin(1);
    const result = await service.list(1);
    assert.equal(result.campaign!.startedAt, original.startedAt);
    assert.equal(result.campaign!.endsAt, "2026-11-19T23:00:00.000Z");
    assert.equal(result.jobs[0].status, "ready");
    await assert.rejects(service.shortenDeadline(1, original.endsAt));
    f.advance(21); await service.tick(); await service.idle();
    assert.equal(f.calls(), 2);
    f.advance(1); await service.tick(); await service.idle();
    assert.equal(f.calls(), 2);
  } finally { await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("an interrupted slot is not rerun, while corrupt storage blocks all work", async () => {
  const f = await fixture(); let service = new MapPipelineService(f.options);
  try {
    await service.begin(1); await service.tick(); await service.idle(); await service.close();
    const file = join(f.options.root!, "state.json");
    const state = JSON.parse(await readFile(file, "utf8"));
    state.jobs[0].status = "running"; state.campaigns[1].runs[0].state = "running";
    await writeFile(file, JSON.stringify(state));
    service = new MapPipelineService(f.options);
    await service.tick(); await service.idle();
    assert.equal((await service.list(1)).jobs[0].status, "failed");
    assert.equal(f.calls(), 1); await service.close();
    await writeFile(file, "corrupt");
    service = new MapPipelineService(f.options);
    await assert.rejects(service.tick());
    assert.equal(f.calls(), 1);
  } finally { await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("a render finishing at the deadline is withheld and cannot create a thirty-first slot", async () => {
  const f = await fixture();
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const working = new Promise<void>(accept => { entered = accept; });
  const finish = new Promise<void>(accept => { release = accept; });
  const service = new MapPipelineService({ ...f.options, generate: async () => {
    entered(); await finish;
    return { seconds: 90, idea: { themeId: "life", title: "Тест", hook: "Тест", reason: "Тест" } };
  } });
  try {
    await service.begin(1); await service.tick(); await working;
    f.advance(30); release(); await service.idle();
    const job = (await service.list(1)).jobs[0];
    assert.equal(job.status, "failed");
    assert.equal(await service.file(1, job.id, "video.mp4"), null);
    await service.tick(); await service.idle();
    assert.equal((await service.list(1)).jobs.length, 1);
  } finally { release(); await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("rebuilding samples reuses two entries and has a bounded attempt count", async () => {
  const f = await fixture(); const service = new MapPipelineService(f.options);
  try {
    await service.samples(1);
    const ids = (await service.list(1)).jobs.map(j => j.id).sort();
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await service.samples(1, true);
      for (let i = 0; i < 2; i++) { await service.tick(); await service.idle(); }
    }
    await service.samples(1, true); await service.tick(); await service.idle();
    assert.deepEqual((await service.list(1)).jobs.map(j => j.id).sort(), ids);
    assert.equal(f.calls(), 6);
  } finally { await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("busy render capacity waits within the same daily slot instead of losing the day's video", async () => {
  const f = await fixture();
  let release: () => void = () => {};
  let observed: () => void = () => {};
  const busy = new Promise<void>(accept => { release = accept; });
  const waiting = new Promise<void>(accept => { observed = accept; });
  const occupied = [withGlobalRenderSlot(() => busy), withGlobalRenderSlot(() => busy)];
  const service = new MapPipelineService({ ...f.options, log: message => { if (message.includes("Ожидание")) observed(); } });
  try {
    await service.begin(1); await service.tick(); await waiting;
    assert.equal(f.calls(), 0); release(); await Promise.all(occupied); await service.idle();
    const result = await service.list(1);
    assert.equal(f.calls(), 1); assert.equal(result.jobs.length, 1); assert.equal(result.jobs[0].status, "ready");
    assert.equal(result.campaign!.runs.length, 1);
  } finally { release(); await Promise.all(occupied); await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("published videos receive one replacement without losing publication history", async () => {
  const f = await fixture(); const service = new MapPipelineService(f.options);
  try {
    await service.samples(1); await service.tick(); await service.idle();
    const old = (await service.list(1)).jobs.find(j => j.status === "ready")!;
    await service.notePublication(1, old.id, { state: "published", url: "https://www.tiktok.com/@test/video/123" });
    await service.rebuildOld(1); await service.rebuildOld(1);
    const jobs = (await service.list(1)).jobs;
    assert.equal(jobs.filter(j => j.replacementFor === old.id).length, 1);
    assert.equal(jobs.find(j => j.id === old.id)?.status, "published");
    assert.equal(jobs.find(j => j.replacementFor === old.id)?.themeId, old.themeId);
  } finally { await service.close(); await rm(f.root, { recursive: true, force: true }); }
});

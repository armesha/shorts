import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planMapIdea, validateIdea } from "./planner.ts";

const sources = [{ id: "life", name: "Продолжительность жизни" }];
const idea = { themeId: "life", title: "Где живут дольше?", hook: "Сравним продолжительность жизни по странам.", reason: "Понятное сравнение" };
test("map planning reuses restricted subscription CLI and checks its structured response", async () => {
  const dir = await mkdtemp(join(tmpdir(), "map-plan-"));
  try {
    const result = await planMapIdea(dir, sources, [], { run: async (_bin, args, options) => {
      assert.ok(args.includes("read-only"));
      assert.ok(args.includes("shell_tool"));
      assert.ok(args.includes("multi_agent"));
      assert.ok(options.stdin?.includes(sources[0].name));
      await writeFile(join(dir, "plan-result.json"), JSON.stringify(idea));
      return "";
    } });
    assert.deepEqual(result, idea);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("unknown sources, repeat topics and unsafe text are rejected", () => {
  assert.throws(() => validateIdea(idea, sources, ["life"]));
  assert.throws(() => validateIdea({ ...idea, themeId: "invented" }, sources, []));
  assert.throws(() => validateIdea({ ...idea, title: "<script>" }, sources, []));
});

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  ensureCircleWorkspace,
  readCircleConfig,
  writeCircleConfig,
} from "./circle-workspace.ts";

test("circle workspace bootstraps a usable config and runtime directories", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "shorts-circle-workspace-"));
  const previous = process.env.TG_CIRCLES_DIR;
  process.env.TG_CIRCLES_DIR = root;
  try {
    assert.equal(ensureCircleWorkspace(), root);
    for (const relative of ["banner", "downloads", "gameplay", "output", ".runtime"]) {
      assert.equal(existsSync(resolve(root, relative)), true, relative);
    }

    const config = readCircleConfig();
    assert.equal(config.templateId, "default");
    assert.equal(config.templateName, "Telegram-кружочки");
    assert.deepEqual((config.video as { banner?: unknown }).banner, {
      enabled: false,
      advertiserId: "",
      file: "",
      transparent: true,
      left: 90,
      top: 830,
      width: 900,
      height: 260,
      startSeconds: 0,
      repeatEverySeconds: 0,
    });

    config.templateName = "Мой шаблон";
    await writeCircleConfig(config);
    assert.equal(JSON.parse(readFileSync(resolve(root, "config.json"), "utf8")).templateName, "Мой шаблон");
  } finally {
    if (previous === undefined) delete process.env.TG_CIRCLES_DIR;
    else process.env.TG_CIRCLES_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import {
  listCircleGameplays,
  resolveCircleGameplay,
} from "./circle-gameplay-library.ts";

test("circle gameplay library combines uploaded and registered project videos", () => {
  const root = mkdtempSync(resolve(tmpdir(), "shorts-circle-gameplay-"));
  const workspace = resolve(root, "workspace");
  const repository = resolve(root, "repository");
  const uploaded = resolve(workspace, "gameplay", "uploaded.mp4");
  const shared = resolve(repository, "assets/fact-videos/voiced-memes-ru/sources/orbital-one.mp4");
  const outside = resolve(repository, "assets/fact-videos/outside.mp4");
  const registry = resolve(repository, "data/voiced-memes-ru/gameplay-sources.json");

  try {
    mkdirSync(resolve(workspace, "gameplay"), { recursive: true });
    mkdirSync(resolve(repository, "assets/fact-videos/voiced-memes-ru/sources"), { recursive: true });
    mkdirSync(resolve(repository, "assets/fact-videos"), { recursive: true });
    mkdirSync(resolve(repository, "data/voiced-memes-ru"), { recursive: true });
    writeFileSync(uploaded, "uploaded");
    writeFileSync(shared, "shared");
    writeFileSync(outside, "outside");
    writeFileSync(registry, JSON.stringify({
      sources: [
        { file: "assets/fact-videos/voiced-memes-ru/sources/orbital-one.mp4" },
        { file: "assets/fact-videos/outside.mp4" },
      ],
    }));

    assert.deepEqual(listCircleGameplays(workspace, repository), ["orbital-one.mp4", "uploaded.mp4"]);
    assert.equal(resolveCircleGameplay("uploaded.mp4", workspace, repository), uploaded);
    assert.equal(resolveCircleGameplay("orbital-one.mp4", workspace, repository), shared);
    assert.equal(resolveCircleGameplay("outside.mp4", workspace, repository), null);
    assert.equal(resolveCircleGameplay("../orbital-one.mp4", workspace, repository), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

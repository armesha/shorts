#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const packId = "voiced-memes-ru";
const ids = new Set(
  JSON.parse(readFileSync(resolve(root, "output/speech/memoteka-267-batch/manifest.json"), "utf8"))
    .map((item) => String(item.id)),
);
const paths = {
  rendered: resolve(root, "tmp/memoteka-267-videos"),
  work: resolve(root, "tmp/memoteka-267-video-work"),
  runtime: resolve(root, `assets/fact-videos/${packId}`),
  demos: resolve(root, "data/output/admin-demos"),
  videos: resolve(root, `data/${packId}/videos.json`),
  manifest: resolve(root, "data/output/admin-demos/manifest.json"),
};
let removed = 0;

for (const id of ids) {
  const batchId = `vmru_batch_${id}`;
  for (const path of [
    resolve(paths.rendered, `${id}.mp4`),
    resolve(paths.runtime, `${batchId}.mp4`),
    resolve(paths.demos, `${batchId}.mp4`),
    resolve(paths.demos, `${batchId}.jpg`),
  ]) {
    if (existsSync(path)) {
      rmSync(path, { force: true });
      removed += 1;
    }
  }
}

for (const path of [
  resolve(paths.rendered, "progress.json"),
  resolve(paths.rendered, "gameplay-history.json"),
  resolve(paths.rendered, "gameplay-source-history.json"),
  resolve(paths.rendered, "avatar-style-history.json"),
]) {
  rmSync(path, { force: true });
}

if (existsSync(paths.work)) {
  for (const name of readdirSync(paths.work)) {
    if (/^(frames-|avatar-|base-)/.test(name)) rmSync(resolve(paths.work, name), { recursive: true, force: true });
  }
}

if (existsSync(paths.videos)) {
  const videos = JSON.parse(readFileSync(paths.videos, "utf8"));
  writeJsonAtomic(paths.videos, videos.filter((entry) => !/^voiced-memes-ru\/vmru_batch_/.test(String(entry.file || ""))));
}
if (existsSync(paths.manifest)) {
  const manifest = JSON.parse(readFileSync(paths.manifest, "utf8"));
  const pack = (manifest.packs || []).find((entry) => entry.id === packId);
  if (pack) pack.items = (pack.items || []).filter((entry) => !/^vmru_batch_/.test(String(entry.id || "")));
  writeJsonAtomic(paths.manifest, manifest);
}

writeJsonAtomic(resolve(paths.rendered, "progress.json"), { completed: [], failed: [], resetAt: new Date().toISOString() });
console.log(JSON.stringify({ resetItems: ids.size, removedFiles: removed }, null, 2));

function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

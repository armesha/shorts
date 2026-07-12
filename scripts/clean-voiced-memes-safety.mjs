#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const cwd = process.cwd();
const safety = readJson(resolve(cwd, "data/voiced-memes-ru/safety-review.json"));
const rejected = new Set(Object.keys(safety.reject || {}));
const quarantined = new Set(Object.keys(safety.borderline || {}));
const blocked = new Set([...rejected, ...quarantined]);
const removed = [];

for (const id of blocked) {
  const itemId = `vmru_batch_${id}`;
  for (const path of [
    resolve(cwd, `tmp/memoteka-267-videos/${id}.mp4`),
    resolve(cwd, `assets/fact-videos/voiced-memes-ru/${itemId}.mp4`),
    resolve(cwd, `data/output/admin-demos/${itemId}.mp4`),
    resolve(cwd, `data/output/admin-demos/${itemId}.jpg`),
  ]) {
    if (!existsSync(path)) continue;
    rmSync(path, { force: true });
    removed.push(path);
  }
}

for (const id of rejected) {
  const wav = resolve(cwd, `output/speech/memoteka-267-batch/wav/${id}.wav`);
  if (existsSync(wav)) {
    rmSync(wav, { force: true });
    removed.push(wav);
  }
}

const progressPath = resolve(cwd, "tmp/memoteka-267-videos/progress.json");
if (existsSync(progressPath)) {
  const progress = readJson(progressPath);
  progress.completed = (progress.completed || []).filter((id) => !blocked.has(String(id)));
  progress.failed = (progress.failed || []).filter((entry) => !blocked.has(String(entry.id)));
  writeJsonAtomic(progressPath, progress);
}

const videosPath = resolve(cwd, "data/voiced-memes-ru/videos.json");
if (existsSync(videosPath)) {
  const videos = readJson(videosPath).filter((entry) => {
    const match = String(entry.file || "").match(/vmru_batch_(\d+)\.mp4$/);
    return !match || !blocked.has(match[1]);
  });
  writeJsonAtomic(videosPath, videos);
}

const manifestPath = resolve(cwd, "data/output/admin-demos/manifest.json");
if (existsSync(manifestPath)) {
  const manifest = readJson(manifestPath);
  const pack = (manifest.packs || []).find((entry) => entry.id === "voiced-memes-ru");
  if (pack) {
    pack.items = (pack.items || []).filter((entry) => {
      const match = String(entry.id || "").match(/^vmru_batch_(\d+)$/);
      return !match || !blocked.has(match[1]);
    });
    writeJsonAtomic(manifestPath, manifest);
  }
}

console.log(JSON.stringify({ reviewed: safety.reviewed, rejected: rejected.size, quarantined: quarantined.size, removedFiles: removed.length }, null, 2));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, path);
}

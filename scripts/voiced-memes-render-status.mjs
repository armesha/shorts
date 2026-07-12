#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outDir = resolve(root, "tmp/memoteka-267-videos");
const workDir = resolve(root, "tmp/memoteka-267-video-work");
const progressPath = resolve(outDir, "progress.json");
const audioDir = resolve(root, "output/speech/memoteka-267-batch/wav");
const manifestPath = resolve(root, "output/speech/memoteka-267-batch/manifest.json");
const safetyPath = resolve(root, "data/voiced-memes-ru/safety-review.json");
const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, "utf8")) : { completed: [], failed: [] };
const completed = progress.completed?.length ?? 0;
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : [];
const safety = existsSync(safetyPath) ? JSON.parse(readFileSync(safetyPath, "utf8")) : { reject: {}, borderline: {} };
const blocked = new Set([...Object.keys(safety.reject || {}), ...Object.keys(safety.borderline || {}), ...Object.keys(safety.userRemoved || {})]);
const target = Array.isArray(manifest)
  ? manifest.filter((item) => !blocked.has(String(item.id)) && existsSync(resolve(audioDir, `${item.id}.wav`))).length
  : 0;
const currentId = existsSync(workDir) ? readdirSync(workDir).find((name) => name.startsWith("frames-"))?.slice(7) ?? null : null;
const service = spawnSync("systemctl", ["--user", "is-active", "shorts-voiced-memes-render.service"], { encoding: "utf8" }).stdout.trim();
const updatedAt = existsSync(progressPath) ? statSync(progressPath).mtime.toISOString() : null;
console.log(JSON.stringify({
  state: service,
  completed,
  target,
  blocked: Array.isArray(manifest) ? manifest.length - target : 0,
  remaining: Math.max(0, target - completed),
  percent: target ? Math.round((completed / target) * 1000) / 10 : 0,
  currentId,
  failed: progress.failed?.length ?? 0,
  updatedAt,
}, null, 2));

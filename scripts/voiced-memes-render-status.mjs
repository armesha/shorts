#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outDir = resolve(root, "tmp/memoteka-267-videos");
const workDir = resolve(root, "tmp/memoteka-267-video-work");
const progressPath = resolve(outDir, "progress.json");
const audioDir = resolve(root, "output/speech/memoteka-267-batch/wav");
const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, "utf8")) : { completed: [], failed: [] };
const completed = progress.completed?.length ?? 0;
const target = existsSync(audioDir) ? readdirSync(audioDir).filter((file) => file.endsWith(".wav")).length : 0;
const currentId = existsSync(workDir) ? readdirSync(workDir).find((name) => name.startsWith("frames-"))?.slice(7) ?? null : null;
const service = spawnSync("systemctl", ["--user", "is-active", "shorts-voiced-memes-render.service"], { encoding: "utf8" }).stdout.trim();
const updatedAt = existsSync(progressPath) ? statSync(progressPath).mtime.toISOString() : null;
console.log(JSON.stringify({
  state: service,
  completed,
  target,
  remaining: Math.max(0, target - completed),
  percent: target ? Math.round((completed / target) * 1000) / 10 : 0,
  currentId,
  failed: progress.failed?.length ?? 0,
  updatedAt,
}, null, 2));

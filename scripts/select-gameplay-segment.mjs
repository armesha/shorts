#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function probeDuration(file) {
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`ffprobe не смог прочитать ${file}`);
  const duration = Number(probe.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Некорректная длительность ${file}`);
  return duration;
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function readHistory(file) {
  if (!existsSync(file)) return { version: 1, uses: [] };
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return { version: 1, uses: Array.isArray(parsed.uses) ? parsed.uses : [] };
}

const source = resolve(arg("source", ""));
const clipDuration = Number(arg("duration", ""));
const historyFile = resolve(arg("history", "tmp/gameplay-segments/history.json"));
const step = Math.max(0.25, Number(arg("step", "1")) || 1);
if (!source || !existsSync(source)) throw new Error("Передай существующий файл через --source");
if (!Number.isFinite(clipDuration) || clipDuration <= 0) throw new Error("Передай --duration в секундах");

const sourceDuration = probeDuration(source);
const maxStart = sourceDuration - clipDuration;
if (maxStart < 0) throw new Error("Фоновое видео короче требуемого фрагмента");

const history = readHistory(historyFile);
const relevant = history.uses.filter((use) => use.source === source);
let bestScore = Number.POSITIVE_INFINITY;
let candidates = [];

for (let start = 0; start <= maxStart; start += step) {
  const end = start + clipDuration;
  let score = 0;
  for (let index = 0; index < relevant.length; index += 1) {
    const use = relevant[index];
    const seconds = overlap(start, end, Number(use.start), Number(use.end));
    if (seconds <= 0) continue;
    const recency = 1 + (index + 1) / Math.max(1, relevant.length);
    score += seconds * recency;
  }
  if (score < bestScore - 1e-9) {
    bestScore = score;
    candidates = [start];
  } else if (Math.abs(score - bestScore) < 1e-9) {
    candidates.push(start);
  }
}

const start = candidates[Math.floor(Math.random() * candidates.length)];
const selected = {
  source,
  start: Number(start.toFixed(3)),
  end: Number((start + clipDuration).toFixed(3)),
  duration: Number(clipDuration.toFixed(3)),
  overlapScore: Number(bestScore.toFixed(3)),
  selectedAt: new Date().toISOString(),
};
history.uses.push(selected);
mkdirSync(dirname(historyFile), { recursive: true });
const temporary = `${historyFile}.${process.pid}.tmp`;
writeFileSync(temporary, `${JSON.stringify(history, null, 2)}\n`);
renameSync(temporary, historyFile);
process.stdout.write(`${JSON.stringify(selected)}\n`);

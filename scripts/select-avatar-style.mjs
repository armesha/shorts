#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function leastUsed(items, counts, key) {
  const minimum = Math.min(...items.map((item) => counts[key(item)] ?? 0));
  const candidates = items.filter((item) => (counts[key(item)] ?? 0) === minimum);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const poolFile = resolve(arg("pool", "assets/audio-avatar-backgrounds/pool.json"));
const historyFile = resolve(arg("history", "tmp/avatar-style-history.json"));
const pool = JSON.parse(readFileSync(poolFile, "utf8"));
if (!Array.isArray(pool.backgrounds) || !pool.backgrounds.length) throw new Error("Пул фонов пуст");
if (!Array.isArray(pool.ringColors) || !pool.ringColors.length) throw new Error("Пул цветов ободка пуст");
const history = existsSync(historyFile)
  ? JSON.parse(readFileSync(historyFile, "utf8"))
  : { version: 1, backgroundCounts: {}, ringCounts: {}, uses: [] };
history.backgroundCounts ??= {};
history.ringCounts ??= {};
history.uses = Array.isArray(history.uses) ? history.uses : [];

const background = leastUsed(pool.backgrounds, history.backgroundCounts, (item) => item.id);
const ringColor = leastUsed(pool.ringColors, history.ringCounts, (item) => item);
history.backgroundCounts[background.id] = (history.backgroundCounts[background.id] ?? 0) + 1;
history.ringCounts[ringColor] = (history.ringCounts[ringColor] ?? 0) + 1;
const selected = {
  backgroundId: background.id,
  backgroundFile: resolve(dirname(poolFile), background.file),
  ringColor,
  selectedAt: new Date().toISOString(),
};
history.uses.push(selected);
mkdirSync(dirname(historyFile), { recursive: true });
const temporary = `${historyFile}.${process.pid}.tmp`;
writeFileSync(temporary, `${JSON.stringify(history, null, 2)}\n`);
renameSync(temporary, historyFile);
process.stdout.write(`${JSON.stringify(selected)}\n`);

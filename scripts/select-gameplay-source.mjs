#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readableVideo(path) {
  const probe = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path,
  ], { encoding: "utf8" });
  return probe.status === 0 && Number(probe.stdout.trim()) > 0;
}

const poolConfigPath = resolve(arg("pool-config", "data/voiced-memes-ru/gameplay-sources.json"));
const historyPath = resolve(arg("history", "tmp/gameplay-source-history.json"));
if (!existsSync(poolConfigPath)) throw new Error(`Конфигурация пула не найдена: ${poolConfigPath}`);

const pool = JSON.parse(readFileSync(poolConfigPath, "utf8"));
const sources = (Array.isArray(pool.sources) ? pool.sources : [])
  .map((entry) => ({ id: String(entry.id || ""), type: String(entry.type || ""), source: resolve(String(entry.file || "")) }))
  .filter((entry) => entry.id && entry.type && existsSync(entry.source) && readableVideo(entry.source));
if (!sources.length) throw new Error("В пуле нет готовых читаемых MP4-фонов");

const history = existsSync(historyPath)
  ? JSON.parse(readFileSync(historyPath, "utf8"))
  : { version: 1, uses: [] };
history.uses = Array.isArray(history.uses) ? history.uses : [];
const typeCounts = new Map([...new Set(sources.map((entry) => entry.type))].map((type) => [type, 0]));
const sourceCounts = new Map(sources.map((entry) => [entry.source, 0]));
for (const use of history.uses) {
  if (typeCounts.has(use.type)) typeCounts.set(use.type, (typeCounts.get(use.type) ?? 0) + 1);
  if (sourceCounts.has(use.source)) sourceCounts.set(use.source, (sourceCounts.get(use.source) ?? 0) + 1);
}
const minimumTypeUses = Math.min(...typeCounts.values());
const typeCandidates = [...typeCounts.entries()].filter(([, uses]) => uses === minimumTypeUses).map(([type]) => type);
const type = typeCandidates[Math.floor(Math.random() * typeCandidates.length)];
const sourcesForType = sources.filter((entry) => entry.type === type);
const minimumSourceUses = Math.min(...sourcesForType.map((entry) => sourceCounts.get(entry.source) ?? 0));
const sourceCandidates = sourcesForType.filter((entry) => (sourceCounts.get(entry.source) ?? 0) === minimumSourceUses);
const chosen = sourceCandidates[Math.floor(Math.random() * sourceCandidates.length)];
const selected = {
  id: chosen.id,
  type,
  source: chosen.source,
  typeUsesBefore: minimumTypeUses,
  sourceUsesBefore: minimumSourceUses,
  selectedAt: new Date().toISOString(),
};
history.uses.push(selected);
mkdirSync(dirname(historyPath), { recursive: true });
const temporary = `${historyPath}.${process.pid}.tmp`;
writeFileSync(temporary, `${JSON.stringify(history, null, 2)}\n`);
renameSync(temporary, historyPath);
process.stdout.write(`${JSON.stringify(selected)}\n`);

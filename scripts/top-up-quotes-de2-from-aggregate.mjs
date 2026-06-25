#!/usr/bin/env node
// Append newly rendered aggregate German quote videos (data/quotes-de/qNNN)
// into the exhausted quotes-de-2 deck without re-splitting or disturbing the
// existing quotes-de-1/3 video packs.
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SOURCE = resolve(ROOT, 'data/quotes-de');
const TARGET = resolve(ROOT, 'data/quotes-de-2');
const POLICY = resolve(SOURCE, 'CONTENT-POLICY.md');

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function num(file) {
  const m = String(file || '').match(/^q(\d+)\.mp4$/);
  return m ? Number(m[1]) : null;
}

function ranges(files) {
  const nums = files.map(num).filter((n) => n != null).sort((a, b) => a - b);
  if (!nums.length) return [];
  const out = [];
  let start = nums[0];
  let prev = nums[0];
  for (const n of nums.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    out.push([start, prev]);
    start = prev = n;
  }
  out.push([start, prev]);
  return out;
}

const args = process.argv.slice(2);
const minIdIndex = args.indexOf('--min-id');
const minId = minIdIndex >= 0 ? Number(args[minIdIndex + 1]) : 2950;
const maxCountIndex = args.indexOf('--max-count');
const maxCount = maxCountIndex >= 0 ? Number(args[maxCountIndex + 1]) : Number.POSITIVE_INFINITY;
if (!Number.isFinite(minId) || minId < 1) throw new Error('--min-id must be a positive number');

const sourceVideos = readJson(resolve(SOURCE, 'videos.json'), []);
const sourceSources = readJson(resolve(SOURCE, 'sources.json'), { items: [], portraitSources: {} });
const targetVideos = readJson(resolve(TARGET, 'videos.json'), []);
const targetSources = readJson(resolve(TARGET, 'sources.json'), { items: [], portraitSources: {} });

const targetByFile = new Map(targetVideos.map((item) => [item.file, item]));
const candidates = sourceVideos
  .filter((item) => {
    const n = num(item.file);
    return n != null && n >= minId && !targetByFile.has(item.file);
  })
  .sort((a, b) => num(a.file) - num(b.file))
  .slice(0, maxCount);

for (const item of candidates) targetByFile.set(item.file, item);
const nextVideos = [...targetByFile.values()].sort((a, b) => (num(a.file) ?? 999999) - (num(b.file) ?? 999999));
writeJson(resolve(TARGET, 'videos.json'), nextVideos);

const sourceItemByFile = new Map((sourceSources.items ?? []).map((item) => [item.file, item]));
const targetSourceByFile = new Map((targetSources.items ?? []).map((item) => [item.file, item]));
for (const item of candidates) {
  const sourceItem = sourceItemByFile.get(item.file);
  if (sourceItem) targetSourceByFile.set(item.file, sourceItem);
}
const portraitSources = { ...(targetSources.portraitSources ?? {}) };
for (const item of targetSourceByFile.values()) {
  const author = item.author;
  if (author && sourceSources.portraitSources?.[author]) portraitSources[author] = sourceSources.portraitSources[author];
}
writeJson(resolve(TARGET, 'sources.json'), {
  ...targetSources,
  updatedAt: new Date().toISOString(),
  portraitSources,
  items: [...targetSourceByFile.values()].sort((a, b) => (num(a.file) ?? 999999) - (num(b.file) ?? 999999)),
});

const fileRanges = ranges(nextVideos.map((item) => item.file));
writeJson(resolve(TARGET, 'index.json'), {
  total: nextVideos.length,
  packs: 1,
  packSize: nextVideos.length,
  ...(fileRanges.length ? { range: [fileRanges[0][0], fileRanges.at(-1)[1]], fileRanges } : {}),
});
if (existsSync(POLICY)) copyFileSync(POLICY, resolve(TARGET, 'CONTENT-POLICY.md'));

console.log(JSON.stringify({ target: 'data/quotes-de-2', minId, added: candidates.length, total: nextVideos.length }, null, 2));

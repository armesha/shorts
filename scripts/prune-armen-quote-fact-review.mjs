#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const QUOTE_FILTERS = [
  {
    file: "data/quotes-de-combined/titled.json",
    index: "data/quotes-de-combined/index.json",
    pattern: /krieg|waffen|waffe|rußland|russland|mord/i,
  },
  {
    file: "data/quote-video-de/titled.json",
    index: "data/quote-video-de/index.json",
    pattern: /krieg|waffen|waffe|rußland|russland|mord/i,
  },
  {
    file: "data/quotes-de-combined/videos.json",
    pattern: /krieg|waffen|waffe|rußland|russland|mord/i,
    videoList: true,
  },
  {
    file: "data/quotes-en/titled.json",
    index: "data/quotes-en/index.json",
    pattern: /Catherine II of Russia|Trump of their rescue/i,
  },
];

const STRING_REPLACEMENTS = [
  {
    file: "data/fact-videos/videos.json",
    replacements: [
      [/Lake Baikal in Russia/g, "Lake Baikal in Siberia"],
    ],
  },
  {
    file: "data/packs/static-facts-en-superadmin.json",
    replacements: [
      [/Lake Baikal in Russia/g, "Lake Baikal in Siberia"],
    ],
  },
  {
    file: "data/packs/static-facts-de-superadmin.json",
    replacements: [
      [/Baikalsee in Russland/g, "Baikalsee in Sibirien"],
      [/Russland/g, "Sibirien"],
    ],
  },
  {
    file: "data/packs/chistes-es-public-domain.json",
    replacements: [
      [/lleno de terror/g, "lleno de miedo"],
    ],
  },
];

function abs(file) {
  return resolve(process.cwd(), file);
}

function readJson(file) {
  return JSON.parse(readFileSync(abs(file), "utf8"));
}

function writeJson(file, value, indent = 2) {
  writeFileSync(abs(file), `${JSON.stringify(value, null, indent)}\n`);
}

function range(items) {
  const lengths = items.map((item) => Number(item.chars ?? String(item.text ?? "").length)).sort((a, b) => a - b);
  return lengths.length ? [lengths[0], lengths[lengths.length - 1]] : [0, 0];
}

function quoteText(item) {
  return `${item.title || ""}\n${item.text || ""}\n${JSON.stringify(item)}`;
}

for (const config of QUOTE_FILTERS) {
  if (!existsSync(abs(config.file))) continue;
  const items = readJson(config.file);
  const kept = items.filter((item) => !config.pattern.test(quoteText(item)));
  const removed = items.length - kept.length;
  if (!removed) {
    console.log(`${config.file}: already clean`);
    continue;
  }
  writeJson(config.file, kept);
  if (config.index && existsSync(abs(config.index))) {
    const index = readJson(config.index);
    writeJson(config.index, {
      ...index,
      total: kept.length,
      packs: config.videoList ? index.packs : index.packs ?? 1,
      packSize: index.packs === 1 ? kept.length : index.packSize,
      range: range(kept),
      reviewPrunedAt: new Date().toISOString(),
      reviewPrunedRemoved: (index.reviewPrunedRemoved || 0) + removed,
    });
  }
  console.log(`${config.file}: removed=${removed}; kept=${kept.length}`);
}

function replaceDeep(value, replacements) {
  if (typeof value === "string") {
    return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
  }
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, replacements));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceDeep(item, replacements)]));
  }
  return value;
}

for (const config of STRING_REPLACEMENTS) {
  if (!existsSync(abs(config.file))) continue;
  const before = readFileSync(abs(config.file), "utf8");
  const next = replaceDeep(JSON.parse(before), config.replacements);
  const after = `${JSON.stringify(next, null, 2)}\n`;
  if (before === after) {
    console.log(`${config.file}: already clean`);
    continue;
  }
  writeFileSync(abs(config.file), after);
  console.log(`${config.file}: updated`);
}

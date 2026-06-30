#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const ROOT = process.cwd();
const SOURCE_ROOTS = [
  { path: resolve(ROOT, "temp/meme/translated"), label: "temp/meme/translated", addedAt: "2026-06-28T00:00:00.000Z" },
  { path: resolve(ROOT, "temp/meme2/translated"), label: "temp/meme2/translated", addedAt: "2026-06-29T00:00:00.000Z" },
].filter((source) => existsSync(source.path));
const ASSET_ROOT = resolve(ROOT, "assets/template-packs/new-memes");
const PACK_ROOT = resolve(ROOT, "data/packs");
const OWNER_ID = 1;

const LANG_NAMES = {
  de: "Neue Memes",
  en: "New Memes",
  es: "Memes nuevos",
  fr: "Nouveaux memes",
  it: "Nuovi meme",
  pt: "Memes novos",
  ru: "Новые мемы",
};

const TEMPLATE_IMAGE = (lang, file) => `assets/template-packs/new-memes/${lang}/${file}`;
const IMAGE_FILE_RE = /\.(jpe?g|png|webp)$/i;

function hiddenKillbox(id, role, y, maxChars) {
  return {
    id,
    type: "killbox",
    x: 0,
    y,
    w: 1,
    h: 1,
    rot: 0,
    role,
    padX: 0,
    padY: 0,
    align: "left",
    valign: "top",
    font: {
      family: "Inter",
      size: 1,
      weight: 400,
      color: "#00000000",
      lineHeight: 1,
    },
    fitMin: 1,
    fitMax: 1,
    maxChars,
    placeholder: role,
  };
}

function templateFor(lang, file, index) {
  return {
    version: 1,
    name: `new-memes-${lang}-${String(index + 1).padStart(3, "0")}`,
    canvas: { w: 1080, h: 1920, bg: "#111111" },
    elements: [
      {
        id: "card",
        type: "image",
        x: 0,
        y: 0,
        w: 1080,
        h: 1920,
        rot: 0,
        src: TEMPLATE_IMAGE(lang, file),
        fit: "cover",
      },
      hiddenKillbox("title", "title", 0, 220),
      hiddenKillbox("source", "source", 1, 1200),
    ],
  };
}

function buildLang(lang) {
  const seen = new Set();
  const files = [];
  const sourceCounts = {};
  for (const source of SOURCE_ROOTS) {
    const srcDir = resolve(source.path, lang);
    if (!existsSync(srcDir)) continue;
    const sourceFiles = readdirSync(srcDir)
      .filter((file) => IMAGE_FILE_RE.test(file))
      .sort();
    for (const file of sourceFiles) {
      if (seen.has(file)) continue;
      seen.add(file);
      files.push({ file, src: resolve(srcDir, file), sourceLabel: source.label, addedAt: source.addedAt });
      sourceCounts[source.label] = (sourceCounts[source.label] ?? 0) + 1;
    }
  }
  if (!files.length) return null;

  const assetDir = resolve(ASSET_ROOT, lang);
  mkdirSync(assetDir, { recursive: true });
  const targetFiles = new Set(files.map(({ file }) => file));
  for (const existingFile of readdirSync(assetDir).filter((file) => IMAGE_FILE_RE.test(file))) {
    if (!targetFiles.has(existingFile)) unlinkSync(resolve(assetDir, existingFile));
  }
  for (const { file, src } of files) copyFileSync(src, resolve(assetDir, file));

  const packId = `new-memes-${lang}-superadmin`;
  const pack = {
    id: packId,
    owners: [OWNER_ID],
    createdBy: OWNER_ID,
    name: LANG_NAMES[lang] ?? `New Memes (${lang.toUpperCase()})`,
    lang,
    templates: files.map(({ file }, index) => templateFor(lang, file, index)),
    cards: files.map(({ file, sourceLabel, addedAt }, index) => ({
      values: {
        title: `${LANG_NAMES[lang] ?? "New Memes"} ${String(index + 1).padStart(3, "0")}`,
        source: `Translated ready-made meme card ${basename(file, extname(file))} from ${sourceLabel}. Legacy memes-* decks are not used for armen thematic blocks.`,
      },
      addedAt,
    })),
    createdAt: "2026-06-28T00:00:00.000Z",
    grants: [],
    autoExpireMode: "per_account",
    notes: {
      source: `${SOURCE_ROOTS.map((source) => source.label).join(" + ")}; user-provided translated meme cards rendered before pack assembly.`,
      sourceCounts,
      policy: [
        "These packs replace legacy memes-* sources for armen foreign thematic blocks.",
        "Russian channels use only pack:new-memes-ru-superadmin for the Russian thematic block after the legacy meme deck retirement.",
        "Do not reconnect legacy memes-* decks to armen thematic blocks without a new rights/safety review.",
      ],
    },
  };
  mkdirSync(PACK_ROOT, { recursive: true });
  writeFileSync(resolve(PACK_ROOT, `${packId}.json`), `${JSON.stringify(pack, null, 2)}\n`);
  return { lang, packId, cards: files.length, sourceCounts };
}

const results = Object.keys(LANG_NAMES).map(buildLang).filter(Boolean);
console.log(JSON.stringify({ packs: results }, null, 2));

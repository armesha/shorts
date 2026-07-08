#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

const ROOT = process.cwd();
const WORK_ROOT = resolve(ROOT, "tmp/memes/ru-ai-full");
const MANIFEST_PATH = resolve(WORK_ROOT, "manifest-work.json");
const ASSET_ROOT = resolve(ROOT, "assets/template-packs/new-memes");
const PACK_ROOT = resolve(ROOT, "data/packs");
const OWNER_ID = 1;
const ADDED_AT = "2026-07-08T00:00:00.000Z";

const LANG_NAMES = {
  ar: "ميمز جديدة",
  de: "Neue Memes",
  en: "New Memes",
  es: "Memes nuevos",
  fr: "Nouveaux memes",
  it: "Nuovi meme",
  ja: "新しいミーム",
  pl: "Nowe memy",
  pt: "Memes novos",
  ru: "Новые мемы",
  ro: "Meme noi",
  cs: "Nové memy",
  nl: "Nieuwe memes",
};

const IMAGE_FILE_RE = /\.(jpe?g|png|webp)$/i;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

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
    name: `new-memes-${lang}-ai-${String(index + 1).padStart(4, "0")}`,
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
        src: `assets/template-packs/new-memes/${lang}/${file}`,
        fit: "cover",
      },
      hiddenKillbox("title", "title", 0, 2000),
      hiddenKillbox("source", "source", 1, 1200),
    ],
  };
}

function blankPack(lang) {
  const packId = `new-memes-${lang}-superadmin`;
  return {
    id: packId,
    owners: [OWNER_ID],
    createdBy: OWNER_ID,
    name: LANG_NAMES[lang] ?? `New Memes (${lang.toUpperCase()})`,
    lang,
    templateType: "memes",
    templates: [],
    cards: [],
    createdAt: ADDED_AT,
    grants: [],
    autoExpireMode: "per_account",
    notes: {
      source: "AI-remade meme cards from tmp/memes/ru-ai-full; user-provided Russian originals in tmp/memes/ru.",
      policy: [
        "Cards are AI-remade visuals with localized captions rendered before pack assembly.",
        "Each generated video from these pack cards receives one creator motion GIF overlay in the lower safe area.",
      ],
    },
  };
}

function packFile(lang) {
  return resolve(PACK_ROOT, `new-memes-${lang}-superadmin.json`);
}

function importLang(manifest, lang) {
  const file = packFile(lang);
  const existed = existsSync(file);
  const pack = existed ? readJson(file) : blankPack(lang);
  pack.id ||= `new-memes-${lang}-superadmin`;
  pack.owners = Array.isArray(pack.owners) && pack.owners.length ? pack.owners : [OWNER_ID];
  pack.createdBy = pack.createdBy ?? OWNER_ID;
  pack.name = pack.name || LANG_NAMES[lang] || `New Memes (${lang.toUpperCase()})`;
  pack.lang = lang;
  pack.templates = Array.isArray(pack.templates) ? pack.templates : [];
  pack.cards = Array.isArray(pack.cards) ? pack.cards : [];
  pack.grants = Array.isArray(pack.grants) ? pack.grants : [];
  pack.autoExpireMode = pack.autoExpireMode || "per_account";
  if (!pack.notes || typeof pack.notes !== "object") pack.notes = {};
  pack.notes.aiRemakeImport = {
    sourceManifest: "tmp/memes/ru-ai-full/manifest-work.json",
    assetDir: `assets/template-packs/new-memes/${lang}`,
    importedAt: ADDED_AT,
  };

  const assetDir = resolve(ASSET_ROOT, lang);
  mkdirSync(assetDir, { recursive: true });

  const existingAssets = new Set(
    pack.templates
      .flatMap((template) => template?.elements ?? [])
      .map((element) => (element?.type === "image" && typeof element.src === "string" ? basename(element.src) : ""))
      .filter(Boolean),
  );
  const existingSources = new Set(
    pack.cards
      .map((card) => (typeof card?.values?.source === "string" ? card.values.source : ""))
      .filter(Boolean),
  );
  const sourceToCard = new Map(
    pack.cards
      .map((card) => [typeof card?.values?.source === "string" ? card.values.source : "", card])
      .filter(([source]) => source),
  );

  let copied = 0;
  let added = 0;
  let updated = 0;
  for (const item of manifest.items ?? []) {
    const rel = item.outputs?.[lang];
    if (!rel || !IMAGE_FILE_RE.test(rel)) throw new Error(`missing output for ${item.id}:${lang}`);
    const src = resolve(WORK_ROOT, rel);
    if (!existsSync(src)) throw new Error(`missing rendered file: ${src}`);
    const outName = basename(rel);
    const dst = resolve(assetDir, outName);
    copyFileSync(src, dst);
    copied += 1;

    const source = `AI-remade meme card ${item.id} from tmp/memes/ru-ai-full.`;
    const caption = item.translations?.[lang]?.top || item.translations?.ru?.top || item.id;
    const title = String(caption).trim();

    if (!existingAssets.has(outName)) {
      pack.templates.push(templateFor(lang, outName, pack.templates.length));
      existingAssets.add(outName);
      added += 1;
    }

    const existingCard = sourceToCard.get(source);
    if (existingCard) {
      existingCard.values = existingCard.values && typeof existingCard.values === "object" ? existingCard.values : {};
      if (existingCard.values.title !== title) {
        existingCard.values.title = title;
        updated += 1;
      }
      existingCard.values.source = source;
      continue;
    }

    const card = {
      values: {
        title,
        source,
      },
      addedAt: ADDED_AT,
    };
    pack.cards.push(card);
    sourceToCard.set(source, card);
    existingSources.add(source);
    added += 1;
  }

  mkdirSync(PACK_ROOT, { recursive: true });
  writeJson(file, pack);
  return { lang, pack: `new-memes-${lang}-superadmin`, existed, copied, added, updated, cards: pack.cards.length, templates: pack.templates.length };
}

const manifest = readJson(MANIFEST_PATH);
const langs = manifest.languages ?? [];
const results = langs.map((lang) => importLang(manifest, lang));
console.log(JSON.stringify({ sourceItems: manifest.items?.length ?? 0, packs: results }, null, 2));

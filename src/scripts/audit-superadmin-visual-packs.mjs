import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "temp/superadmin-visual-audit.json");
const USERNAME = process.argv.find((arg) => arg.startsWith("--user="))?.slice("--user=".length) || "armen";

function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function listFiles(dir, pattern = /.*/) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((file) => {
    try {
      return statSync(resolve(dir, file)).isFile() && pattern.test(file);
    } catch {
      return false;
    }
  });
}

function walk(value, visitor) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
    return;
  }
  visitor(value);
  for (const item of Object.values(value)) walk(item, visitor);
}

function hasVisualTemplate(template) {
  let ok = false;
  walk(template, (node) => {
    const src = String(node.src || node.image || node.imageUrl || node.backgroundImage || node.bg || "");
    if (node.type === "image" || /^data:image\//.test(src) || /^(assets|data)\//.test(src)) ok = true;
  });
  return ok;
}

function templateAssetRefs(template) {
  const refs = [];
  walk(template, (node) => {
    for (const key of ["src", "image", "imageUrl", "backgroundImage"]) {
      const value = node[key];
      if (typeof value === "string" && /^(assets|data)\//.test(value)) refs.push(value);
    }
    if (typeof node.bg === "string") {
      const match = node.bg.match(/url\(['"]?((?:assets|data)\/[^'")]+)['"]?\)/);
      if (match) refs.push(match[1]);
    }
  });
  return refs;
}

function packReport(deckId, accounts) {
  const id = deckId.slice("pack:".length);
  const path = resolve(ROOT, "data/packs", `${id}.json`);
  const pack = readJson(path);
  if (!pack) {
    return { deckId, type: "pack", status: "problem", accounts, reason: "missing pack file", path };
  }
  const templates = Array.isArray(pack.templates) ? pack.templates : [];
  const cards = Array.isArray(pack.cards) ? pack.cards : [];
  const imageTemplates = templates.filter(hasVisualTemplate).length;
  const refs = [...new Set(templates.flatMap(templateAssetRefs))];
  const missingRefs = refs.filter((ref) => !existsSync(resolve(ROOT, ref)));
  const mgsRefs = (JSON.stringify(pack).match(/mgs|MGS|психология-mgs/g) || []).length;
  const warnings = [];
  if (mgsRefs > 0) warnings.push(`MGS references: ${mgsRefs}`);
  if (templates.length > 0 && imageTemplates < templates.length) {
    warnings.push(`visual templates ${imageTemplates}/${templates.length}`);
  }
  if (missingRefs.length) warnings.push(`missing template assets: ${missingRefs.length}`);
  if (!cards.length) warnings.push("no cards");
  return {
    deckId,
    type: "pack",
    status: warnings.length ? "review" : "ok",
    accounts,
    pack: { id: pack.id || id, name: pack.name || "", lang: pack.lang || "", templates: templates.length, imageTemplates, cards: cards.length },
    refs: { total: refs.length, missing: missingRefs },
    mgsRefs,
    warnings,
  };
}

function visualDirReport(deckId, accounts, dir, label, assetDir = dir) {
  const videos = readJson(resolve(ROOT, "data", dir, "videos.json"), []);
  const assets = listFiles(resolve(ROOT, "assets/fact-videos", assetDir), /\.(mp4|webm)$/i);
  const warnings = [];
  if (!Array.isArray(videos) || videos.length === 0) warnings.push("no videos.json items");
  if (assets.length === 0) warnings.push("no local video assets");
  return {
    deckId,
    type: "prebuilt-video",
    status: warnings.length ? "review" : "ok",
    accounts,
    label,
    videos: Array.isArray(videos) ? videos.length : 0,
    assets: assets.length,
    warnings,
  };
}

function titledReport(deckId, accounts, dir, visualLabel) {
  const titled = readJson(resolve(ROOT, "data", dir, "titled.json"), []);
  const warnings = [];
  if (!Array.isArray(titled) || titled.length === 0) warnings.push("no titled.json items");
  return {
    deckId,
    type: "dynamic-text",
    status: warnings.length ? "review" : "ok",
    accounts,
    visual: visualLabel,
    items: Array.isArray(titled) ? titled.length : 0,
    warnings,
  };
}

function builtinReport(deckId, accounts) {
  if (/mgs|психология-mgs/i.test(deckId)) {
    return { deckId, type: "builtin", status: "problem", accounts, warnings: ["MGS deck used by super-admin"] };
  }
  if (/^memes-/.test(deckId)) {
    const cards = readJson(resolve(ROOT, `data/${deckId}/cards.json`), []);
    const photoCount = listFiles(resolve(ROOT, "data/memes/photos"), /\.(jpe?g|png|webp)$/i).length;
    const warnings = [];
    if (!Array.isArray(cards) || cards.length === 0) warnings.push("no meme cards");
    if (photoCount === 0) warnings.push("no shared meme-board photos");
    return { deckId, type: "meme-board", status: warnings.length ? "review" : "ok", accounts, cards: Array.isArray(cards) ? cards.length : 0, sharedPhotos: photoCount, warnings };
  }
  if (/^quote-video/.test(deckId)) {
    const dir = deckId === "quote-video-de" ? "quote-video-de" : deckId.replace("quote-video", "quotes");
    return titledReport(deckId, accounts, dir, "rendered through quote video renderer with portrait/artwork or generated quote backgrounds");
  }
  if (/^(visual-riddles|illusions|space|fact-|prayers)/.test(deckId)) {
    return visualDirReport(deckId, accounts, deckId === "fact-en" ? "fact-videos" : deckId, "prebuilt visual/video deck", deckId === "fact-en" ? "" : deckId);
  }
  if (/^tips/.test(deckId)) {
    const items = readJson(resolve(ROOT, `data/${deckId}/titled.json`), []);
    const bgCount = listFiles(resolve(ROOT, "assets/backgrounds/lifehacks"), /\.(jpe?g|png)$/i).filter((file) => !/_chaplin\./i.test(file)).length;
    const warnings = [];
    if (!Array.isArray(items) || items.length === 0) warnings.push("no lifehack cards");
    if (bgCount === 0) warnings.push("no lifehack visual backgrounds");
    return { deckId, type: "lifehack", status: warnings.length ? "review" : "ok", accounts, items: Array.isArray(items) ? items.length : 0, backgrounds: bgCount, warnings };
  }
  if (deckId === "islamic" || deckId === "christian") {
    const cards = readJson(resolve(ROOT, `data/${deckId}/cards.json`), []);
    const bgDir = deckId === "islamic" ? "assets/backgrounds/islamic_templates" : "assets/backgrounds/christian_protestant_templates";
    const backgrounds = listFiles(resolve(ROOT, bgDir), /\.(jpe?g|png)$/i).length;
    const warnings = [];
    if (!Array.isArray(cards) || cards.length === 0) warnings.push("no religious source cards");
    if (backgrounds === 0) warnings.push("no religious visual backgrounds");
    return { deckId, type: "religious-source", status: warnings.length ? "review" : "ok", accounts, cards: Array.isArray(cards) ? cards.length : 0, backgrounds, warnings };
  }
  if (["islamic-quotes-ar", "islamic-facts-ar"].includes(deckId)) {
    return titledReport(deckId, accounts, deckId, "rendered through quote/religious visual fallback backgrounds");
  }
  if (["christian-quotes-en", "christian-facts-en"].includes(deckId)) {
    return titledReport(deckId, accounts, deckId, "rendered through quote/religious visual fallback backgrounds");
  }
  if (/^quotes-/.test(deckId)) {
    return titledReport(deckId, accounts, deckId === "quotes-de" ? "quotes-de-combined" : deckId, "portrait/artwork when available; generated quote fallback backgrounds otherwise");
  }
  if (["ru", "de", "it", "fr", "en", "pt"].includes(deckId)) {
    const byLang = { ru: "anecdotes", de: "anecdotes-de", it: "anecdotes-it", fr: "anecdotes-fr", en: "anecdotes-en", pt: "anecdotes-pt" };
    const cards = readJson(resolve(ROOT, `data/${byLang[deckId]}/titled.json`), []);
    const motion = listFiles(resolve(ROOT, "assets/motion/jokes"), /\.gif$/i).length;
    const videoBgs = listFiles(resolve(ROOT, "assets/fact-videos/joke-backgrounds"), /\.(mp4|webm)$/i).length;
    const warnings = [];
    if (!Array.isArray(cards) || cards.length === 0) warnings.push("no joke cards");
    if (motion === 0) warnings.push("no joke motion accents");
    return { deckId, type: "plain-joke-render", status: warnings.length ? "review" : "ok", accounts, cards: Array.isArray(cards) ? cards.length : 0, jokeMotionGifs: motion, jokeVideoBackgrounds: videoBgs, warnings };
  }
  return { deckId, type: "unknown", status: "review", accounts, warnings: ["unclassified deck visual path"] };
}

const db = new DatabaseSync(resolve(ROOT, "data/app.db"));
try {
  const user = db.prepare("SELECT id, username FROM users WHERE username=?").get(USERNAME);
  if (!user) throw new Error(`User not found: ${USERNAME}`);
  const rows = db
    .prepare("SELECT id, channel_name, source_decks FROM accounts WHERE user_id=? ORDER BY id")
    .all(user.id);
  const deckAccounts = new Map();
  for (const row of rows) {
    const sourceDecks = JSON.parse(row.source_decks || "[]");
    for (const deckId of sourceDecks) {
      const list = deckAccounts.get(deckId) || [];
      list.push({ id: row.id, name: row.channel_name });
      deckAccounts.set(deckId, list);
    }
  }
  const decks = [...deckAccounts.keys()].sort();
  const reports = decks.map((deckId) => (deckId.startsWith("pack:") ? packReport(deckId, deckAccounts.get(deckId)) : builtinReport(deckId, deckAccounts.get(deckId))));
  const summary = {
    user: USERNAME,
    accounts: rows.length,
    deckSources: reports.length,
    ok: reports.filter((x) => x.status === "ok").length,
    review: reports.filter((x) => x.status === "review").length,
    problem: reports.filter((x) => x.status === "problem").length,
  };
  const result = { generatedAt: new Date().toISOString(), summary, reports };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  const flagged = reports.filter((x) => x.status !== "ok");
  if (flagged.length) {
    console.log("Flagged:");
    for (const item of flagged) console.log(`- ${item.status}: ${item.deckId} — ${(item.warnings || []).join("; ")}`);
  }
  console.log(`wrote ${OUT}`);
  process.exit(summary.problem ? 2 : 0);
} finally {
  db.close();
}

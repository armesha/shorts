import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const OUT = resolve(ROOT, "tmp/superadmin-visual-audit.json");
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, "data/app.db");
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

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return fallback;
  }
}

function stringValuesDeep(value, out = []) {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) stringValuesDeep(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringValuesDeep(item, out);
  }
  return out;
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

function looksLikeLocalAssetRef(value) {
  const ref = String(value || "").trim();
  if (!ref || /^https?:\/\//i.test(ref) || /^data:/i.test(ref)) return false;
  return /^(assets|local-assets|public|web\/public|data)\//.test(ref) || ref.startsWith("/files/");
}

function assetPath(ref) {
  const value = String(ref || "").trim();
  if (!looksLikeLocalAssetRef(value)) return null;
  if (value.startsWith("/files/")) return resolve(ROOT, value.slice("/files/".length));
  if (value.startsWith("public/")) return resolve(ROOT, "web", value);
  return resolve(ROOT, value.replace(/^\/+/, ""));
}

function cssUrlRefs(value) {
  const refs = [];
  const text = String(value || "");
  const re = /url\(['"]?([^'")]+)['"]?\)/g;
  let match;
  while ((match = re.exec(text))) refs.push(match[1]);
  return refs;
}

function hasVisualTemplate(template) {
  let ok = false;
  walk(template, (node) => {
    const refs = [
      node.src,
      node.image,
      node.imageUrl,
      node.backgroundImage,
      node.poster,
      node.video,
      node.url,
      ...cssUrlRefs(node.bg),
    ].filter(Boolean);
    if (["image", "video"].includes(String(node.type || ""))) ok = true;
    if (refs.some((ref) => /^data:(image|video)\//i.test(String(ref)) || looksLikeLocalAssetRef(ref))) ok = true;
  });
  return ok;
}

function assetRefs(value) {
  const refs = [];
  walk(value, (node) => {
    for (const key of ["src", "image", "imageUrl", "backgroundImage", "poster", "video", "url"]) {
      const value = node[key];
      if (typeof value === "string" && looksLikeLocalAssetRef(value)) refs.push(value);
    }
    if (typeof node.bg === "string") {
      for (const ref of cssUrlRefs(node.bg)) {
        if (looksLikeLocalAssetRef(ref)) refs.push(ref);
      }
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
  const refs = [...new Set([...templates, ...cards].flatMap(assetRefs))];
  const missingRefs = refs.filter((ref) => {
    const path = assetPath(ref);
    return path && !existsSync(path);
  });
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
    if (deckId === "fact-en") return visualDirReport(deckId, accounts, "fact-videos", "prebuilt visual/video deck", "");
    if (deckId === "fact-es")
      return visualDirReport(
        deckId,
        accounts,
        "fact-videos-es",
        "Spanish localized fact deck; runtime rebuilds the shared source footage with ES overlay + edge-tts",
        "",
      );
    if (/^fact-(ru|de|it|fr|pt)$/.test(deckId)) {
      const lang = deckId.slice("fact-".length).toUpperCase();
      return visualDirReport(
        deckId,
        accounts,
        `fact-videos-${deckId.slice("fact-".length)}`,
        `${lang} localized fact deck; runtime rebuilds the shared source footage with localized overlay + edge-tts`,
        "",
      );
    }
    return visualDirReport(deckId, accounts, deckId, "prebuilt visual/video deck", deckId);
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

function addDeckUse(deckAccounts, deckId, account, place) {
  const id = String(deckId || "").trim();
  if (!id) return;
  const key = `${account.id}:${place}`;
  const list = deckAccounts.get(id) || [];
  if (!list.some((item) => `${item.id}:${item.place}` === key)) {
    list.push({ id: account.id, name: account.channel_name, place });
  }
  deckAccounts.set(id, list);
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
try {
  db.exec("PRAGMA query_only = ON");
  const user = db.prepare("SELECT id, username FROM users WHERE username=?").get(USERNAME);
  if (!user) throw new Error(`User not found: ${USERNAME}`);
  const rows = db
    .prepare("SELECT id, channel_name, source_decks, slot_decks FROM accounts WHERE user_id=? ORDER BY id")
    .all(user.id);
  const deckAccounts = new Map();
  for (const row of rows) {
    for (const deckId of parseJson(row.source_decks, [])) addDeckUse(deckAccounts, deckId, row, "source");
    for (const deckId of stringValuesDeep(parseJson(row.slot_decks, {}))) addDeckUse(deckAccounts, deckId, row, "slot");
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

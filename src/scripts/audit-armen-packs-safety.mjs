#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDeck, isPackDeckId } from "../anecdotes/decks.ts";
import { filterSafetyPrunedItems } from "../anecdotes/library.ts";

const ROOT = process.cwd();
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, "data/app.db");
const OUT = resolve(ROOT, "tmp/armen-pack-safety-audit.json");

const CHECKS = [
  {
    id: "protected_class_slur",
    severity: "high",
    pattern:
      /(?:\b(?:nigg(?:er|a|ah)?s?|faggot|tranny|kike|chink|spic(?!\s*&\s*span)|(?<!agujero\s)(?<!agujeros\s)(?<!ojos\s)(?<!olhos\s)(?<!buraco\s)(?<!buracos\s)negro(?:es|s)?|neger|zigeuner|kanake|schwuchtel)\b|(?:^|[^\p{L}\p{N}_])(?:пидор\p{L}*|ниггер\p{L}*|негр\p{L}*|хач\p{L}*|жид(?!к)\p{L}*|чурк\p{L}*)(?=$|[^\p{L}\p{N}_]))/iu,
  },
  {
    id: "explicit_sexual",
    severity: "high",
    pattern:
      /\b(porn|porno|orgasm|blowjob|handjob|sex tape|prostitut|whore|slut|penis|vagina|masturb|еба|секс|оргазм|член|вагин|проститут|шлюх|минет|дроч|cazzo|fottutamente|puttan|troia|vagina|sesso|coño|polla|puta|boquete|buceta)\b/i,
  },
  {
    id: "misogynistic_joke",
    severity: "high",
    pattern:
      /(mujer\s+perversa|vida\s+de\s+perros|genio\s+de\s+mil\s+demonios|si\s+es\s+hermosa[\s\S]{0,120}si\s+fea|mujer[\s\S]{0,80}solemne\s+desprecio|mujer\s+mas\s+linda[\s\S]{0,120}qu[ií]tale|pena\s+de\s+mi\s+fealdad[\s\S]{0,120}mujer|mujer\s+fuerte[\s\S]{0,140}hermosa[\s\S]{0,80}fea)/i,
  },
  {
    id: "violence_self_harm_extremism",
    severity: "review",
    pattern:
      /\b(hitler|nazi|isis|terror|suicide|kill myself|murder|rape|raped|bloodbath|massacre|убий|суицид|самоуб|изнасил|террор|гитлер|наци|mord|selbstmord|vergewaltig|terror|uccid|ammazz|suicid|violaci[oó]n|suicidio|matar|estupro|suic[ií]dio)\b/i,
  },
  {
    id: "religion_insult",
    severity: "review",
    pattern:
      /\b(ислам\s+(?:туп|дурац|лож)|христиан\w*\s+(?:туп|дурац|лож)|allah\s+(?:fake|stupid)|jesus\s+(?:fake|stupid)|muslim[s]?\s+(?:are\s+)?(?:terror|idiot)|christian[s]?\s+(?:are\s+)?(?:idiot|stupid))\b/i,
  },
  {
    id: "politics_war_sensitive",
    severity: "review",
    pattern:
      /\b(ukraine|russia|putin|zelensky|biden|trump|hamas|israel|palestine|war crime|украин|росси|путин|зеленск|хамас|израил|палестин|krieg|russland|ukraine)\b/i,
  },
];

function asText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(asText).join("\n");
  if (typeof value === "object") return Object.values(value).map(asText).join("\n");
  return String(value);
}

function compact(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function shouldSuppressFlag(deckId, checkId, text) {
  if (checkId === "politics_war_sensitive" && /^(christian|christian-quotes-en)$/.test(deckId)) {
    // Biblical references to Israel inside explicitly Christian decks are religious context, not
    // contemporary politics. Other checks still apply to these decks.
    return /\bIsrael\b/i.test(text);
  }
  if (checkId === "politics_war_sensitive" && deckId === "pack:static-facts-de-superadmin") {
    return /Baikalsee|Russland/i.test(text);
  }
  if (checkId === "violence_self_harm_extremism" && /^(fact-es|pack:static-facts-es-superadmin)$/.test(deckId)) {
    return /El rape vive|café es en realidad|Los antiguos egipcios adoraban tanto a los gatos|atrapar y matar insectos|matar insectos|suficiente veneno|matar instantáneamente/i.test(
      text,
    );
  }
  if (checkId === "explicit_sexual" && deckId === "fact-it") {
    return /pesci pagliaccio|cambio di sesso/i.test(text);
  }
  if (checkId === "violence_self_harm_extremism" && deckId === "pack:chistes-es-public-domain") {
    return /\bterror\b/i.test(text);
  }
  return false;
}

function sourceLedger(deckId) {
  if (isPackDeckId(deckId)) return { status: "custom_pack", note: "custom pack JSON; inspect pack metadata/templates manually" };
  let dir = "";
  try {
    dir = getDeck(deckId).dir;
  } catch {
    return { status: "unknown_deck" };
  }
  const file = resolve(ROOT, dir, "sources.json");
  if (!existsSync(file)) return { status: "missing", file };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    const text = asText(parsed).toLowerCase();
    if (/review|required|unknown|unclear|не\s*доказ|требует|manual/i.test(text)) return { status: "review", file };
    const hasRights =
      /cc0|cc-by|cc by|public domain|wikimedia|wikiquote|project-owned|original|rights|licensed|generated/.test(text);
    return { status: hasRights ? "documented" : "review", file };
  } catch (e) {
    return { status: "invalid_json", file, error: e instanceof Error ? e.message : String(e) };
  }
}

function packRows(deckId) {
  const id = deckId.slice(5);
  const file = resolve(ROOT, "data/packs", `${id}.json`);
  if (!existsSync(file)) return [];
  const pack = JSON.parse(readFileSync(file, "utf8"));
  return (pack.cards ?? []).map((card, index) => ({
    deckId,
    itemIndex: index,
    title: pack.name || id,
    text: asText(card?.values ?? card),
  }));
}

function builtInRows(db, deckId) {
  const items = db
    .prepare("SELECT item_index, item_key, pack_no, title, text, chars, video_file, payload_json FROM content_items WHERE deck_id = ? ORDER BY item_index")
    .all(deckId)
    .map((row) => {
      if (row.payload_json) {
        try {
          const item = JSON.parse(row.payload_json);
          return {
            ...item,
            id: Number(row.item_index),
            itemKey: item.itemKey || String(row.item_key || ""),
          };
        } catch {
          /* fall through to column values */
        }
      }
      return {
        id: Number(row.item_index),
        itemKey: String(row.item_key || ""),
        pack: Number(row.pack_no) || 1,
        title: String(row.title ?? ""),
        text: String(row.text ?? ""),
        chars: Number(row.chars) || 0,
        videoFile: row.video_file ? String(row.video_file) : undefined,
      };
    });
  return filterSafetyPrunedItems(deckId, items).map((item) => ({
    deckId,
    itemIndex: Number(item.id ?? 0),
    title: String(item.title ?? ""),
    text: compact(`${item.title ?? ""}\n${item.text ?? ""}\n${JSON.stringify(item)}`),
  }));
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
db.exec("PRAGMA query_only = ON");

const deckIds = db
  .prepare(
    `SELECT DISTINCT deck_id
       FROM accounts, json_each(accounts.source_decks)
      WHERE accounts.user_id = (SELECT id FROM users WHERE username = 'armen')
      ORDER BY deck_id`,
  )
  .all()
  .map((row) => String(row.deck_id));

function addFlag(flags, row) {
  const text = compact(row.text);
  for (const check of CHECKS) {
    if (!check.pattern.test(text)) continue;
    if (shouldSuppressFlag(row.deckId, check.id, text)) continue;
    flags.push({
      check: check.id,
      severity: check.severity,
      deckId: row.deckId,
      itemIndex: row.itemIndex,
      title: compact(row.title).slice(0, 120),
      sample: text.slice(0, 260),
      ...(row.accountId != null ? { accountId: row.accountId } : {}),
      ...(row.channelName ? { channelName: row.channelName } : {}),
      ...(row.videoId != null ? { videoId: row.videoId } : {}),
    });
    break;
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  owner: "armen",
  decks: [],
  queue: { itemsScanned: 0, flags: [], flagCount: 0, highFlags: 0, reviewFlags: 0 },
  summary: { decks: 0, itemsScanned: 0, queuedItemsScanned: 0, flags: 0, highFlags: 0, reviewFlags: 0 },
};

for (const deckId of deckIds) {
  const rows = isPackDeckId(deckId) ? packRows(deckId) : builtInRows(db, deckId);
  const flags = [];
  for (const row of rows) {
    addFlag(flags, row);
  }
  const highFlags = flags.filter((flag) => flag.severity === "high").length;
  const reviewFlags = flags.length - highFlags;
  report.decks.push({
    deckId,
    itemsScanned: rows.length,
    sourceLedger: sourceLedger(deckId),
    flags: flags.slice(0, 30),
    flagCount: flags.length,
    highFlags,
    reviewFlags,
  });
  report.summary.decks += 1;
  report.summary.itemsScanned += rows.length;
  report.summary.flags += flags.length;
  report.summary.highFlags += highFlags;
  report.summary.reviewFlags += reviewFlags;
}

const queuedRows = db
  .prepare(
    `SELECT v.id AS video_id, v.account_id, a.channel_name, v.deck, v.title, v.text
       FROM videos v
       JOIN accounts a ON a.id = v.account_id
       JOIN users u ON u.id = a.user_id
      WHERE u.username = 'armen'
      ORDER BY a.id, v.id`,
  )
  .all()
  .map((row) => ({
    deckId: String(row.deck ?? ""),
    itemIndex: Number(row.video_id) || 0,
    videoId: Number(row.video_id) || 0,
    accountId: Number(row.account_id) || 0,
    channelName: String(row.channel_name ?? ""),
    title: String(row.title ?? ""),
    text: compact(`${row.title ?? ""}\n${row.text ?? ""}`),
  }));
const queueFlags = [];
for (const row of queuedRows) addFlag(queueFlags, row);
const queueHighFlags = queueFlags.filter((flag) => flag.severity === "high").length;
const queueReviewFlags = queueFlags.length - queueHighFlags;
report.queue = {
  itemsScanned: queuedRows.length,
  flags: queueFlags.slice(0, 100),
  flagCount: queueFlags.length,
  highFlags: queueHighFlags,
  reviewFlags: queueReviewFlags,
};
report.summary.queuedItemsScanned = queuedRows.length;
report.summary.flags += queueFlags.length;
report.summary.highFlags += queueHighFlags;
report.summary.reviewFlags += queueReviewFlags;

mkdirSync(resolve(ROOT, "tmp"), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${OUT}`);
console.log(JSON.stringify(report.summary, null, 2));

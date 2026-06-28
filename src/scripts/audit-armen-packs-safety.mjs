#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDeck, isPackDeckId } from "../anecdotes/decks.ts";

const ROOT = process.cwd();
const DB_PATH = process.env.DATABASE_PATH || resolve(ROOT, "data/app.db");
const OUT = resolve(ROOT, "temp/armen-pack-safety-audit.json");

const CHECKS = [
  {
    id: "protected_class_slur",
    severity: "high",
    pattern:
      /\b(nigg|faggot|tranny|kike|chink|spic(?!\s*&\s*span)|negroes|neger|zigeuner|kanake|schwuchtel|пидор|ниггер|хач|жид|чурк|даун|дебил|кретин|урод)\b/i,
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

const db = new DatabaseSync(DB_PATH, { readOnly: true });
db.exec("PRAGMA query_only = ON");

const deckIds = db
  .prepare(
    `SELECT DISTINCT deck_id
       FROM (
         SELECT json_each.value AS deck_id
           FROM accounts, json_each(accounts.source_decks)
          WHERE accounts.user_id = (SELECT id FROM users WHERE username = 'armen')
         UNION
         SELECT json_each.value AS deck_id
           FROM accounts, json_each(accounts.long_video_decks)
          WHERE accounts.user_id = (SELECT id FROM users WHERE username = 'armen')
       )
      ORDER BY deck_id`,
  )
  .all()
  .map((row) => String(row.deck_id));

const report = {
  generatedAt: new Date().toISOString(),
  owner: "armen",
  decks: [],
  summary: { decks: 0, itemsScanned: 0, flags: 0, highFlags: 0, reviewFlags: 0 },
};

for (const deckId of deckIds) {
  const rows = isPackDeckId(deckId)
    ? packRows(deckId)
    : db
        .prepare("SELECT item_index, title, text, payload_json FROM content_items WHERE deck_id = ? ORDER BY item_index")
        .all(deckId)
        .map((row) => ({
          deckId,
          itemIndex: Number(row.item_index),
          title: String(row.title ?? ""),
          text: compact(`${row.title ?? ""}\n${row.text ?? ""}\n${row.payload_json ?? ""}`),
        }));
  const flags = [];
  for (const row of rows) {
    const text = compact(row.text);
    for (const check of CHECKS) {
      if (!check.pattern.test(text)) continue;
      flags.push({
        check: check.id,
        severity: check.severity,
        itemIndex: row.itemIndex,
        title: compact(row.title).slice(0, 120),
        sample: text.slice(0, 260),
      });
      break;
    }
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

mkdirSync(resolve(ROOT, "temp"), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(`wrote ${OUT}`);
console.log(JSON.stringify(report.summary, null, 2));

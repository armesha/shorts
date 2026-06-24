// Assemble the final deck from the agents' selections. Reads corpora/islamic/sel/*.jsonl
// (ids + theme chosen by workflow agents) and the exact-Arabic pool, dedups, length-bands,
// balances by section, applies a family-safe devotional filter, caps at CAP
// → writes data/islamic/cards.json (+ index.json).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";

const REPO = "/home/davtian/Documents/shorts";
const OUT = `${REPO}/corpora/islamic`;
const SEL = `${OUT}/sel`;
const CAP = Number(process.env.ISLAMIC_PACK_CAP || 800);

const BLOCKED_ARABIC =
  /(قَاتِل|قَتَل|قَتْل|جِهَاد|جَاهِد|حَرْب|ٱقْتُل|اقْتُل|يُقَاتِل|الكافرين|كَافِر|كُفَّار|منافق|مُنَافِق|لعن|لَعْن|انتقام|عذاب|جهنم|النار|سقر|وَيْل|ويل|غضب|السيف|قتال|قاتل|اقتل|قتل|حرب|جهاد|كافر|كفار|المشركين|مشرك|العدو|الأعداء)/;
const BLOCKED_ENGLISH =
  /(fight|kill|war|battle|jihad|enemy|enemies|disbeliev|unbeliev|hypocrite|curse|hell|fire|punish|wrath|torment|sword|polytheist|idolater|revenge)/i;

function isFamilySafe(item) {
  return !BLOCKED_ARABIC.test(item.arabic || "") && !BLOCKED_ENGLISH.test(`${item.ref_en || ""} ${item.theme || ""}`);
}

function devotionalTheme(item) {
  const text = `${item.arabic || ""} ${item.ref_en || ""}`;
  if (/اغفر|غفر|forgiv/i.test(text)) return "forgiveness";
  if (/ارحم|رحم|mercy/i.test(text)) return "mercy";
  if (/الحمد|شكر|grat/i.test(text)) return "gratitude";
  if (/رزق|rizq|sustenance/i.test(text)) return "rizq";
  if (/علم|know/i.test(text)) return "knowledge";
  if (/صبر|sabr|patien/i.test(text)) return "sabr";
  if (/هدى|اهد|guid/i.test(text)) return "guidance";
  if (/صلاة|salah|prayer/i.test(text)) return "salah";
  if (/ذكر|dhikr|remember/i.test(text)) return "dhikr";
  if (/أعوذ|protect/i.test(text)) return "protection";
  if (/ربنا|dua|hisn/i.test(text) || item.type === "dua") return "dua";
  if (/الرحمن|رحيم|mercy/i.test(text)) return "mercy";
  if (/آمن|إيمان|faith/i.test(text)) return "iman";
  return item.sec || item.type || "devotional";
}

const pool = JSON.parse(readFileSync(`${OUT}/pool.json`, "utf8"));

const picks = [];
if (existsSync(SEL)) {
  for (const f of readdirSync(SEL).filter((x) => x.endsWith(".jsonl"))) {
    for (const line of readFileSync(`${SEL}/${f}`, "utf8").split("\n")) {
      const s = line.trim();
      if (!s) continue;
      try {
        const o = JSON.parse(s);
        if (o && o.id && pool[o.id]) picks.push({ id: o.id, theme: String(o.theme || "").toLowerCase().slice(0, 24) });
      } catch { /* skip non-JSON lines */ }
    }
  }
}

// dedup by id
const byId = new Map();
for (const p of picks) if (!byId.has(p.id)) byId.set(p.id, p);
let items = [...byId.values()].map((p) => ({ ...pool[p.id], theme: p.theme }));

// length band (fits a card; not over-long)
items = items.filter((x) => x.len >= 40 && x.len <= 600 && isFamilySafe(x));

// dedup by normalized Arabic (same text reached via different ids / repeated dua)
const seen = new Set();
items = items.filter((x) => {
  const k = x.arabic.replace(/\s+/g, "").slice(0, 90);
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

// balance: round-robin across sections so the deck is a good mix, cap at CAP
const bySec = {};
for (const x of items) (bySec[x.sec] ??= []).push(x);
const order = ["hadith", "dua", "famous", "memorized", "juzamma"];
for (const k of Object.keys(bySec)) if (!order.includes(k)) order.push(k);
const final = [];
let added = true;
while (final.length < CAP && added) {
  added = false;
  for (const k of order) {
    const a = bySec[k];
    if (a && a.length) { final.push(a.shift()); added = true; if (final.length >= CAP) break; }
  }
}

// top up to CAP from the rest of the pool (banded + deduped) if the agents under-picked
if (final.length < CAP) {
  const usedIds = new Set(final.map((x) => x.id));
  const rest = Object.values(pool)
    .filter((x) => x.len >= 40 && x.len <= 600 && isFamilySafe(x) && !usedIds.has(x.id))
    .filter((x) => {
      const k = x.arabic.replace(/\s+/g, "").slice(0, 90);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const restBySec = {};
  for (const x of rest) (restBySec[x.sec] ??= []).push(x);
  let add = true;
  while (final.length < CAP && add) {
    add = false;
    for (const k of order) {
      const a = restBySec[k];
      if (a && a.length) { final.push({ ...a.shift(), theme: "" }); add = true; if (final.length >= CAP) break; }
    }
  }
  for (const x of final) if (!x.theme) x.theme = devotionalTheme(x);
}

for (const x of final) if (!x.theme) x.theme = devotionalTheme(x);

const cards = final.map((x) => ({ type: x.type, arabic: x.arabic, ref: x.ref_ar, ref_en: x.ref_en, theme: x.theme }));
mkdirSync(`${REPO}/data/islamic`, { recursive: true });
writeFileSync(`${REPO}/data/islamic/cards.json`, JSON.stringify(cards, null, 1));
const lens = cards.map((c) => [...c.arabic].length);
writeFileSync(
  `${REPO}/data/islamic/index.json`,
  JSON.stringify({ total: cards.length, packs: 1, packSize: cards.length, range: [Math.min(...lens), Math.max(...lens)] }),
);

const byType = cards.reduce((m, c) => ((m[c.type] = (m[c.type] || 0) + 1), m), {});
const bySecCount = final.reduce((m, c) => ((m[c.sec] = (m[c.sec] || 0) + 1), m), {});
console.log(`cards=${cards.length} byType=${JSON.stringify(byType)} bySection=${JSON.stringify(bySecCount)}`);
console.log(`raw picks=${picks.length} uniqueIds=${byId.size}`);

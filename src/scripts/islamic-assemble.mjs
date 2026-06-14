// Assemble the final deck from the agents' selections. Reads corpora/islamic/sel/*.jsonl
// (ids + theme chosen by the Sonnet agents) and the exact-Arabic pool, dedups, length-bands,
// balances by section, caps at 500 → writes data/islamic/cards.json (+ index.json).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";

const REPO = "/home/davtian/Documents/shorts";
const OUT = `${REPO}/corpora/islamic`;
const SEL = `${OUT}/sel`;
const CAP = 500;

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
items = items.filter((x) => x.len >= 40 && x.len <= 600);

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
    .filter((x) => x.len >= 40 && x.len <= 600 && !usedIds.has(x.id))
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
  for (const x of final) if (!x.theme) x.theme = x.sec;
}

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

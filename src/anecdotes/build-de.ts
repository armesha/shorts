import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalize } from "./build.ts";
import { getDeck } from "./decks.ts";

// Builds the German "Deutsche Witze" deck from the Schlechtewitzefront SQL dump (MIT, ~162k jokes).
// Source: https://github.com/JohannesBauer97/Schlechtewitzefront (witze.sql). NSFW-heavy → filter hard.
const deck = getDeck("de");
const SRC = resolve(process.cwd(), deck.source); // local-assets/corpora/witze.sql
const OUT_DIR = resolve(process.cwd(), deck.dir); // data/anecdotes-de

// Aggressive German profanity / NSFW / slur blocklist (roots). Advertiser-safety first.
const BLOCK = new RegExp(
  [
    "fick", "arsch", "schei[sß]", "kacke", "kotz", "pisse", "pinkel", "fotze", "muschi",
    "schwanz", "penis", "vagina", "titt", "möse", "moese", "hure", "nutte", "schlampe",
    "bordell", "wichs", "sperma", "porno", "orgasm", "bums", "poppen", "blasen",
    "geil", "schwul", "lesb", "\\banal", "blowjob", "sextreff", "votze", "kondom",
    "nazi", "hitler", "judensau", "\\bjud", "neger", "nigg", "schwuchtel", "spasti",
    "behindert", "krüppel", "krueppel", "\\bmongo", "missgeburt", "kanake", "zigeuner",
    "vergewaltig", "selbstmord", "suizid",
    "@", "\\*\\*+",
  ].join("|"),
  "i",
);

// Site chatter / meta-posts (voting banter, admin) — not real jokes.
const META =
  /\bvotes?\b|dschungelcamp|daumen\s*(hoch|runter)|registrier|als n[äa]chstes macht|bekannteste dort|\bspam\b/i;

function sqlUnescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => {
    if (c === "n") return "\n";
    if (c === "r") return "";
    if (c === "t") return " ";
    if (c === "0" || c === "Z") return "";
    return c; // \' → ' , \" → " , \\ → \
  });
}

function safeCp(n: number): string {
  try {
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  } catch {
    return "";
  }
}

// The joke text stores characters as HTML entities (&#252;=ü …); decode (twice, in case double-encoded).
function decodeEntities(s: string): string {
  let out = s;
  for (let pass = 0; pass < 2 && out.includes("&"); pass++) {
    out = out
      .replace(/&#(\d+);/g, (_, n: string) => safeCp(Number(n)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => safeCp(parseInt(h, 16)))
      .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">").replace(/&nbsp;/gi, " ").replace(/&hellip;/gi, "…")
      .replace(/&euro;/gi, "€").replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—")
      .replace(/&szlig;/gi, "ß").replace(/&auml;/g, "ä").replace(/&ouml;/g, "ö")
      .replace(/&uuml;/g, "ü").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö")
      .replace(/&Uuml;/g, "Ü").replace(/&amp;/gi, "&");
  }
  return out;
}

/** Parse the SQL dump → decode → normalize → dedupe → drop NSFW/artifacts. Clean joke strings. */
export function loadCleanWitze(src = SRC): string[] {
  const raw = readFileSync(src, "utf8");
  // Each row: (id, veri, votes, 'user', 'datum', 'witz') — capture the 6th (witz) string.
  const re =
    /\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*'(?:[^'\\]|\\.)*'\s*,\s*'(?:[^'\\]|\\.)*'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\)/g;
  const out: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const t = normalize(decodeEntities(sqlUnescape(m[1])));
    if (!t) continue;
    if (/[<>{}]|https?:|www\./i.test(t)) continue; // markup / links
    if (BLOCK.test(t) || META.test(t)) continue;
    const key = t.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function main() {
  const MIN = Number(process.env.ANEK_MIN ?? 150);
  const MAX = Number(process.env.ANEK_MAX ?? 400);
  const BUILD = process.argv.includes("--build");
  const clean = loadCleanWitze();
  const lens = clean.map((a) => a.length).sort((x, y) => x - y);
  const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] ?? 0;
  const inRange = clean.filter((a) => a.length >= MIN && a.length <= MAX).length;
  console.log("=== GERMAN WITZE ANALYSIS ===");
  console.log(`clean (deduped, filtered): ${clean.length}`);
  console.log(`len pct: p10=${at(0.1)} p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)} p90=${at(0.9)} max=${lens[lens.length - 1] ?? 0}`);
  console.log(`range [${MIN}..${MAX}]: ${inRange}`);
  if (BUILD) {
    // Cap to a generous, repo-lean count, spread evenly across the corpus (variety, deterministic).
    const CAP = Number(process.env.ANEK_CAP ?? 10000);
    const pool = clean.filter((a) => a.length >= MIN && a.length <= MAX);
    const step = Math.max(1, Math.floor(pool.length / CAP));
    const selected = pool.filter((_, i) => i % step === 0).slice(0, CAP);
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
    const PACK = 100;
    let packs = 0;
    for (let i = 0; i < selected.length; i += PACK) {
      packs++;
      const items = selected.slice(i, i + PACK).map((text, j) => ({
        id: i + j + 1,
        pack: packs,
        text,
        chars: text.length,
        title: "",
      }));
      writeFileSync(
        resolve(OUT_DIR, `pack-${String(packs).padStart(3, "0")}.json`),
        JSON.stringify(items, null, 1),
      );
    }
    writeFileSync(
      resolve(OUT_DIR, "index.json"),
      JSON.stringify({ total: selected.length, packs, packSize: PACK, range: [MIN, MAX] }, null, 2),
    );
    console.log(`=== BUILT ${selected.length} into ${packs} pack(s) at ${OUT_DIR} ===`);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();

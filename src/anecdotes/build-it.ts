import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalize } from "./build.ts";
import { getDeck } from "./decks.ts";

// Builds the Italian "Barzellette Italiane" deck from the UsenetArchiveIT barzellette newsgroup
// (NDJSON). Source: huggingface.co/datasets/mrinaldi/UsenetArchiveIT. Needs sig/quote stripping,
// mojibake repair, NSFW filtering — Usenet is unmoderated.
const deck = getDeck("it");
const SRC = resolve(process.cwd(), deck.source); // corpora/it-barzellette.jsonl
const OUT_DIR = resolve(process.cwd(), deck.dir); // data/anecdotes-it

// Italian NSFW / slur blocklist (roots). Advertiser-safety first.
const BLOCK =
  /(\bcazz|cul[oi]\b|\bmerd|\bcag(a|o|h|ano|ato|ata|are|ando|ne)|puttan|\btroi[ae]|\bfiga\b|scopa(re|ta|to)|chiavar|porno|pisci|vaffa|stronz|coglion|minchia|frocio|\bnegr[oi]\b|terrone|\bsesso\b|pompin|sborr|scoreggi|\bsega\b|\btett[ei]\b|\bpene\b|vagina|incul|zoccola|fa(re|cendo)\s+l'?amore|amplesso|\borgasm|@|\*\*+)/i;

// Usenet meta / forum chatter / promo footers / reply-date headers (not jokes).
const META =
  /\bnewsgroup\b|cross.?post|\bquotare\b|\bnews:|MPSDR|\bspam\b|dr\.?\s*zap|\bN\.G\.\b|\bNG\b|glossario|off.?topic|\bOT\b|ricordare a tutti|\b(lun|mar|mer|gio|ven|sab|dom|mon|tue|wed|thu|fri|sat|sun),?\s+\d{1,2}\s+\w+\s+\d{4}/i;

// Conversational chatter markers (replies, opinions, laughter, sign-offs) — not standalone jokes.
const CHATTER =
  /\bha scritto\b|nel messaggio|indirizzo|\be-?mail\b|quest[oa]\s+(post|gruppo|thread|messaggi)|\b(ihi|ahah|hihi|eheh|ihih|hahah)|secondo me|sono d'accordo|\bimho\b/i;

// Common UTF-8-misread-as-Latin1 mojibake → correct accented chars.
function fixMojibake(s: string): string {
  return s
    .replace(/Ã©/g, "é").replace(/Ã¨/g, "è").replace(/Ã /g, "à").replace(/Ã¹/g, "ù")
    .replace(/Ã²/g, "ò").replace(/Ã¬/g, "ì").replace(/Ã§/g, "ç").replace(/Ã‰/g, "É")
    .replace(/Ã€/g, "À").replace(/Ãˆ/g, "È").replace(/Ã™/g, "Ù").replace(/Ã'/g, "Ò")
    .replace(/Â°/g, "°").replace(/Â»/g, "»").replace(/Â«/g, "«").replace(/Â/g, "");
}

function cleanPost(text: string): string {
  let t = String(text || "").replace(/\r/g, "");
  const sig = t.indexOf("\n-- \n"); // strip Usenet signature
  if (sig >= 0) t = t.slice(0, sig);
  t = fixMojibake(t);
  const lines = t.split("\n").filter((ln) => {
    const l = ln.trim();
    if (!l) return true;
    if (/^(>|\||:)/.test(l)) return false; // quoted reply line
    if (/(ha scritto|hai scritto|scrive|scriveva|wrote)\s*:/i.test(l)) return false; // attribution
    if (/news:|message-id|<[^>]+@[^>]+>/i.test(l)) return false;
    return true;
  });
  return normalize(lines.join("\n"));
}

interface Post {
  text?: string;
  title?: string;
}

/** Parse NDJSON → strip sig/quotes → fix mojibake → normalize → dedupe → drop NSFW/broken. */
export function loadCleanBarzellette(src = SRC): string[] {
  const raw = readFileSync(src, "utf8");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let obj: Post;
    try {
      obj = JSON.parse(line) as Post;
    } catch {
      continue;
    }
    if (/^\s*re\s*[:\-]/i.test(obj.title ?? "")) continue; // reply = discussion, not a fresh joke
    const t = cleanPost(obj.text ?? "");
    if (!t || t.includes("�")) continue; // empty or broken encoding
    if (/[ąćčďęěğĥıİĺľłńņňŕřśšťůźżž]/i.test(t)) continue; // foreign letters = mis-encoded post
    if (/[<>{}]|https?:|www\.|@/i.test(t)) continue;
    if (/^\s*\.\./.test(t)) continue; // continuation/chatter fragment
    if (BLOCK.test(t) || META.test(t) || CHATTER.test(t)) continue;
    const key = t.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function main() {
  const MIN = Number(process.env.ANEK_MIN ?? 120);
  const MAX = Number(process.env.ANEK_MAX ?? 400);
  const CAP = Number(process.env.ANEK_CAP ?? 10000);
  const BUILD = process.argv.includes("--build");
  const clean = loadCleanBarzellette();
  const lens = clean.map((a) => a.length).sort((x, y) => x - y);
  const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))] ?? 0;
  const inRange = clean.filter((a) => a.length >= MIN && a.length <= MAX).length;
  console.log("=== ITALIAN BARZELLETTE ANALYSIS ===");
  console.log(`clean (deduped, filtered): ${clean.length}`);
  console.log(`len pct: p10=${at(0.1)} p25=${at(0.25)} p50=${at(0.5)} p75=${at(0.75)} p90=${at(0.9)} max=${lens[lens.length - 1] ?? 0}`);
  console.log(`range [${MIN}..${MAX}]: ${inRange}`);
  if (BUILD) {
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

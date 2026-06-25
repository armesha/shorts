// Fetch public-domain NASA visualization clips for the space montage pack.
// Source: NASA Image & Video Library (images-api.nasa.gov) — public domain.
// For each topic in topics.json: search videos, rank toward visualizations
// (away from talking-head/host series), download a ~medium mp4 into
// temp/space-build/src/<id>.mp4, and record metadata to temp/space-build/sources.json.
//
// Idempotent: already-downloaded ids are skipped.
//   node src/scripts/space-montage/fetch-sources.mjs
//   node src/scripts/space-montage/fetch-sources.mjs --ids mars_dust,saturn_rings
//   node src/scripts/space-montage/fetch-sources.mjs --skip-existing-deck
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const SRC_DIR = path.join(ROOT, "temp/space-build/src");
const META = path.join(ROOT, "temp/space-build/sources.json");
fs.mkdirSync(SRC_DIR, { recursive: true });

const args = process.argv.slice(2);
const idsArg = (() => {
  const i = args.indexOf("--ids");
  return i >= 0 ? new Set((args[i + 1] || "").split(",").map((s) => s.trim()).filter(Boolean)) : null;
})();
const skipExistingDeck = args.includes("--skip-existing-deck");
const deckIds = (() => {
  if (!skipExistingDeck) return new Set();
  try {
    const deck = JSON.parse(fs.readFileSync(path.join(ROOT, "data/space/videos.json"), "utf8"));
    return new Set(deck.map((item) => path.basename(String(item.file || ""), path.extname(String(item.file || "")))));
  } catch {
    return new Set();
  }
})();
const allTopics = JSON.parse(fs.readFileSync(path.join(HERE, "topics.json"), "utf8"));
const topics = allTopics.filter((topic) => (!idsArg || idsArg.has(topic.id)) && !deckIds.has(topic.id));
const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, "utf8")) : {};
if (!topics.length) {
  console.log("No topics selected.");
  process.exit(0);
}

const enc = (u) => encodeURI(u.replace(/^http:/, "https:"));
async function j(url) {
  const r = await fetch(url, { headers: { "user-agent": "shorts-factory/1.0 (space pack)" } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
function ffdur(f) {
  try { return parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", f]).toString().trim()) || 0; } catch { return 0; }
}

const BAD = /(we asked|nasa expert|sciencecast|science live|interview|briefing|press|episode|podcast|q&a|tour of|administrator|this week|@nasa|town hall|hearing|anniversary|crew-?\d|astronaut.*return|launch coverage|replay|news conference)/i;
const GOOD = /(simulation|visualization|visualisation|animation|flythrough|fly-?over|fly-?by|render|model|orbit|data|hubble|webb|spitzer|chandra|reveals?|spots?|captures?|sheds light|illustration|concept|spins?|forms?|collision|merger|eruption|nebula|galaxy|spiral)/i;

const usedNasaIds = new Set(Object.values(meta).map((m) => m?.nasaId).filter(Boolean));

async function pickAndDownload(topic) {
  const dst = path.join(SRC_DIR, `${topic.id}.mp4`);
  if (meta[topic.id]?.ok && fs.existsSync(dst) && fs.statSync(dst).size > 200000) return { id: topic.id, skipped: true };
  let items = [];
  try { items = (await j(`https://images-api.nasa.gov/search?q=${encodeURIComponent(topic.query)}&media_type=video`)).collection?.items || []; }
  catch (e) { meta[topic.id] = { ok: false, error: `search ${e.message}` }; return { id: topic.id, ok: false }; }
  const ranked = items.map((it) => {
    const d = it.data?.[0] || {};
    const t = `${d.title || ""} ${d.description || ""}`;
    let s = 0;
    if (GOOD.test(t)) s += 2;
    if (/GSFC|JPL|Goddard|Jet Propulsion/i.test(`${d.center} ${d.secondary_creator || ""}`)) s += 1;
    if (BAD.test(d.title || "")) s -= 6;
    if (usedNasaIds.has(d.nasa_id)) s -= 10;
    return { it, d, s };
  }).sort((a, b) => b.s - a.s);

  for (const cand of ranked.slice(0, 8)) {
    if (cand.s < 0) break;
    const d = cand.d;
    if (usedNasaIds.has(d.nasa_id)) continue;
    let assets = [];
    try { assets = await j(cand.it.href); } catch { continue; }
    const mp4s = assets.filter((u) => /\.mp4($|\?)/i.test(u));
    const url = mp4s.find((u) => /~medium\.mp4/i.test(u)) || mp4s.find((u) => /~large\.mp4/i.test(u)) || mp4s.find((u) => /~mobile\.mp4/i.test(u)) || mp4s[0];
    if (!url) continue;
    try { execFileSync("curl", ["-sS", "-L", "--max-time", "180", "-o", dst, enc(url)]); } catch { continue; }
    const size = fs.existsSync(dst) ? fs.statSync(dst).size : 0;
    const dur = size > 200000 ? ffdur(dst) : 0;
    if (dur < 8) { try { fs.unlinkSync(dst); } catch {} continue; }
    usedNasaIds.add(d.nasa_id);
    meta[topic.id] = {
      ok: true, nasaId: d.nasa_id, subject: topic.subject,
      nasaTitle: d.title || "", description: (d.description || "").replace(/\s+/g, " ").slice(0, 900),
      center: d.center || "", credit: d.secondary_creator || d.photographer || `NASA${d.center ? "/" + d.center : ""}`,
      srcDuration: Math.round(dur), srcUrl: enc(url), file: `${topic.id}.mp4`,
    };
    fs.writeFileSync(META, JSON.stringify(meta, null, 2));
    return { id: topic.id, ok: true, nasaId: d.nasa_id, dur: Math.round(dur), title: d.title };
  }
  meta[topic.id] = { ok: false, error: "no suitable visualization found" };
  fs.writeFileSync(META, JSON.stringify(meta, null, 2));
  return { id: topic.id, ok: false };
}

// limited concurrency
const CONC = 4;
const queue = [...topics];
let active = 0;
const results = [];
await new Promise((resolve) => {
  const tick = () => {
    if (!queue.length && active === 0) return resolve();
    while (active < CONC && queue.length) {
      const t = queue.shift();
      active++;
      pickAndDownload(t).then((r) => {
        results.push(r);
        const m = meta[t.id];
        console.log(`${r.skipped ? "skip" : r.ok ? "OK  " : "FAIL"} ${t.id.padEnd(22)} ${m?.ok ? `${m.srcDuration}s ${String(m.nasaTitle).slice(0, 50)}` : m?.error || ""}`);
      }).catch((e) => { console.log(`ERR  ${t.id} ${e.message}`); })
        .finally(() => { active--; tick(); });
    }
  };
  tick();
});
fs.writeFileSync(META, JSON.stringify(meta, null, 2));
const ok = Object.values(meta).filter((m) => m?.ok).length;
console.log(`\nDONE: ${ok}/${topics.length} sources ready -> ${META}`);

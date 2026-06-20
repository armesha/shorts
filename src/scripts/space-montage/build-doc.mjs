// Build "documentary cut" space Shorts: cut a fragment of a FREE-LICENSE narrated documentary
// (e.g. NASA ScienceCasts, public domain), KEEP its original narrator audio, and burn karaoke
// subtitles transcribed straight from the documentary's own .srt (no whisper, no added voice).
// Full-bleed 1080x1920, short source credit top-left, subtitles in the mobile-safe zone.
//
//   node src/scripts/space-montage/build-doc.mjs            # build all in docs.json
//   node src/scripts/space-montage/build-doc.mjs --only blackholes_myth --no-sync
//
// Spec: temp/space-build/docs.json = [{ id, title, src, srt, start, end, corner, credit, zoom? }]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const BUILD = path.join(ROOT, "temp/space-build");
const DOC = path.join(BUILD, "doc");
const CAP_DIR = path.join(BUILD, "cap");
const ADMIN = path.join(ROOT, "data/output/admin-demos");
const SPACE_FACT = path.join(ROOT, "assets/fact-videos/space");
const SPACE_DECK = path.join(ROOT, "data/space/videos.json");
for (const d of [CAP_DIR, ADMIN, SPACE_FACT]) fs.mkdirSync(d, { recursive: true });
const args = process.argv.slice(2);
const onlyId = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1] : null; })();
const NO_SYNC = args.includes("--no-sync");
const CHROME = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => fs.existsSync(p));
const specs = JSON.parse(fs.readFileSync(path.join(BUILD, "docs.json"), "utf8"));

const ff = (a) => { const r = spawnSync("ffmpeg", a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error("ffmpeg: " + (r.stderr || "").slice(-500)); };
const ffprobeNum = (f, q) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", q, "-of", "default=nw=1:nk=1", f]).toString().trim()) || 0;

// ---------- SRT ----------
function srtTime(t) { const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000) : 0; }
function parseSrt(file) {
  const txt = fs.readFileSync(file, "utf8").replace(/\r/g, "");
  const cues = [];
  for (const block of txt.split(/\n\n+/)) {
    const lines = block.split("\n").filter(Boolean);
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->");
    const text = lines.slice(ti + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) cues.push({ start: srtTime(a), end: srtTime(b), text });
  }
  return cues;
}
const SKIP = /^\[?\s*(music|applause|sound|noise|silence)\s*\]?$|presented by|science@nasa/i;
// words within [start,end] window, shifted to 0, distributing each cue's words across its time
// (FALLBACK only — imprecise even-distribution; the precise path is ElevenLabs forced-alignment below)
function wordsFromCues(cues, start, end) {
  const out = [];
  for (const c of cues) {
    if (c.end <= start || c.start >= end) continue;
    if (SKIP.test(c.text.trim())) continue;
    const cs = Math.max(c.start, start), ce = Math.min(c.end, end);
    const ws = c.text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
    if (!ws.length) continue;
    const span = Math.max(0.3, ce - cs), per = span / ws.length;
    ws.forEach((w, i) => out.push({ text: w, start: cs - start + i * per, end: cs - start + (i + 1) * per }));
  }
  return out;
}

// ---------- PRECISE word timing via ElevenLabs forced-alignment ----------
// Align the WHOLE source audio to its full .srt transcript ONCE (cached); free (no TTS-char cost).
const ALIGN = path.join(BUILD, "align"); fs.mkdirSync(ALIGN, { recursive: true });
function readKeys() {
  const raw = [process.env.ELEVENLABS_API_KEYS || "", process.env.ELEVENLABS_API_KEY || "",
    ...Object.entries(process.env).filter(([n]) => /^ELEVENLABS_API_KEY_\d+$/.test(n)).map(([, v]) => v || "")].join(",");
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter((x) => x.startsWith("sk_")))];
}
async function alignSource(srcFile, srtFile) {
  const cache = path.join(ALIGN, srcFile.replace(/\.[^.]+$/, "") + ".json");
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  const cues = parseSrt(path.join(DOC, srtFile));
  const transcript = cues.filter((c) => !/^\[.*\]$/.test(c.text.trim()) && !/presented by|science@nasa/i.test(c.text)).map((c) => c.text).join(" ").replace(/\s+/g, " ").trim();
  if (transcript.length < 10) return null;
  const mp3 = path.join(ALIGN, "_tmp.mp3");
  try { execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(DOC, srcFile), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-q:a", "5", mp3]); } catch { return null; }
  for (const key of readKeys()) {
    try {
      const fd = new FormData();
      fd.append("file", new Blob([fs.readFileSync(mp3)], { type: "audio/mpeg" }), "a.mp3");
      fd.append("text", transcript);
      const r = await fetch("https://api.elevenlabs.io/v1/forced-alignment", { method: "POST", headers: { "xi-api-key": key }, body: fd });
      if (r.ok) {
        const j = await r.json();
        const words = (j.words || []).filter((w) => w.text && w.text.trim()).map((w) => ({ text: w.text.trim(), start: w.start, end: w.end }));
        if (words.length) { const out = { words }; fs.writeFileSync(cache, JSON.stringify(out)); return out; }
      }
      if (![401, 402, 429].includes(r.status)) break; // real error, not key-quota — stop trying keys
    } catch {}
  }
  return null;
}
function wordsInWindow(words, start, end) {
  const out = [];
  for (const w of words) {
    const mid = (w.start + w.end) / 2;
    if (mid < start || mid >= end) continue;
    out.push({ text: w.text, start: Math.max(0, w.start - start), end: Math.max(0.08, w.end - start) });
  }
  return out;
}
const ENDS_SENT = (t) => /[.!?]["”']?$/.test(t || "");
// snap the requested [start,end] to the nearest clean sentence boundaries using aligned word times
function snapWindow(words, start, end) {
  let s = start, e = end;
  for (let i = 0; i < words.length; i++) {
    const startsSent = i === 0 || ENDS_SENT(words[i - 1].text);
    if (startsSent && words[i].start >= start - 2.5 && words[i].start <= start + 4.5) { s = Math.max(0, words[i].start - 0.12); break; }
  }
  for (let i = words.length - 1; i >= 0; i--) {
    if (ENDS_SENT(words[i].text) && words[i].end <= end + 2.5 && words[i].end >= e - 6) { e = words[i].end + 0.18; break; }
  }
  return e - s >= 8 ? [s, e] : [start, end];
}

// ---------- captions (Animal-Heroes karaoke, mobile-safe zone) ----------
const WHITE = "&H00FFFFFF";
function captionCss() {
  return `*{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1080px;height:1920px;background:transparent;overflow:hidden}
  .stage{position:absolute;inset:0}
  .capwrap{position:absolute;left:96px;right:150px;top:1140px;height:360px;display:flex;align-items:flex-start;justify-content:center}
  .cap{font-family:Impact,'Lato','Arial Black','DejaVu Sans',sans-serif;font-weight:900;font-size:64px;line-height:1.16;
       color:#fff;text-align:center;text-wrap:balance;letter-spacing:.4px;
       -webkit-text-stroke:5px #0a0a0a;paint-order:stroke fill;
       text-shadow:0 5px 0 #000,0 9px 18px rgba(0,0,0,.92),0 0 30px rgba(0,0,0,.7)}
  .cap .ln{display:block}
  .cap .w{display:inline-block;padding:0 5px}
  /* original Space-pack karaoke style: white text, ACTIVE word yellow (no box), same heavy outline */
  .cap .w.on{color:#ffd21e}
  .srccorner{position:absolute;left:40px;top:44px;font-family:'Lato','DejaVu Sans',Arial,sans-serif;font-weight:800;
       font-size:34px;color:#fff;letter-spacing:.4px;padding:8px 20px;border-radius:12px;
       background:rgba(0,0,0,.42);text-shadow:0 2px 6px #000}`;
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function paginate(words) {
  const MAXL = 3, MAXW = 3, MAXC = 18; const pages = []; let pg = [], ln = [], ch = 0;
  const el = () => { if (ln.length) { pg.push(ln); ln = []; ch = 0; } };
  const ep = () => { el(); if (pg.length) { pages.push(pg); pg = []; } };
  for (const w of words) { const wl = w.text.length; if (ln.length && (ln.length >= MAXW || ch + 1 + wl > MAXC)) el(); if (pg.length >= MAXL && ln.length === 0) ep(); ln.push(w); ch += (ch ? 1 : 0) + wl; }
  ep(); pages.forEach((p, i) => p.flat().forEach((w) => { w._page = i; })); return pages;
}
function capHtml(page, active, corner) {
  const body = page ? `<div class="capwrap"><div class="cap" id="cap">${page.map((l) => `<span class="ln">${l.map((w) => `<span class="w${w === active ? " on" : ""}">${esc(w.text)}</span>`).join(" ")}</span>`).join("")}</div></div>` : "";
  const corn = corner ? `<div class="srccorner">${esc(corner)}</div>` : "";
  const fit = page ? `<script>var c=document.getElementById('cap');if(c){var b=c.parentElement,fs=64;while(fs>38&&(c.scrollWidth>b.clientWidth||c.scrollHeight>b.clientHeight)){fs-=2;c.style.fontSize=fs+'px';}}</script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${captionCss()}</style></head><body><div class="stage">${body}${corn}</div>${fit}</body></html>`;
}
async function renderCaps(page, id, words, pages, corner, totalDur) {
  const dir = path.join(CAP_DIR, `doc_${id}`); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const frames = [];
  const first = words.length ? Math.max(0, words[0].start) : 0;
  if (first > 0.06) { const blank = path.join(dir, "blank.png"); await page.setContent(capHtml(null, null, corner), { waitUntil: "load" }); await page.screenshot({ path: blank, omitBackground: true, clip: { x: 0, y: 0, width: 1080, height: 1920 } }); frames.push({ png: blank, dur: first }); }
  for (let i = 0; i < words.length; i++) {
    const w = words[i], png = path.join(dir, `w${String(i).padStart(3, "0")}.png`);
    await page.setContent(capHtml(pages[w._page], w, corner), { waitUntil: "load" });
    await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    const end = i < words.length - 1 ? words[i + 1].start : totalDur;
    frames.push({ png, dur: Math.max(0.06, end - w.start) });
  }
  const list = path.join(dir, "frames.txt"); let t = "ffconcat version 1.0\n";
  for (const f of frames) t += `file '${f.png}'\nduration ${f.dur.toFixed(3)}\n`;
  if (frames.length) t += `file '${frames[frames.length - 1].png}'\n`;
  fs.writeFileSync(list, t); return list;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

async function buildOne(browser, spec) {
  const src = path.join(DOC, spec.src), srt = path.join(DOC, spec.srt);
  if (!fs.existsSync(src) || !fs.existsSync(srt)) { console.log(`SKIP ${spec.id}: missing src/srt`); return null; }
  const aligned = await alignSource(spec.src, spec.srt);
  let start = +spec.start, end = +spec.end;
  if (aligned) { const [s2, e2] = snapWindow(aligned.words, start, end); start = s2; end = e2; }
  const dur = Math.min(58, end - start);
  console.log(`\n== ${spec.id} :: ${spec.title} (${start.toFixed(1)}-${end.toFixed(1)}s)`);
  let words = [], mode = "srt-fallback";
  if (aligned) { words = wordsInWindow(aligned.words, start, end); if (words.length) mode = "forced-alignment"; }
  if (!words.length) words = wordsFromCues(parseSrt(srt), start, end);
  if (!words.length) { console.log(`  no words in window`); return null; }
  console.log(`  timing: ${mode} (${words.length} words)`);
  const totalDur = Math.min(dur, (words.at(-1)?.end || dur));
  const pages = paginate(words);
  const page = await browser.newPage();
  let caps; try { caps = await renderCaps(page, spec.id, words, pages, spec.corner || "NASA", totalDur); } finally { await page.close(); }
  const z = spec.zoom && spec.zoom >= 1 ? spec.zoom : 1;
  const out = path.join(ADMIN, `${spec.id}.mp4`);
  ff(["-y", "-ss", start.toFixed(2), "-i", src, "-t", dur.toFixed(2), "-f", "concat", "-safe", "0", "-i", caps,
    "-filter_complex",
    `[0:v]scale=${Math.round(1080 * z)}:${Math.round(1920 * z)}:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[bg];[1:v]fps=30,format=rgba,setpts=PTS-STARTPTS[cap];[bg][cap]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]`,
    "-map", "[v]", "-map", "0:a", "-t", dur.toFixed(2), "-r", "30",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2", out]);
  ff(["-y", "-ss", Math.min(2, dur / 3).toFixed(2), "-i", out, "-frames:v", "1", "-q:v", "3", path.join(ADMIN, `${spec.id}.jpg`)]);
  const fd = ffprobeNum(out, "format=duration");
  console.log(`  built ${spec.id}: ${fmt(fd)} (${words.length} words, audio kept)`);
  return { id: spec.id, title: spec.title, dur: fmt(fd), file: `space/${spec.id}.mp4`, text: spec.title };
}

function syncDeck(built) {
  for (const b of built) fs.copyFileSync(path.join(ADMIN, `${b.id}.mp4`), path.join(SPACE_FACT, `${b.id}.mp4`));
  let deck = fs.existsSync(SPACE_DECK) ? JSON.parse(fs.readFileSync(SPACE_DECK, "utf8")) : [];
  const byF = new Map(deck.map((v) => [v.file, v]));
  for (const b of built) byF.set(b.file, { file: b.file, title: b.title, text: b.text });
  fs.writeFileSync(SPACE_DECK, JSON.stringify([...byF.values()], null, 2));
  const manPath = path.join(ADMIN, "manifest.json");
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf8")) : { packs: [] };
  let pack = man.packs.find((p) => p.id === "space"); if (!pack) { pack = { id: "space", items: [] }; man.packs.push(pack); }
  const now = new Date().toISOString(); const items = new Map(pack.items.map((it) => [it.id, it]));
  for (const b of built) { const ex = items.get(b.id); items.set(b.id, { id: b.id, title: b.title, theme: "space", dur: b.dur, createdAt: ex?.createdAt || now, updatedAt: now }); }
  pack.items = [...items.values()]; fs.writeFileSync(manPath, JSON.stringify(man, null, 2));
  console.log(`\nsynced ${built.length} doc clips (deck total ${[...byF.values()].length})`);
}

if (args.includes("--sync-only")) {
  const built = specs.filter((s) => fs.existsSync(path.join(ADMIN, `${s.id}.mp4`)))
    .map((s) => ({ id: s.id, title: s.title, dur: fmt(ffprobeNum(path.join(ADMIN, `${s.id}.mp4`), "format=duration")), file: `space/${s.id}.mp4`, text: s.title }));
  syncDeck(built);
  console.log(`sync-only DONE: ${built.length}`);
  process.exit(0);
}
if (!CHROME) { console.error("no chrome"); process.exit(1); }
const list = onlyId ? specs.filter((s) => s.id === onlyId) : specs;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"] });
const built = [];
try { for (const s of list) { try { const b = await buildOne(browser, s); if (b) built.push(b); } catch (e) { console.log(`FAIL ${s.id}: ${String(e.message).slice(0, 300)}`); } } }
finally { await browser.close(); }
if (built.length && !NO_SYNC) syncDeck(built);
console.log(`\nDONE: ${built.length}/${list.length}`);

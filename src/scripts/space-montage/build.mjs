// Build space montage Shorts: NASA/SVS source clip -> reframe to 1080x1920 with blurred
// pad (no black bars) -> ElevenLabs (Matilda) voiceover -> per-word karaoke captions
// rendered as transparent PNGs via puppeteer in the Animal-Heroes style (heavy white text,
// thick dark outline, active word in a gold rounded box) -> source credit -> sync into the
// `space` deck. Public-domain visualization footage; ElevenLabs is the only TTS.
//
//   node src/scripts/space-montage/build.mjs                 # build all ready ids
//   node src/scripts/space-montage/build.mjs --only black_hole_disk --no-sync
//
// Inputs:
//   temp/space-build/sources.json            { id: { file, credit, source, title, description, subject } }
//   src/scripts/space-montage/narration.json [ { id, title, narration } ]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const BUILD = path.join(ROOT, "temp/space-build");
const SRC_DIR = path.join(BUILD, "src");
const VOICE_DIR = path.join(BUILD, "voice");
const CAP_DIR = path.join(BUILD, "cap");
const BASE_DIR = path.join(BUILD, "base");
const ADMIN = path.join(ROOT, "data/output/admin-demos");
const SPACE_FACT = path.join(ROOT, "assets/fact-videos/space");
const SPACE_DECK = path.join(ROOT, "data/space/videos.json");
for (const d of [VOICE_DIR, CAP_DIR, BASE_DIR, ADMIN, SPACE_FACT]) fs.mkdirSync(d, { recursive: true });

const args = process.argv.slice(2);
const onlyId = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1] : null; })();
const idsArg = (() => { const i = args.indexOf("--ids"); return i >= 0 ? (args[i + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : null; })();
const NO_SYNC = args.includes("--no-sync");
const NOVOICE = args.includes("--novoice"); // silent subtitle-only Short: no TTS, no audio, captions paced by reading speed
const READ_PER_WORD = 0.46; // seconds per word for novoice caption pacing

const sources = JSON.parse(fs.readFileSync(path.join(BUILD, "sources.json"), "utf8"));
const narrationArr = JSON.parse(fs.readFileSync(path.join(HERE, "narration.json"), "utf8"));
const narration = Object.fromEntries(narrationArr.map((n) => [n.id, n]));

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "XrExE9yKIg1WjnnlVkGX"; // Matilda
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const OUT_FMT = "mp3_44100_128";
const CHROME = ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => fs.existsSync(p));

// ---------- ElevenLabs ----------
function readKeys() {
  const raw = [process.env.ELEVENLABS_API_KEYS || "", process.env.ELEVENLABS_API_KEY || "",
    ...Object.entries(process.env).filter(([n]) => /^ELEVENLABS_API_KEY_\d+$/.test(n)).map(([, v]) => v || "")].join(",");
  return [...new Set(raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const scrub = (s, key) => String(s).split(key).join("[secret]").replace(/sk_[A-Za-z0-9_]+/g, "[secret]").slice(0, 200);

async function tts(id, text, force = false) {
  const mp3 = path.join(VOICE_DIR, `${id}.mp3`);
  const al = path.join(VOICE_DIR, `${id}.alignment.json`);
  if (!force && fs.existsSync(mp3) && fs.existsSync(al)) return { mp3, alignment: JSON.parse(fs.readFileSync(al, "utf8")), cached: true };
  const keys = readKeys();
  if (!keys.length) throw new Error("no ElevenLabs keys");
  const body = { text, model_id: MODEL_ID, language_code: "en",
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.0, use_speaker_boost: true } };
  let last = "";
  for (const [ki, key] of keys.entries()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let res;
      try {
        res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=${OUT_FMT}`, {
          method: "POST", headers: { accept: "application/json", "content-type": "application/json", "xi-api-key": key }, body: JSON.stringify(body),
        });
      } catch (e) { last = `net ${scrub(e.message, key)}`; await sleep(600); continue; }
      const txt = await res.text();
      if (res.ok) {
        const j = JSON.parse(txt);
        if (!j.audio_base64) throw new Error("no audio_base64");
        fs.writeFileSync(mp3, Buffer.from(j.audio_base64, "base64"));
        const alignment = j.normalized_alignment || j.alignment || null;
        fs.writeFileSync(al, JSON.stringify(alignment, null, 2));
        console.log(`  tts ${id}: key#${ki + 1} ...${key.slice(-4)} (${text.length} chars)`);
        return { mp3, alignment, cached: false };
      }
      last = `${res.status} ${scrub(txt, key)}`;
      if (res.status === 429) { await sleep(900 + attempt * 1500); continue; }
      if ([400, 401, 402, 403, 422].includes(res.status)) break; // dead/quota -> next key
      await sleep(500 + attempt * 800);
    }
  }
  throw new Error(`TTS failed for ${id}: ${last}`);
}

// ---------- words from EL alignment ----------
function wordsFromAlignment(al, fallbackText) {
  const chars = al?.characters || [];
  const st = al?.character_start_times_seconds || [];
  const en = al?.character_end_times_seconds || [];
  const words = [];
  let cur = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) { if (cur) { words.push(cur); cur = null; } continue; }
    if (!cur) cur = { text: "", start: st[i], end: en[i] };
    cur.text += c;
    if (Number.isFinite(en[i])) cur.end = en[i];
    if (!Number.isFinite(cur.start) && Number.isFinite(st[i])) cur.start = st[i];
  }
  if (cur) words.push(cur);
  let t = 0;
  for (const w of words) { if (!Number.isFinite(w.start)) w.start = t; if (!Number.isFinite(w.end) || w.end <= w.start) w.end = w.start + 0.28; t = w.end; }
  return words.length ? words : fallbackText.split(/\s+/).map((w, i) => ({ text: w, start: i * 0.32, end: i * 0.32 + 0.28 }));
}

// novoice: time words by reading speed (no TTS / no audio)
function wordsFromText(text, perWord = READ_PER_WORD) {
  const ws = (text || "").trim().split(/\s+/).filter(Boolean);
  let t = 0; const out = [];
  for (const w of ws) { out.push({ text: w, start: t, end: t + perWord }); t += perWord; }
  return out;
}
// short source label for the top-left corner credit
function shortSource(src) {
  const s = `${src.source || ""} ${src.credit || ""} ${src.pageUrl || ""}`;
  if (/svs\.gsfc|\bSVS\b/i.test(s)) return "NASA SVS";
  if (/\bESO\b|eso\.org/i.test(s)) return "ESO";
  if (/USGS/i.test(s)) return "NASA / USGS";
  if (/ESA|hubble|webb/i.test(s)) return "NASA / ESA";
  if (/NASA|nasa\.gov/i.test(s)) return "NASA";
  return (src.source || "NASA").slice(0, 24);
}

// ---------- pagination (Animal-Heroes feel: up to 3 lines, ~3 words/line) ----------
function paginate(words) {
  const MAX_LINES = 3, MAX_WORDS_LINE = 3, MAX_CHARS_LINE = 16;
  const pages = [];
  let page = [], line = [], chars = 0;
  const endLine = () => { if (line.length) { page.push(line); line = []; chars = 0; } };
  const endPage = () => { endLine(); if (page.length) { pages.push(page); page = []; } };
  for (const w of words) {
    const wl = w.text.length;
    if (line.length && (line.length >= MAX_WORDS_LINE || chars + 1 + wl > MAX_CHARS_LINE)) endLine();
    if (page.length >= MAX_LINES && line.length === 0) endPage();
    line.push(w); chars += (chars ? 1 : 0) + wl;
  }
  endPage();
  // annotate each word with its page index and the page's word list
  pages.forEach((pg, pi) => pg.flat().forEach((w) => { w._page = pi; }));
  return pages;
}

// ---------- caption HTML (transparent; matches Animal-Heroes karaoke style) ----------
function captionCss() {
  return `
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1080px;height:1920px;background:transparent;overflow:hidden}
  .stage{position:absolute;inset:0}
  .capwrap{position:absolute;left:46px;right:46px;top:1016px;height:392px;display:flex;align-items:center;justify-content:center}
  .cap{font-family:Impact,'Lato','Arial Black','DejaVu Sans',sans-serif;font-weight:900;font-size:72px;line-height:1.16;
       color:#fff;text-align:center;text-wrap:balance;letter-spacing:.5px;
       -webkit-text-stroke:5px #0a0a0a;paint-order:stroke fill;
       text-shadow:0 5px 0 #000,0 9px 18px rgba(0,0,0,.92),0 0 30px rgba(0,0,0,.7)}
  .cap .ln{display:block}
  .cap .w{display:inline-block;padding:0 4px}
  .cap .w.on{background:#fbbf24;color:#1c1407;border-radius:15px;padding:0 18px;margin:0 2px;
       -webkit-text-stroke:0;text-shadow:none;box-shadow:0 5px 0 rgba(0,0,0,.32),0 0 0 3px rgba(255,255,255,.16)}
  .credit{position:absolute;left:0;right:0;bottom:46px;text-align:center;
       font-family:'DejaVu Sans',Arial,sans-serif;font-weight:600;font-size:25px;color:#dcdcdc;letter-spacing:.3px;
       text-shadow:0 2px 5px #000,0 0 10px #000;opacity:.92;padding:0 60px}
  .srccorner{position:absolute;left:40px;top:44px;font-family:'Lato','DejaVu Sans',Arial,sans-serif;font-weight:800;
       font-size:34px;color:#fff;letter-spacing:.4px;padding:8px 20px;border-radius:12px;
       background:rgba(0,0,0,.42);text-shadow:0 2px 6px #000;backdrop-filter:blur(2px)}`;
}
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function captionHtml(page, activeWord, credit, corner) {
  const body = page
    ? `<div class="capwrap"><div class="cap" id="cap">${page.map((line) =>
        `<span class="ln">${line.map((w) =>
          `<span class="w${w === activeWord ? " on" : ""}">${escHtml(w.text)}</span>`).join(" ")}</span>`).join("")}</div></div>`
    : "";
  const corn = corner ? `<div class="srccorner">${escHtml(corner)}</div>` : "";
  const cr = credit ? `<div class="credit">${escHtml(credit)}</div>` : "";
  // fit-shrink: reduce font until the caption block fits its box width & height
  const fit = `<script>
    var c=document.getElementById('cap');
    if(c){var box=c.parentElement, fs=72;
      while(fs>40 && (c.scrollWidth>box.clientWidth || c.scrollHeight>box.clientHeight)){fs-=2;c.style.fontSize=fs+'px';}
    }
  </script>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${captionCss()}</style></head><body><div class="stage">${body}${corn}${cr}</div>${page ? fit : ""}</body></html>`;
}

// ---------- ffmpeg helpers ----------
const ffdur = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f]).toString().trim()) || 0;
function run(bin, a) { const r = spawnSync(bin, a, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error(`${bin} failed: ${(r.stderr || "").slice(-600)}`); return r; }
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

function srcDims(f) {
  try { const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", f]).toString().trim().split("x").map(Number); return { w, h }; }
  catch { return { w: 16, h: 9 }; }
}
// Detect baked-in letterbox/pillarbox bars (uniform near-black borders) so we can trim them
// before the full-bleed scale. Conservative: only accept a crop that trims 3-38% (real bars),
// never enough to eat genuinely-black space content (which is not a uniform full-width strip).
function detectCrop(srcPath, srcDur) {
  const ss = Math.max(0, Math.min(srcDur * 0.3, 5));
  const r = spawnSync("ffmpeg", ["-ss", ss.toFixed(1), "-i", srcPath, "-t", "4", "-vf", "cropdetect=limit=16:round=2:reset=0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  const ms = [...(r.stderr || "").matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!ms.length) return null;
  const m = ms[ms.length - 1];
  const w = +m[1], h = +m[2], x = +m[3], y = +m[4];
  const { w: sw, h: sh } = srcDims(srcPath);
  if (!sw || !sh || !w || !h) return null;
  const area = (w * h) / (sw * sh);
  if (area >= 0.97 || area < 0.62) return null; // no meaningful bars, or suspiciously large crop
  return `crop=${w}:${h}:${x}:${y},`;
}
function buildBase(srcPath, dur, outPath, startOverride, zoom = 1) {
  const srcDur = ffdur(srcPath);
  let start = 0, loops = 0;
  if (srcDur >= dur) start = startOverride != null ? Math.min(startOverride, Math.max(0, srcDur - dur)) : Math.min(Math.min(srcDur * 0.06, 4), Math.max(0, srcDur - dur));
  else loops = Math.ceil(dur / Math.max(0.5, srcDur)) - 1;
  const deBar = detectCrop(srcPath, srcDur) || "";
  // FULL-BLEED: trim baked-in bars, then scale to COVER (1080*zoom)x(1920*zoom) and centre-crop to
  // 1080x1920 — fills the whole frame, no bars, no seam. zoom>1 pushes a small/round subject (globe,
  // thin sim band) to fill more of the frame. Captions stay legible via their heavy stroke + shadow.
  const z = Number.isFinite(zoom) && zoom >= 1 ? zoom : 1;
  const cw = Math.round(1080 * z), ch = Math.round(1920 * z);
  const fc =
    `[0:v]${deBar}scale=${cw}:${ch}:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[v]`;
  const a = ["-y"];
  if (loops > 0) a.push("-stream_loop", String(loops));
  if (start > 0) a.push("-ss", start.toFixed(2));
  a.push("-i", srcPath, "-an", "-filter_complex", fc, "-map", "[v]", "-t", dur.toFixed(2),
    "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", outPath);
  run("ffmpeg", a);
}

// render per-word transparent caption PNGs, return concat list path + nothing else
async function renderCaptions(page, id, words, pages, credit, totalDur, corner) {
  const dir = path.join(CAP_DIR, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  const frames = []; // {png, dur}
  // initial blank (credit only) until first word
  const flat = words;
  const firstStart = flat.length ? Math.max(0, flat[0].start) : 0;
  if (firstStart > 0.06) {
    const blank = path.join(dir, "blank.png");
    await page.setContent(captionHtml(null, null, credit, corner), { waitUntil: "load" });
    await page.screenshot({ path: blank, omitBackground: true, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    frames.push({ png: blank, dur: firstStart });
  }
  for (let i = 0; i < flat.length; i++) {
    const w = flat[i];
    const pageWords = pages[w._page];
    const png = path.join(dir, `w${String(i).padStart(3, "0")}.png`);
    await page.setContent(captionHtml(pageWords, w, credit, corner), { waitUntil: "load" });
    await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    const end = i < flat.length - 1 ? flat[i + 1].start : totalDur;
    frames.push({ png, dur: Math.max(0.06, end - w.start) });
  }
  // concat list
  const list = path.join(dir, "frames.txt");
  let txt = "ffconcat version 1.0\n";
  for (const f of frames) txt += `file '${f.png}'\nduration ${f.dur.toFixed(3)}\n`;
  if (frames.length) txt += `file '${frames[frames.length - 1].png}'\n`; // repeat last so its duration applies
  fs.writeFileSync(list, txt);
  return list;
}

function composite(basePath, framesList, voicePath, dur, outPath) {
  run("ffmpeg", ["-y", "-i", basePath, "-f", "concat", "-safe", "0", "-i", framesList, "-i", voicePath,
    "-filter_complex", "[1:v]fps=30,format=rgba,setpts=PTS-STARTPTS[cap];[0:v][cap]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]",
    "-map", "[v]", "-map", "2:a", "-t", dur.toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100", outPath]);
}

// novoice: same overlay but no audio track (silent subtitle-only Short)
function compositeSilent(basePath, framesList, dur, outPath) {
  run("ffmpeg", ["-y", "-i", basePath, "-f", "concat", "-safe", "0", "-i", framesList,
    "-filter_complex", "[1:v]fps=30,format=rgba,setpts=PTS-STARTPTS[cap];[0:v][cap]overlay=0:0:eof_action=pass:format=auto,format=yuv420p[v]",
    "-map", "[v]", "-t", dur.toFixed(2),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-an", outPath]);
}

// ---------- per-clip build ----------
async function buildClip(browser, id) {
  const src = sources[id], nar = narration[id];
  if (!src?.file) { console.log(`SKIP ${id}: no source`); return null; }
  if (!nar?.narration) { console.log(`SKIP ${id}: no narration`); return null; }
  const srcPath = path.join(SRC_DIR, src.file);
  if (!fs.existsSync(srcPath)) { console.log(`SKIP ${id}: missing ${src.file}`); return null; }
  const useNovoice = NOVOICE || !!src.novoice; // per-clip silent mode (batch2) OR global --novoice
  console.log(`\n== ${id} :: ${nar.title}${useNovoice ? " [novoice]" : ""}`);
  let words, totalDur, mp3 = null;
  if (useNovoice) {
    words = wordsFromText(nar.narration);
    totalDur = Math.min(58, (words.length ? words[words.length - 1].end : 6) + 0.9);
  } else {
    const r = await tts(id, nar.narration);
    mp3 = r.mp3;
    totalDur = Math.min(58, ffdur(mp3) + 0.5);
    words = wordsFromAlignment(r.alignment, nar.narration);
  }
  const pages = paginate(words);
  const corner = shortSource(src);
  const page = await browser.newPage();
  let framesList;
  try { framesList = await renderCaptions(page, id, words, pages, src.credit || "", totalDur, corner); }
  finally { await page.close(); }
  const basePath = path.join(BASE_DIR, `${id}.mp4`);
  buildBase(srcPath, totalDur, basePath, Number.isFinite(src.startSec) ? src.startSec : null, Number.isFinite(src.zoom) ? src.zoom : 1);
  const outPath = path.join(ADMIN, `${id}.mp4`);
  if (useNovoice) compositeSilent(basePath, framesList, totalDur, outPath);
  else composite(basePath, framesList, mp3, totalDur, outPath);
  const finalDur = ffdur(outPath);
  run("ffmpeg", ["-y", "-ss", Math.min(2.0, finalDur / 3).toFixed(2), "-i", outPath, "-frames:v", "1", "-q:v", "3", path.join(ADMIN, `${id}.jpg`)]);
  console.log(`  built ${id}: ${fmtDur(finalDur)} (${words.length} words) -> ${outPath}`);
  return { id, title: nar.title, dur: fmtDur(finalDur), file: `space/${id}.mp4`, text: nar.title };
}

// ---------- deck sync ----------
function syncDeck(built) {
  for (const b of built) fs.copyFileSync(path.join(ADMIN, `${b.id}.mp4`), path.join(SPACE_FACT, `${b.id}.mp4`));
  let deck = fs.existsSync(SPACE_DECK) ? JSON.parse(fs.readFileSync(SPACE_DECK, "utf8")) : [];
  const byFile = new Map(deck.map((v) => [v.file, v]));
  for (const b of built) byFile.set(b.file, { file: b.file, title: b.title, text: b.text });
  deck = [...byFile.values()];
  fs.writeFileSync(SPACE_DECK, JSON.stringify(deck, null, 2));
  const manPath = path.join(ADMIN, "manifest.json");
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf8")) : { packs: [] };
  let pack = man.packs.find((p) => p.id === "space");
  if (!pack) { pack = { id: "space", items: [] }; man.packs.push(pack); }
  const now = new Date(Number(process.env.BUILD_STAMP) || Date.now()).toISOString();
  const items = new Map(pack.items.map((it) => [it.id, it]));
  for (const b of built) { const ex = items.get(b.id); items.set(b.id, { id: b.id, title: b.title, theme: "space", dur: b.dur, createdAt: ex?.createdAt || now, updatedAt: now }); }
  pack.items = [...items.values()];
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2));
  console.log(`\nsynced ${built.length} clips into space deck (deck total ${deck.length})`);
}

// ---------- main ----------
if (args.includes("--sync-only")) {
  const ready = Object.keys(narration).filter((id) => fs.existsSync(path.join(ADMIN, `${id}.mp4`)));
  const built = ready.map((id) => ({ id, title: narration[id].title, dur: fmtDur(ffdur(path.join(ADMIN, `${id}.mp4`))), file: `space/${id}.mp4`, text: narration[id].title }));
  syncDeck(built);
  console.log(`\nsync-only DONE: ${built.length} clips`);
  process.exit(0);
}
if (!CHROME) { console.error("no system Chrome found"); process.exit(1); }
const pool = idsArg || Object.keys(sources);
const ids = onlyId ? [onlyId] : pool.filter((id) => sources[id]?.file && narration[id]?.narration);
console.log(`building ${ids.length} clip(s)${onlyId ? ` [only ${onlyId}]` : ""}`);
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"] });
const built = [];
try {
  for (const id of ids) {
    try { const b = await buildClip(browser, id); if (b) built.push(b); }
    catch (e) { console.log(`FAIL ${id}: ${String(e.message).slice(0, 400)}`); }
  }
} finally { await browser.close(); }
if (built.length && !NO_SYNC) syncDeck(built);
console.log(`\nDONE: built ${built.length}/${ids.length}`);

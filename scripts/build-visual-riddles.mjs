#!/usr/bin/env node
// Builder for the "visual-riddles" (Вижу Ответ) pack.
//   license-safe puzzle image  ->  card PNG (templates/visual-riddle.html via puppeteer)
//   -> edge-tts Russian narration (.venv-tts)  ->  ffmpeg (narration @100% + quiet looped music) -> 1080x1920 MP4
// Standalone ESM. Run: node scripts/build-visual-riddles.mjs [manifest.json] [--outdir DIR]
// Manifest = [{ id, type, category, title, question, vo?, image }]
//   image = path to the source puzzle image (PD/CC0 only); vo = narration text (defaults to question + CTA).
// Voiceover engine: edge-tts (Microsoft Edge neural voices) — free, no key. VR_VOICE env overrides voice.

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const pexec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = resolve(ROOT, 'templates/visual-riddle.html');
const VENV_PY = resolve(ROOT, '.venv-tts/bin/python');
const AUDIO_DIR = resolve(ROOT, 'assets/audio');
const VOICE = process.env.VR_VOICE || 'ru-RU-DmitryNeural';
const RESERVED_MUSIC = ['memes', 'animal-superheroes', 'packs'];
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus']);
// Banner palette rotates per card (matches the existing pack look).
const BANNERS = ['#f26d5b', '#f5b942', '#e85aa8', '#a7d96a', '#2bb9b0', '#5ec8e8'];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function chromePath() {
  const cands = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge'].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('Chrome/Chromium not found — set CHROME_PATH');
}
function dataUri(p) {
  const ext = extname(p).toLowerCase();
  const mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/png';
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`;
}
async function walkAudio(dir, top) {
  let out = [];
  let ents;
  try { ents = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    if (e.isDirectory()) {
      if (top && RESERVED_MUSIC.includes(e.name)) continue;
      out = out.concat(await walkAudio(resolve(dir, e.name), false));
    } else if (AUDIO_EXT.has(extname(e.name).toLowerCase())) {
      out.push(resolve(dir, e.name));
    }
  }
  return out;
}
async function pickMusic() {
  const all = await walkAudio(AUDIO_DIR, true);
  return all.length ? all[Math.floor(Math.random() * all.length)] : null;
}
async function ffprobeDur(file) {
  const { stdout } = await pexec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', file]);
  return parseFloat(stdout.trim()) || 0;
}

const VR_PREP = resolve(ROOT, 'scripts/_vr-prep.py');
let _pil;
async function hasPIL() {
  if (_pil !== undefined) return _pil;
  try { await pexec(VENV_PY, ['-c', 'import PIL']); _pil = true; } catch { _pil = false; }
  return _pil;
}
// Normalize a source puzzle image for the card frame:
//  - trim its own white margins (so the puzzle fills the frame instead of floating tiny),
//  - stretch contrast (faded vintage engravings read poorly on a phone),
//  - cap at 1200px long side (keeps the inlined data URI small; Chrome setContent times out on huge scans).
// Uses Pillow (.venv-tts) for the white-trim; falls back to ffmpeg scale-only if Pillow is absent.
async function prepImage(src, work) {
  if (existsSync(VENV_PY) && await hasPIL()) {
    await pexec(VENV_PY, [VR_PREP, src, work, '1200'], { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    return;
  }
  const isJpg = /\.(jpg|jpeg)$/i.test(work);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', src,
    '-vf', "scale='min(1200,iw)':'min(1200,ih)':force_original_aspect_ratio=decrease:flags=lanczos"];
  if (isJpg) args.push('-q:v', '3');
  args.push(work);
  await pexec('ffmpeg', args, { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
}

async function renderCard(spec, outPng) {
  let html = await readFile(TEMPLATE, 'utf8');
  html = html
    .replaceAll('{{BANNER}}', BANNERS[(spec.bannerIdx ?? 0) % BANNERS.length])
    .replaceAll('{{CATEGORY}}', esc(spec.category))
    .replaceAll('{{TITLE}}', esc(spec.title))
    .replaceAll('{{QUESTION}}', esc(spec.question))
    .replaceAll('{{CTA}}', esc(spec.cta || process.env.VR_CTA || 'Пиши ответ в комментариях'))
    .replace('{{IMAGE}}', dataUri(spec.image));
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction('window.__fitted === true', { timeout: 6000 }).catch(() => {});
    await mkdir(dirname(outPng), { recursive: true });
    const buf = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    await writeFile(outPng, buf);
  } finally { await browser.close(); }
}

async function narrate(text, outMp3) {
  await mkdir(dirname(outMp3), { recursive: true });
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await pexec(VENV_PY, ['-m', 'edge_tts', '--voice', VOICE, '--text', text, '--write-media', outMp3],
        { timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
      const d = await ffprobeDur(outMp3);
      if (d > 0) return d;
      throw new Error('edge-tts produced empty audio');
    } catch (e) {
      lastErr = e;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2500));
    }
  }
  throw lastErr;
}

// Assemble card PNG + narration (+ quiet looped music) into a static 1080x1920 MP4.
async function assemble(png, voiceMp3, music, outMp4, voiceDur) {
  const dur = Math.max(7, +(voiceDur + 1.8).toFixed(2));
  const fadeOut = Math.max(0, dur - 1.0).toFixed(2);
  const vStatic = `[0:v]setsar=1[v]`;
  const aMix = `[1:a]volume=1.0[vo];[2:a]volume=0.10,atrim=0:${dur},afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=1.0[m];[vo][m]amix=inputs=2:duration=longest:normalize=0[a]`;
  const aSolo = `[1:a]volume=1.0[a]`;
  await mkdir(dirname(outMp4), { recursive: true });
  const run = async (vf) => {
    const inputs = ['-y', '-loop', '1', '-framerate', '30', '-i', png, '-i', voiceMp3];
    if (music) inputs.push('-stream_loop', '-1', '-i', music);
    const filter = `${vf};${music ? aMix : aSolo}`;
    await pexec('ffmpeg', [...inputs, '-filter_complex', filter, '-map', '[v]', '-map', '[a]',
      '-t', String(dur), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-movflags', '+faststart', outMp4], { timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  };
  await run(vStatic);
  return dur;
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--outdir');
  const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : resolve(ROOT, 'tmp/visual-riddle-demos/sample-out');
  const manifestPath = resolve(args.find((a) => a.endsWith('.json')) || resolve(ROOT, 'tmp/visual-riddle-demos/build-manifest.json'));
  const specs = JSON.parse(await readFile(manifestPath, 'utf8'));
  await mkdir(outDir, { recursive: true }); // ensure output dir exists before prepImage writes the first work file
  const REUSE = process.env.VR_REUSE === '1'; // reuse existing card PNG + voice mp3, re-assemble only (e.g. to toggle zoom)
  console.log(`[vr] ${specs.length} card(s) | chrome=${chromePath()} | voice=${VOICE} | out=${outDir}`);
  const results = [];
  for (let i = 0; i < specs.length; i++) {
    const s = { bannerIdx: i, ...specs[i] };
    if (!existsSync(s.image)) { console.log(`[vr] SKIP ${s.id}: image missing ${s.image}`); continue; }
    const png = resolve(outDir, `${s.id}.png`);
    const voiceMp3 = resolve(outDir, `${s.id}.voice.mp3`);
    const mp4 = resolve(outDir, `${s.id}.mp4`);
    const vo = s.vo || `${s.question} Пиши ответ в комментариях.`;
    try {
      if (!(REUSE && existsSync(png))) {
        const work = resolve(outDir, `${s.id}.work${/\.(jpg|jpeg)$/i.test(s.image) ? '.jpg' : '.png'}`);
        await prepImage(s.image, work);
        await renderCard({ ...s, image: work }, png);
      }
      let vdur = REUSE && existsSync(voiceMp3) ? await ffprobeDur(voiceMp3) : 0;
      if (!vdur) vdur = await narrate(vo, voiceMp3);
      const music = await pickMusic();
      const dur = await assemble(png, voiceMp3, music, mp4, vdur);
      console.log(`[vr] OK ${s.id}: card+${vdur.toFixed(1)}s voice -> ${dur}s mp4 (music=${music ? music.split('/audio/')[1] : 'none'})`);
      results.push({ id: s.id, png, mp4, dur });
    } catch (e) {
      console.log(`[vr] FAIL ${s.id}: ${e.message}`);
    }
  }
  console.log(`[vr] done: ${results.length}/${specs.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

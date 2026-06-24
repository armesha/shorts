#!/usr/bin/env node
// Builder for the "illusions-en" pack: render each illusion's own html -> seamless-loop 1080x1920 mp4.
// Usage: node scripts/illusions-en/build-en.mjs [manifest.json] [--outdir DIR] [--only id1,id2]
//   Each manifest spec: { id, html (relative to scripts/illusions-en/), title, name, dur, fps }
//   SKIP_EXISTING=1 reuses already-rendered mp4s.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const pexec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

function chromePath() {
  const cands = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('Chrome/Chromium not found — set CHROME_PATH');
}

async function encode(framesDir, outMp4, fps) {
  await mkdir(dirname(outMp4), { recursive: true });
  await pexec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(fps), '-i', resolve(framesDir, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-r', String(fps), '-an', '-movflags', '+faststart', outMp4],
    { timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
}
async function poster(framesDir, outJpg, frame) {
  await pexec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', resolve(framesDir, `f${String(frame).padStart(4, '0')}.png`), '-q:v', '3', outJpg],
    { timeout: 60000 });
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--outdir');
  const outDir = outIdx >= 0 ? resolve(argv[outIdx + 1]) : resolve(ROOT, 'temp/illusions-en/out');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(',')) : null;
  const manifestPath = argv.find((a) => a.endsWith('.json')) || resolve(HERE, 'manifest.json');
  let specs = JSON.parse(await readFile(resolve(manifestPath), 'utf8'));
  if (only) specs = specs.filter((s) => only.has(s.id));

  await mkdir(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  const results = [];
  try {
    for (const spec of specs) {
      const fps = spec.fps || 30, dur = spec.dur || 8, FRAMES = Math.round(dur * fps);
      const mp4 = resolve(outDir, `${spec.id}.mp4`);
      if (process.env.SKIP_EXISTING === '1' && existsSync(mp4)) { console.log(`[il-en] skip ${spec.id} (exists)`); results.push(spec.id); continue; }
      const htmlPath = resolve(HERE, spec.html);
      if (!existsSync(htmlPath)) { console.log(`[il-en] MISS html ${spec.id} -> ${spec.html}`); continue; }
      const t0 = Date.now();
      const page = await browser.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
      await page.goto('file://' + htmlPath, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 8000 });
      const info = await page.evaluate((s) => window.setup(s), { title: spec.title });
      const framesDir = resolve(outDir, `_frames_${spec.id}`);
      await rm(framesDir, { recursive: true, force: true });
      await mkdir(framesDir, { recursive: true });
      for (let f = 0; f < FRAMES; f++) {
        const progress = f / FRAMES;
        const dataUrl = await page.evaluate((p) => window.renderFrame(p), progress);
        const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        await writeFile(resolve(framesDir, `f${String(f).padStart(4, '0')}.png`), buf);
      }
      await page.close();
      if (errs.length) console.log(`[il-en] WARN ${spec.id} page errors: ${errs.slice(0, 3).join(' | ')}`);
      const jpg = resolve(outDir, `${spec.id}.jpg`);
      await encode(framesDir, mp4, fps);
      await poster(framesDir, jpg, Math.floor(FRAMES * 0.18));
      await rm(framesDir, { recursive: true, force: true });
      console.log(`[il-en] OK ${spec.id} (${info.name}, ${dur}s@${fps} ${FRAMES}f, title ${info.lines}ln@${info.px}px) [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
      results.push(spec.id);
    }
  } finally { await browser.close(); }
  console.log(`[il-en] done: ${results.length}/${specs.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

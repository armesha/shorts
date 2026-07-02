#!/usr/bin/env node
// Render TITLELESS base clips (renderBase) for the localized pack. One render per design (type+variant);
// localized titles are overlaid later (compose-publish.mjs), so geometry renders ONCE for all languages.
// Reads matrix.json: [{ id, key, html, variant, dur, fps }]. Output: tmp/illusions-en/base/<id>.mp4 (+ .jpg)
// Usage: node build-base.mjs [matrix.json] [--only id1,id2] ; SKIP_EXISTING=1 reuses existing base mp4s.
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
const BASE = resolve(ROOT, 'tmp/illusions-en/base');
function chromePath() {
  for (const c of [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean)) if (existsSync(c)) return c;
  throw new Error('Chrome not found');
}
async function encode(framesDir, outMp4, fps) {
  await mkdir(dirname(outMp4), { recursive: true });
  await pexec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps),
    '-i', resolve(framesDir, 'f%04d.png'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-r', String(fps), '-an', '-movflags', '+faststart', outMp4],
    { timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  const argv = process.argv.slice(2);
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(',')) : null;
  const matrixPath = argv.find((a) => a.endsWith('.json')) || resolve(HERE, 'matrix.json');
  let specs = JSON.parse(await readFile(resolve(matrixPath), 'utf8'));
  if (only) specs = specs.filter((s) => only.has(s.id));
  await mkdir(BASE, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars'] });
  const done = [];
  try {
    for (const s of specs) {
      const fps = s.fps || 30, dur = s.dur || 8, FRAMES = Math.round(dur * fps);
      const mp4 = resolve(BASE, `${s.id}.mp4`);
      if (process.env.SKIP_EXISTING === '1' && existsSync(mp4)) { console.log(`skip ${s.id}`); done.push(s.id); continue; }
      const htmlPath = resolve(HERE, s.html);
      if (!existsSync(htmlPath)) { console.log(`MISS html ${s.id} -> ${s.html}`); continue; }
      const t0 = Date.now();
      const page = await browser.newPage();
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
      await page.goto('file://' + htmlPath, { waitUntil: 'load' });
      await page.waitForFunction('window.__ready === true', { timeout: 8000 });
      // titleless: force title '' AND apply the variant
      await page.evaluate((v) => window.setup({ title: '', variant: v }), s.variant || {});
      const framesDir = resolve(BASE, `_f_${s.id}`);
      await rm(framesDir, { recursive: true, force: true }); await mkdir(framesDir, { recursive: true });
      for (let f = 0; f < FRAMES; f++) {
        const url = await page.evaluate((p) => window.renderBase(p), f / FRAMES);
        await writeFile(resolve(framesDir, `f${String(f).padStart(4, '0')}.png`), Buffer.from(url.slice('data:image/png;base64,'.length), 'base64'));
      }
      await page.close();
      if (errs.length) console.log(`WARN ${s.id}: ${errs.slice(0, 2).join(' | ')}`);
      await encode(framesDir, mp4, fps);
      await pexec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', resolve(framesDir, `f${String(Math.floor(FRAMES * 0.18)).padStart(4, '0')}.png`), '-q:v', '3', resolve(BASE, `${s.id}.jpg`)], { timeout: 60000 });
      await rm(framesDir, { recursive: true, force: true });
      console.log(`OK ${s.id} (${dur}s@${fps}) [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
      done.push(s.id);
    }
  } finally { await browser.close(); }
  console.log(`build-base done: ${done.length}/${specs.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

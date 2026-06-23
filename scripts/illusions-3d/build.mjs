#!/usr/bin/env node
// Builder for the "illusions-3d" pack: ambiguous rotating 3D particle figures (Necker-cube style).
//   renderer.html (deterministic per-frame canvas)  ->  N PNG frames via headless Chrome
//   -> ffmpeg encode to a seamless-loop 1080x1920 MP4 (no audio).
// Usage: node temp/illusions-3d/build.mjs [manifest.json] [--outdir DIR] [--only id1,id2]
//   DUR (s, default 8), FPS (default 30), PALETTE (override) via env.

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
const RENDERER = resolve(HERE, 'renderer.html');
const DUR = parseFloat(process.env.DUR || '8');
const FPS = parseInt(process.env.FPS || '30', 10);
const FRAMES = Math.round(DUR * FPS);

function chromePath() {
  const cands = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean);
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('Chrome/Chromium not found — set CHROME_PATH');
}

// Default test manifest: 10 distinct figures, each its own Russian "flip-it-with-your-mind" question.
const DEFAULT_SPECS = [
  { id: 'il_01_cube',      shape: 'cube',      title: 'Можешь силой мысли изменить направление вращения?', name: 'Куб Неккера' },
  { id: 'il_02_octa',      shape: 'octa',      title: 'В какую сторону вращается фигура?',                  name: 'Октаэдр' },
  { id: 'il_03_icosa',     shape: 'icosa',     title: 'Заставь её крутиться в обратную сторону — взглядом', name: 'Икосаэдр' },
  { id: 'il_04_dodeca',    shape: 'dodeca',    title: 'Твой мозг сам переворачивает эту фигуру',           name: 'Додекаэдр' },
  { id: 'il_05_stella',    shape: 'stella',    title: 'Влево или вправо? А теперь — наоборот',              name: 'Звёздный тетраэдр' },
  { id: 'il_06_tesseract', shape: 'tesseract', title: 'Сколько измерений ты здесь видишь?',                name: 'Тессеракт' },
  { id: 'il_07_torus',     shape: 'torus',     title: 'У этой фигуры нет ближней стороны. Куда она крутит?', name: 'Тор' },
  { id: 'il_08_mobius',    shape: 'mobius',    title: 'Где у ленты Мёбиуса начало?',                       name: 'Лента Мёбиуса' },
  { id: 'il_09_orbital',   shape: 'orbital',   title: 'Сфера крутится по часовой или против?',             name: 'Орбитальная сфера' },
  { id: 'il_10_tetra',     shape: 'tetra',     title: 'Смотри 8 секунд — и фигура развернётся сама',       name: 'Тетраэдр' },
];

async function encode(framesDir, outMp4) {
  await mkdir(dirname(outMp4), { recursive: true });
  await pexec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-i', resolve(framesDir, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-r', String(FPS), '-an', '-movflags', '+faststart', outMp4],
    { timeout: 240000, maxBuffer: 32 * 1024 * 1024 });
}
async function poster(framesDir, outJpg, frame) {
  await pexec('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', resolve(framesDir, `f${String(frame).padStart(4, '0')}.png`), '-q:v', '3', outJpg],
    { timeout: 60000 });
}

async function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--outdir');
  const outDir = outIdx >= 0 ? resolve(argv[outIdx + 1]) : resolve(ROOT, 'temp/illusions-3d/out');
  const onlyIdx = argv.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(argv[onlyIdx + 1].split(',')) : null;
  const manifestPath = argv.find((a) => a.endsWith('.json'));
  let specs = manifestPath ? JSON.parse(await readFile(resolve(manifestPath), 'utf8')) : DEFAULT_SPECS;
  if (only) specs = specs.filter((s) => only.has(s.id));
  const palOverride = process.env.PALETTE;

  await mkdir(outDir, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  console.log(`[il] ${specs.length} figure(s) | ${DUR}s @ ${FPS}fps = ${FRAMES} frames | out=${outDir}`);
  const results = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto('file://' + RENDERER, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 8000 });

    for (const spec of specs) {
      const t0 = Date.now();
      const mp4 = resolve(outDir, `${spec.id}.mp4`);
      if (process.env.SKIP_EXISTING === '1' && existsSync(mp4)) { console.log(`[il] skip ${spec.id} (exists)`); results.push(spec.id); continue; }
      const info = await page.evaluate((s) => window.setup(s), { ...spec, palette: palOverride || spec.palette });
      const framesDir = resolve(outDir, `_frames_${spec.id}`);
      await rm(framesDir, { recursive: true, force: true });
      await mkdir(framesDir, { recursive: true });
      for (let f = 0; f < FRAMES; f++) {
        const progress = f / FRAMES; // 0..1 (last frame is just before a full turn -> loops to frame 0)
        const dataUrl = await page.evaluate((p) => window.renderFrame(p), progress);
        const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        await writeFile(resolve(framesDir, `f${String(f).padStart(4, '0')}.png`), buf);
      }
      const jpg = resolve(outDir, `${spec.id}.jpg`);
      await encode(framesDir, mp4);
      await poster(framesDir, jpg, Math.floor(FRAMES * 0.18));
      await rm(framesDir, { recursive: true, force: true });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`[il] OK ${spec.id} (${info.name}, title ${info.lines}ln @${info.fontPx}px) -> ${spec.id}.mp4 [${secs}s]`);
      results.push(spec.id);
    }
  } finally { await browser.close(); }
  console.log(`[il] done: ${results.length}/${specs.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

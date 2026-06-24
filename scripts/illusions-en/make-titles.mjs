#!/usr/bin/env node
// Render transparent title-overlay PNGs for every (design, language). renderTitle is host-level
// (illusion-independent), so we load ONE skeleton-v2 page and stamp all titles from it.
// Reads localize.json: { "<designId>": { en, de, it, es, ru } }. Empty/missing title => no PNG (skipped).
// Output: temp/illusions-en/titles/<designId>_<lang>.png
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const TITLES = resolve(ROOT, 'temp/illusions-en/titles');
const HOST = resolve(HERE, 'illusions/spiral.html'); // any skeleton-v2 page exposes renderTitle
function chromePath() {
  for (const c of [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/snap/bin/chromium'].filter(Boolean)) if (existsSync(c)) return c;
  throw new Error('Chrome not found');
}
const LANGS = ['en', 'de', 'it', 'es', 'ru'];

async function main() {
  const locPath = process.argv.find((a) => a.endsWith('.json')) || resolve(HERE, 'localize.json');
  const loc = JSON.parse(await readFile(resolve(locPath), 'utf8'));
  await mkdir(TITLES, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars'] });
  let n = 0, skip = 0;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto('file://' + HOST, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 8000 });
    for (const [id, byLang] of Object.entries(loc)) {
      for (const lang of LANGS) {
        const text = (byLang && byLang[lang] || '').trim();
        if (!text) { skip++; continue; }
        const url = await page.evaluate((t) => window.renderTitle(t), text);
        await writeFile(resolve(TITLES, `${id}_${lang}.png`), Buffer.from(url.slice('data:image/png;base64,'.length), 'base64'));
        n++;
      }
    }
  } finally { await browser.close(); }
  console.log(`make-titles: ${n} title PNGs written, ${skip} skipped (empty)`);
}
main().catch((e) => { console.error(e); process.exit(1); });

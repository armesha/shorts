#!/usr/bin/env node
// Build manifest.json for illusions-en by reading the AUTHORITATIVE SPEC baked into each
// illusions/<key>.html (via window.getSpec()), so titles/dur/fps/light match what the authors finalized.
import { readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ILL = resolve(HERE, 'illusions');
// canonical display order
const ORDER = ['spiral', 'wheel', 'lilac', 'drift', 'cafewall', 'scintgrid', 'afterimage', 'ebbinghaus', 'checkershadow', 'penrose'];

function chromePath() {
  for (const c of [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean)) if (existsSync(c)) return c;
  throw new Error('Chrome not found');
}

const files = (await readdir(ILL)).filter((f) => f.endsWith('.html'));
const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'] });
const specs = [];
try {
  const page = await browser.newPage();
  for (const f of files) {
    const html = resolve(ILL, f);
    await page.goto('file://' + html, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 8000 });
    const s = await page.evaluate(() => window.getSpec());
    specs.push({ id: s.key, html: `illusions/${s.key}.html`, title: s.title ?? '', name: s.name || s.key,
      dur: s.dur || 8, fps: s.fps || 30, light: !!s.light });
  }
} finally { await browser.close(); }

specs.sort((a, b) => {
  const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});
await writeFile(resolve(HERE, 'manifest.json'), JSON.stringify(specs, null, 2) + '\n');
console.log(`manifest.json: ${specs.length} illusions`);
for (const s of specs) console.log(`  ${s.id.padEnd(14)} ${s.dur}s  light=${s.light}  "${s.title}" [${s.name}]`);

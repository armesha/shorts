#!/usr/bin/env node
// Render sample frames of ONE skeleton-v2 illusion at a given VARIANT (for the retrofit workflow).
// Usage: node render-samples-v2.mjs <illusion.html> <outPrefix> [progresses] [variantJSON]
//   progresses: comma list 0..1 (default "0,0.25,0.5,0.75")
//   variantJSON: e.g. '{"palette":"fire","dir":-1,"turns":2,"seed":7,"density":1.3}' (default {} = variant 0)
//   writes <outPrefix>_p<NN>.png
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

function chromePath() {
  for (const c of [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'].filter(Boolean)) if (existsSync(c)) return c;
  throw new Error('Chrome not found');
}

async function main() {
  const [htmlArg, prefixArg, progArg, variantArg] = process.argv.slice(2);
  if (!htmlArg || !prefixArg) { console.error('usage: render-samples-v2.mjs <html> <outPrefix> [progresses] [variantJSON]'); process.exit(2); }
  const html = resolve(htmlArg);
  if (!existsSync(html)) { console.error('no such html: ' + html); process.exit(2); }
  const prefix = resolve(prefixArg);
  await mkdir(dirname(prefix), { recursive: true });
  const progresses = (progArg || '0,0.25,0.5,0.75').split(',').map((s) => parseFloat(s.trim())).filter((n) => !Number.isNaN(n));
  let variant = {};
  if (variantArg) { try { variant = JSON.parse(variantArg); } catch (e) { console.error('bad variantJSON: ' + e.message); process.exit(2); } }

  const browser = await puppeteer.launch({ executablePath: chromePath(), headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.goto('file://' + html, { waitUntil: 'load' });
    await page.waitForFunction('window.__ready === true', { timeout: 8000 });
    const info = await page.evaluate((v) => window.setup({ variant: v }), variant);
    const out = [];
    for (const p of progresses) {
      const dataUrl = await page.evaluate((pp) => window.renderFrame(pp), p);
      const buf = Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
      const file = `${prefix}_p${String(Math.round(p * 100)).padStart(2, '0')}.png`;
      await writeFile(file, buf);
      out.push(file);
    }
    console.log(JSON.stringify({ ok: true, variantApplied: info.variant, frames: out, errors: errs }, null, 2));
    if (errs.length) process.exitCode = 1;
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });

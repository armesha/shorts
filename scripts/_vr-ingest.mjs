#!/usr/bin/env node
// Bridge: visual-riddles sourcing-workflow result -> downloaded images + build-manifest.json + sources.json
//   - Commons Special:FilePath URLs get ?width=1400 (forces a raster even for SVG, caps size)
//   - non-Commons .svg are rasterized with cairosvg (.venv-tts)
//   - every download is validated as a real image via Pillow; failures are skipped + logged
// Usage: node scripts/_vr-ingest.mjs <sourcing.json> [srcDir] [manifestOut] [sourcesOut]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENV_PY = resolve(ROOT, '.venv-tts/bin/python');
const UA = 'Mozilla/5.0 (shorts-factory visual-riddles builder)';
const [, , inPath, srcDirArg, manOut, srcOut] = process.argv;
const srcDir = resolve(srcDirArg || resolve(ROOT, 'temp/visual-riddle-demos/src'));
const manifestOut = resolve(manOut || resolve(ROOT, 'temp/visual-riddle-demos/build-manifest.json'));
const sourcesOut = resolve(srcOut || resolve(ROOT, 'temp/visual-riddle-demos/sources.json'));
mkdirSync(srcDir, { recursive: true });

const raw = JSON.parse(readFileSync(resolve(inPath), 'utf8'));
const collected = raw.result?.collected || raw.collected || (Array.isArray(raw) ? raw : []);

const isCommons = (u) => /commons\.wikimedia\.org\/wiki\/Special:FilePath/i.test(u);
const withWidth = (u) => (isCommons(u) && !/[?&]width=/.test(u) ? u + (u.includes('?') ? '&' : '?') + 'width=1400' : u);

const pilOk = (f) => {
  try { return !!execFileSync(VENV_PY, ['-c', 'from PIL import Image;import sys;print(Image.open(sys.argv[1]).format or "")', f], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim(); }
  catch { return false; }
};
const looksSvg = (f) => {
  try { const b = readFileSync(f).slice(0, 400).toString('utf8').toLowerCase(); return b.includes('<svg') || (b.includes('<?xml') && b.includes('svg')); }
  catch { return false; }
};

function download(url, base) {
  const png = resolve(srcDir, base + '.png');
  const img = resolve(srcDir, base + '.img');
  // Cache: reuse a previously downloaded VALID raster (so a re-run only re-fetches what failed).
  if (existsSync(png) && pilOk(png)) return png;
  if (existsSync(img) && pilOk(img)) return img;
  execFileSync('curl', ['-fsSL', '-A', UA, '--max-time', '90', '--retry', '6', '--retry-delay', '4', '--retry-all-errors', withWidth(url), '-o', img], { stdio: 'pipe' });
  // Detect SVG by CONTENT, not URL extension (openclipart /download/<id> has no .svg suffix).
  if (looksSvg(img)) {
    execFileSync(VENV_PY, ['-c', 'import cairosvg,sys;cairosvg.svg2png(url=sys.argv[1],write_to=sys.argv[2],output_width=1400)', img, png], { stdio: 'pipe' });
    if (!pilOk(png)) throw new Error('svg rasterized but unreadable');
    return png;
  }
  if (!pilOk(img)) throw new Error('not a decodable image');
  return img;
}

const manifest = [];
const sources = [];
let n = 0, ok = 0, fail = 0;
for (const grp of collected) {
  for (const c of (grp.candidates || [])) {
    n++;
    if (n > 1) { try { execFileSync('sleep', ['1.2']); } catch { /* throttle Commons rate-limit */ } }
    const id = 'vrx_' + String(n).padStart(3, '0');
    try {
      const img = download(c.downloadUrl, id);
      manifest.push({ id, type: grp.type, category: c.category || '', title: c.title || '', question: c.question || '', image: img, answer: c.answer || '' });
      sources.push({ id, type: grp.type, title: c.title || '', sourceUrl: c.sourceUrl || '', downloadUrl: c.downloadUrl, license: c.license || '', author: c.author || '' });
      ok++;
    } catch (e) {
      fail++;
      console.log(`SKIP ${id} (${String(c.title || '').slice(0, 32)}): ${String(e.message || e).slice(0, 90)}`);
    }
  }
}
writeFileSync(manifestOut, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(sourcesOut, JSON.stringify(sources, null, 2) + '\n');
console.log(`ingest: ${ok} ok, ${fail} failed -> ${manifest.length} cards. manifest=${manifestOut}`);

#!/usr/bin/env node
// Register accepted visual-riddles batch into the live deck + preview gallery (idempotent).
//   - copies batch-out/<id>.mp4 -> assets/fact-videos/visual-riddles/<id>.mp4   (deck source, read fresh)
//   - card PNG -> data/output/admin-demos/<id>.jpg  (poster) + appends manifest item (/clip-demos)
//   - appends data/visual-riddles/videos.json  (the selectable deck list)
//   - writes data/visual-riddles/sources.json   (committed PD/CC0 license record)
//   - removes the temporary "visual-riddles-samples" gallery pack + its sample_* files
// Usage: node scripts/_vr-register.mjs --cull vrx_018,vrx_022,...
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BATCH = resolve(ROOT, 'temp/visual-riddle-demos/batch-out');
const BUILD_MANIFEST = resolve(ROOT, 'temp/visual-riddle-demos/build-manifest.json');
const SRC_SOURCES = resolve(ROOT, 'temp/visual-riddle-demos/sources.json');
const ASSETS = resolve(ROOT, 'assets/fact-videos/visual-riddles');
const ADMIN = resolve(ROOT, 'data/output/admin-demos');
const VIDEOS_JSON = resolve(ROOT, 'data/visual-riddles/videos.json');
const MANIFEST = resolve(ADMIN, 'manifest.json');
const OUT_SOURCES = resolve(ROOT, 'data/visual-riddles/sources.json');

const cullArg = process.argv[process.argv.indexOf('--cull') + 1] || '';
const CULL = new Set(cullArg.split(',').map((s) => s.trim()).filter(Boolean));

const dur = (f) => {
  const s = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nk=1:nw=1', f]).toString().trim()) || 0;
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
};
const now = new Date().toISOString();

mkdirSync(ASSETS, { recursive: true });
mkdirSync(ADMIN, { recursive: true });
mkdirSync(dirname(VIDEOS_JSON), { recursive: true });

const buildManifest = JSON.parse(readFileSync(BUILD_MANIFEST, 'utf8'));
const srcSources = existsSync(SRC_SOURCES) ? JSON.parse(readFileSync(SRC_SOURCES, 'utf8')) : [];
const srcById = Object.fromEntries(srcSources.map((s) => [s.id, s]));

const videos = JSON.parse(readFileSync(VIDEOS_JSON, 'utf8'));
const haveVideo = new Set(videos.map((v) => v.file));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const pack = manifest.packs.find((p) => p.id === 'visual-riddles');
if (!pack) throw new Error('visual-riddles pack missing in manifest');
const haveItem = new Set(pack.items.map((it) => it.id));

const kept = [];
const sourcesOut = [];
let added = 0;
for (const card of buildManifest) {
  const id = card.id;
  if (CULL.has(id)) continue;
  const mp4 = join(BATCH, `${id}.mp4`);
  const png = join(BATCH, `${id}.png`);
  if (!existsSync(mp4) || !existsSync(png)) { console.log(`MISS ${id}: built files absent`); continue; }
  // deck source mp4
  copyFileSync(mp4, join(ASSETS, `${id}.mp4`));
  // preview poster (jpg) for /clip-demos
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', png, '-q:v', '3', join(ADMIN, `${id}.jpg`)]);
  // also drop the mp4 into admin-demos so /clip-demos can play it
  copyFileSync(mp4, join(ADMIN, `${id}.mp4`));
  const rel = `visual-riddles/${id}.mp4`;
  if (!haveVideo.has(rel)) { videos.push({ file: rel, title: card.title || 'Загадка', text: card.title || 'Загадка' }); haveVideo.add(rel); }
  if (!haveItem.has(id)) { pack.items.push({ id, title: card.title || 'Загадка', theme: 'visual-riddle', dur: dur(mp4), createdAt: now, updatedAt: now }); haveItem.add(id); }
  const s = srcById[id] || {};
  sourcesOut.push({ id, type: card.type || '', title: card.title || '', category: card.category || '', question: card.question || '', answer: card.answer || '', sourceUrl: s.sourceUrl || '', downloadUrl: s.downloadUrl || '', license: s.license || '', author: s.author || '' });
  kept.push(id);
  added++;
}

// Remove the temporary samples gallery pack + its files
const before = manifest.packs.length;
manifest.packs = manifest.packs.filter((p) => p.id !== 'visual-riddles-samples');
if (manifest.packs.length < before) {
  for (const f of readdirSync(ADMIN)) if (/^sample_.*\.(mp4|jpg)$/.test(f)) { try { unlinkSync(join(ADMIN, f)); } catch {} }
}

writeFileSync(VIDEOS_JSON, JSON.stringify(videos, null, 2) + '\n');
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(OUT_SOURCES, JSON.stringify(sourcesOut, null, 2) + '\n');

console.log(`registered: ${added} new cards (culled ${CULL.size}). videos.json total=${videos.length}, manifest visual-riddles items=${pack.items.length}.`);
console.log(`kept ids: ${kept.join(',')}`);

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
const _argv = process.argv.slice(2);
const _argval = (flag, def) => { const i = _argv.indexOf(flag); return i >= 0 ? resolve(_argv[i + 1]) : def; };
const _argstr = (flag, def) => { const i = _argv.indexOf(flag); return i >= 0 ? _argv[i + 1] : def; };
const DECK = _argstr('--deck', 'visual-riddles');
const TITLE = _argstr('--title', 'Вижу Ответ');
const LANG = _argstr('--lang', 'ru');
const BATCH = _argval('--batch', resolve(ROOT, 'temp/visual-riddle-demos/batch-out'));
const BUILD_MANIFEST = _argval('--manifest', resolve(ROOT, 'temp/visual-riddle-demos/build-manifest.json'));
const SRC_SOURCES = _argval('--sources', resolve(ROOT, 'temp/visual-riddle-demos/sources.json'));
const ASSETS = resolve(ROOT, 'assets/fact-videos/' + DECK);
const ADMIN = resolve(ROOT, 'data/output/admin-demos');
const VIDEOS_JSON = resolve(ROOT, 'data/' + DECK + '/videos.json');
const MANIFEST = resolve(ADMIN, 'manifest.json');
const OUT_SOURCES = resolve(ROOT, 'data/' + DECK + '/sources.json');

const cullIdx = process.argv.indexOf('--cull');
const cullArg = cullIdx >= 0 ? process.argv[cullIdx + 1] || '' : '';
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

const videos = existsSync(VIDEOS_JSON) ? JSON.parse(readFileSync(VIDEOS_JSON, 'utf8')) : [];
const haveVideo = new Set(videos.map((v) => v.file));
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
let pack = manifest.packs.find((p) => p.id === DECK);
if (!pack) { pack = { id: DECK, title: TITLE, lang: LANG, items: [] }; manifest.packs.push(pack); }
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
  // /clip-demos uses a FLAT admin-demos namespace shared across decks → suffix non-default decks so a
  // localized card (same vrx_/vry_ id) doesn't clobber the original's poster/mp4.
  const posterId = DECK === 'visual-riddles' ? id : `${id}-${LANG}`;
  // deck source mp4 — per-deck dir, plain id (used by channel generation)
  copyFileSync(mp4, join(ASSETS, `${id}.mp4`));
  // preview poster + mp4 for /clip-demos — flat dir, deck-unique id
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', png, '-q:v', '3', join(ADMIN, `${posterId}.jpg`)]);
  copyFileSync(mp4, join(ADMIN, `${posterId}.mp4`));
  const rel = `${DECK}/${id}.mp4`;
  if (!haveVideo.has(rel)) { videos.push({ file: rel, title: card.title || 'Загадка', text: card.title || 'Загадка' }); haveVideo.add(rel); }
  if (!haveItem.has(posterId)) { pack.items.push({ id: posterId, title: card.title || 'Загадка', theme: 'visual-riddle', dur: dur(mp4), createdAt: now, updatedAt: now }); haveItem.add(posterId); }
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

// Merge sources.json (append new ids; never drop earlier batches' license records).
const existingOut = existsSync(OUT_SOURCES) ? JSON.parse(readFileSync(OUT_SOURCES, 'utf8')) : [];
const haveSrc = new Set(existingOut.map((s) => s.id));
for (const s of sourcesOut) if (!haveSrc.has(s.id)) existingOut.push(s);

writeFileSync(VIDEOS_JSON, JSON.stringify(videos, null, 2) + '\n');
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(OUT_SOURCES, JSON.stringify(existingOut, null, 2) + '\n');

console.log(`registered: ${added} new cards (culled ${CULL.size}). videos.json total=${videos.length}, manifest visual-riddles items=${pack.items.length}.`);
console.log(`kept ids: ${kept.join(',')}`);

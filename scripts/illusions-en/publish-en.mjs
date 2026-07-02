#!/usr/bin/env node
// Publish the illusions-en pack (run AFTER build-en renders tmp/illusions-en/out/).
// For each clip:  mux quiet music into the silent master ->
//   data/output/admin-demos/<id>.mp4 (+ .jpg poster)   -> /clip-demos gallery
//   assets/fact-videos/illusions-en/<id>.mp4           -> channel deck source
//   videos.json entry {file,title,text}                -> data/illusions-en/videos.json
//   manifest pack item                                 -> admin-demos/manifest.json
// Idempotent; only the illusions-en manifest entry is replaced.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUTDIR = resolve(ROOT, 'tmp/illusions-en/out');
const ADMIN = resolve(ROOT, 'data/output/admin-demos');
const MANIFEST = resolve(ADMIN, 'manifest.json');
const MUSIC = resolve(ROOT, 'assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus');
const DECK = 'illusions-en', PACK_TITLE = 'Optical Illusions', LANG = 'en';

if (!existsSync(MUSIC)) { console.error('missing music'); process.exit(1); }
const manifestPath = process.argv.find((a) => a.endsWith('.json')) || resolve(HERE, 'manifest.json');
const specs = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));

mkdirSync(ADMIN, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { packs: [] };
if (!Array.isArray(manifest.packs)) manifest.packs = [];
const now = new Date().toISOString();
const assetsDir = resolve(ROOT, 'assets/fact-videos', DECK);
const dataDir = resolve(ROOT, 'data', DECK);
mkdirSync(assetsDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const videos = [], items = [];
let ok = 0, miss = 0;
specs.forEach((s, i) => {
  const master = resolve(OUTDIR, `${s.id}.mp4`);
  const poster = resolve(OUTDIR, `${s.id}.jpg`);
  if (!existsSync(master)) { miss++; console.log(`MISS ${s.id}`); return; }
  const dur = s.dur || 8;
  const offset = ((i * 3) % 20).toFixed(2);
  const fadeOut = Math.max(0.5, dur - 1.0).toFixed(2);
  const adminMp4 = resolve(ADMIN, `${s.id}.mp4`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', master, '-ss', offset, '-i', MUSIC,
    '-filter_complex', `[1:a]volume=0.9,afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=1.0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-shortest', '-movflags', '+faststart', adminMp4]);
  if (existsSync(poster)) copyFileSync(poster, resolve(ADMIN, `${s.id}.jpg`));
  copyFileSync(adminMp4, resolve(assetsDir, `${s.id}.mp4`));
  videos.push({ file: `${DECK}/${s.id}.mp4`, title: s.title, text: s.title });
  items.push({ id: s.id, title: s.name, theme: 'illusion', dur: mmss(dur), createdAt: now, updatedAt: now });
  ok++;
});
writeFileSync(resolve(dataDir, 'videos.json'), JSON.stringify(videos, null, 2) + '\n');
manifest.packs = manifest.packs.filter((p) => p.id !== DECK);
manifest.packs.push({ id: DECK, title: PACK_TITLE, lang: LANG, items });
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${DECK}: ${ok} clips published (${miss} missing). videos.json=${videos.length}`);
console.log(`manifest packs: ${manifest.packs.map((p) => p.id + '(' + (p.items?.length || 0) + ')').join(', ')}`);

#!/usr/bin/env node
// Publish the full illusions-3d RU + DE packs (run AFTER build renders out-ru/ + out-de/).
// For each pack, for each clip:
//   - mux quiet music into the silent master -> with-audio mp4
//   - -> data/output/admin-demos/<id>.mp4 (+ <id>.jpg poster)  → /clip-demos gallery
//   - -> assets/fact-videos/<deck>/<id>.mp4                    → channel deck source
//   - videos.json entry {file,title,text}                      → data/<deck>/videos.json
//   - manifest pack item                                       → admin-demos/manifest.json
// Idempotent; only this pack's manifest entry is replaced, others untouched.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const WORK = resolve(ROOT, 'tmp/illusions-3d'); // generated manifests + rendered masters (gitignored)
const ADMIN = resolve(ROOT, 'data/output/admin-demos');
const MANIFEST = resolve(ADMIN, 'manifest.json');
const MUSIC = resolve(ROOT, 'assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus');

const PACKS = [
  { deck: 'illusions-3d', title: 'Обмани свой мозг', lang: 'ru', manifest: 'ru-manifest.json', dir: 'out-ru' },
  { deck: 'illusions-3d-de', title: 'Überliste dein Gehirn', lang: 'de', manifest: 'de-manifest.json', dir: 'out-de' },
];

mkdirSync(ADMIN, { recursive: true });
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const now = new Date().toISOString();

for (const pk of PACKS) {
  const specs = JSON.parse(readFileSync(resolve(WORK, pk.manifest), 'utf8'));
  const srcDir = resolve(WORK, pk.dir);
  const assetsDir = resolve(ROOT, 'assets/fact-videos', pk.deck);
  const dataDir = resolve(ROOT, 'data', pk.deck);
  mkdirSync(assetsDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  const videos = [];
  const items = [];
  let ok = 0, miss = 0;
  specs.forEach((s, i) => {
    const master = resolve(srcDir, `${s.id}.mp4`);
    const poster = resolve(srcDir, `${s.id}.jpg`);
    if (!existsSync(master)) { miss++; console.log(`MISS ${pk.deck}/${s.id}`); return; }
    const offset = ((i * 2) % 24).toFixed(2);
    const adminMp4 = resolve(ADMIN, `${s.id}.mp4`);
    execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
      '-i', master, '-ss', offset, '-i', MUSIC,
      '-filter_complex', '[1:a]volume=0.9,afade=t=in:st=0:d=0.6,afade=t=out:st=7.0:d=1.0[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
      '-shortest', '-movflags', '+faststart', adminMp4]);
    if (existsSync(poster)) copyFileSync(poster, resolve(ADMIN, `${s.id}.jpg`));
    copyFileSync(adminMp4, resolve(assetsDir, `${s.id}.mp4`)); // channel deck uses the same with-audio mp4
    videos.push({ file: `${pk.deck}/${s.id}.mp4`, title: s.title, text: s.title });
    items.push({ id: s.id, title: s.name, theme: 'illusion', dur: '0:08', createdAt: now, updatedAt: now });
    ok++;
  });
  writeFileSync(resolve(dataDir, 'videos.json'), JSON.stringify(videos, null, 2) + '\n');
  manifest.packs = manifest.packs.filter((p) => p.id !== pk.deck);
  manifest.packs.push({ id: pk.deck, title: pk.title, lang: pk.lang, items });
  console.log(`${pk.deck}: ${ok} clips published (${miss} missing). videos.json=${videos.length}`);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest packs: ${manifest.packs.map((p) => p.id + '(' + (p.items?.length || 0) + ')').join(', ')}`);

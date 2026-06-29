#!/usr/bin/env node
// Publish the English illusions-3d pack (run AFTER build renders out-en/).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const WORK = resolve(ROOT, 'temp/illusions-3d');
const ADMIN = resolve(ROOT, 'data/output/admin-demos');
const MANIFEST = resolve(ADMIN, 'manifest.json');
const MUSIC = resolve(ROOT, 'assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus');
const PACK = {
  deck: 'illusions-3d-en',
  title: 'Mind-Flip 3D Illusions',
  lang: 'en',
  manifest: 'en-manifest.json',
  dir: 'out-en',
};

mkdirSync(ADMIN, { recursive: true });
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const now = new Date().toISOString();
const specs = JSON.parse(readFileSync(resolve(WORK, PACK.manifest), 'utf8'));
const srcDir = resolve(WORK, PACK.dir);
const assetsDir = resolve(ROOT, 'assets/fact-videos', PACK.deck);
const dataDir = resolve(ROOT, 'data', PACK.deck);
mkdirSync(assetsDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const videos = [];
const items = [];
let ok = 0;
let miss = 0;
specs.forEach((s, i) => {
  const master = resolve(srcDir, `${s.id}.mp4`);
  const poster = resolve(srcDir, `${s.id}.jpg`);
  if (!existsSync(master)) {
    miss++;
    console.log(`MISS ${PACK.deck}/${s.id}`);
    return;
  }
  const offset = ((i * 2) % 24).toFixed(2);
  const adminMp4 = resolve(ADMIN, `${s.id}.mp4`);
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-i', master, '-ss', offset, '-i', MUSIC,
    '-filter_complex', '[1:a]volume=0.9,afade=t=in:st=0:d=0.6,afade=t=out:st=7.0:d=1.0[a]',
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-shortest', '-movflags', '+faststart', adminMp4]);
  if (existsSync(poster)) copyFileSync(poster, resolve(ADMIN, `${s.id}.jpg`));
  copyFileSync(adminMp4, resolve(assetsDir, `${s.id}.mp4`));
  videos.push({ file: `${PACK.deck}/${s.id}.mp4`, title: s.title, text: s.title });
  items.push({ id: s.id, title: s.name, theme: 'illusion', dur: '0:08', createdAt: now, updatedAt: now });
  ok++;
});

writeFileSync(resolve(dataDir, 'videos.json'), JSON.stringify(videos, null, 2) + '\n');
manifest.packs = manifest.packs.filter((p) => p.id !== PACK.deck);
manifest.packs.push({ id: PACK.deck, title: PACK.title, lang: PACK.lang, items });
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${PACK.deck}: ${ok} clips published (${miss} missing). videos.json=${videos.length}`);

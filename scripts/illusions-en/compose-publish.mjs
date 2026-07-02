#!/usr/bin/env node
// Compose localized clips from titleless bases + title overlays + music, and publish localized decks.
// Inputs: matrix.json [{id,key,html,variant,dur,fps,name}], localize.json {id:{en,de,it,es,ru,...}},
//   tmp/illusions-en/base/<id>.mp4(+.jpg), tmp/illusions-en/titles/<id>_<lang>.png, music
// Per (lang,design): overlay title PNG onto the base + mux music -> final mp4, placed in:
//   assets/fact-videos/illusions-<lang>/<id>.mp4   (channel deck source)
//   data/output/admin-demos/<lang>-<id>.mp4 (+ .jpg) via HARDLINK  (clip-demos gallery)
//   data/illusions-<lang>/videos.json + manifest pack illusions-<lang>
// Designs with an empty title (afterimage draws its own text into the base) skip the overlay.
// SKIP_EXISTING=1 keeps already-published final MP4 files and only encodes missing ones.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync, linkSync, unlinkSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const BASE = resolve(ROOT, 'tmp/illusions-en/base');
const TITLES = resolve(ROOT, 'tmp/illusions-en/titles');
const ADMIN = resolve(ROOT, 'data/output/admin-demos');
const MANIFEST = resolve(ADMIN, 'manifest.json');
const MUSIC = resolve(ROOT, 'assets/audio/long-videos/fats-waller-swingin-the-operas-1939.opus');
const PACK_TITLE = {
  en: 'Optical Illusions',
  de: 'Optische Täuschungen',
  it: 'Illusioni ottiche',
  es: 'Ilusiones ópticas',
  ru: 'Оптические иллюзии',
  fr: 'Illusions optiques',
  pt: 'Ilusões ópticas',
  hi: 'दृष्टि भ्रम',
  id: 'Ilusi Optik',
  ar: 'خدع بصرية',
};
const ALL_LANGS = ['en', 'de', 'it', 'es', 'ru', 'fr', 'pt', 'hi', 'id', 'ar'];
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const hardlink = (src, dst) => { try { if (existsSync(dst)) unlinkSync(dst); linkSync(src, dst); } catch { copyFileSync(src, dst); } };

const argv = process.argv.slice(2);
const langIdx = argv.indexOf('--langs');
const LANGS = langIdx >= 0 ? argv[langIdx + 1].split(',') : ALL_LANGS;
const matrix = JSON.parse(readFileSync(resolve(HERE, 'matrix.json'), 'utf8'));
const loc = JSON.parse(readFileSync(resolve(HERE, 'localize.json'), 'utf8'));
const skipExisting = process.env.SKIP_EXISTING === '1';
if (!existsSync(MUSIC)) { console.error('missing music'); process.exit(1); }
mkdirSync(ADMIN, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { packs: [] };
if (!Array.isArray(manifest.packs)) manifest.packs = [];
const now = new Date().toISOString();

for (const lang of LANGS) {
  const deck = `illusions-${lang}`;
  const fvDir = resolve(ROOT, 'assets/fact-videos', deck);
  const dataDir = resolve(ROOT, 'data', deck);
  mkdirSync(fvDir, { recursive: true }); mkdirSync(dataDir, { recursive: true });
  const videos = [], items = [];
  let ok = 0, miss = 0;
  for (const d of matrix) {
    const base = resolve(BASE, `${d.id}.mp4`);
    if (!existsSync(base)) { miss++; continue; }
    const dur = d.dur || 8, fadeOut = Math.max(0.5, dur - 1.0).toFixed(2);
    const title = ((loc[d.id] || {})[lang] || '').trim();
    const titlePng = resolve(TITLES, `${d.id}_${lang}.png`);
    const useOverlay = title && existsSync(titlePng);
    const out = resolve(fvDir, `${d.id}.mp4`);
    const adminMp4 = resolve(ADMIN, `${lang}-${d.id}.mp4`);
    const baseJpg = resolve(BASE, `${d.id}.jpg`);
    const adminJpg = resolve(ADMIN, `${lang}-${d.id}.jpg`);
    const audioF = `[a0]volume=0.9,afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=1.0[a]`;
    if (skipExisting && existsSync(out)) {
      if (!existsSync(adminMp4)) hardlink(out, adminMp4);
      if (!existsSync(adminJpg) && existsSync(baseJpg)) copyFileSync(baseJpg, adminJpg);
    } else {
      if (useOverlay) {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', base, '-i', titlePng, '-i', MUSIC,
          '-filter_complex', `[0:v][1:v]overlay=0:0[v];[2:a]${audioF.replace('[a0]', '')}`,
          '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out]);
      } else {
        execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', base, '-i', MUSIC,
          '-filter_complex', `[1:a]volume=0.9,afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=1.0[a]`,
          '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out]);
      }
      // poster (with title overlaid when present)
      if (existsSync(baseJpg)) {
        if (useOverlay) { try { execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', baseJpg, '-i', titlePng, '-filter_complex', 'overlay=0:0', '-frames:v', '1', '-q:v', '3', adminJpg]); } catch { copyFileSync(baseJpg, adminJpg); } }
        else copyFileSync(baseJpg, adminJpg);
      }
      hardlink(out, adminMp4);
    }
    videos.push({ file: `${deck}/${d.id}.mp4`, title: title || d.name, text: title || d.name });
    items.push({ id: `${lang}-${d.id}`, title: d.name, theme: 'illusion', dur: mmss(dur), createdAt: now, updatedAt: now });
    ok++;
  }
  writeFileSync(resolve(dataDir, 'videos.json'), JSON.stringify(videos, null, 2) + '\n');
  manifest.packs = manifest.packs.filter((p) => p.id !== deck);
  manifest.packs.push({ id: deck, title: PACK_TITLE[lang] || deck, lang, items });
  console.log(`${deck}: ${ok} clips (${miss} missing base)`);
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest packs: ${manifest.packs.map((p) => p.id + '(' + (p.items?.length || 0) + ')').join(', ')}`);

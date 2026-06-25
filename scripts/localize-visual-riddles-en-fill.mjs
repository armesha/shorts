#!/usr/bin/env node
// Fill missing visual-riddles-en entries from the checked RU open-source ledger.
// It downloads only missing Commons/PD/CC0 source images, renders English cards via
// scripts/build-visual-riddles.mjs, copies finished MP4 files into the EN asset
// directory, and rewrites the EN videos/sources JSON in RU source-ledger order.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { basename, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENV_PY = resolve(ROOT, '.venv-tts/bin/python');
const RU_SOURCES = resolve(ROOT, 'data/visual-riddles/sources.json');
const EN_SOURCES = resolve(ROOT, 'data/visual-riddles-en/sources.json');
const EN_VIDEOS = resolve(ROOT, 'data/visual-riddles-en/videos.json');
const ASSET_DIR = resolve(ROOT, 'assets/fact-videos/visual-riddles-en');
const WORK = resolve(ROOT, 'temp/visual-riddles-en-fill');
const SRC_DIR = resolve(WORK, 'src');
const OUT_DIR = resolve(WORK, 'out');
const MANIFEST = resolve(WORK, 'build-manifest.json');
const UA = 'Mozilla/5.0 (shorts-factory visual-riddles-en fill; contact: local build)';
const FORCE = process.argv.includes('--force');

const CATEGORY = {
  'СЧЁТ': 'COUNTING',
  'НАЙДИ ЖИВОТНОЕ': 'HIDDEN IMAGE',
};

const EN = {
  vry_025: {
    title: 'Counting triangles 4',
    category: 'COUNTING',
    question: 'How many triangles can you count?',
    answer: 'Count every triangle formed by the colored lines, including overlapping and intersecting triangles.',
  },
  vry_030: {
    title: 'The Eggs of European Birds',
    category: 'COUNTING',
    question: 'How many bird eggs can you see?',
    answer: 'There are 7 eggs shown on the lithograph plate.',
  },
  vry_044: {
    title: 'Water, by Arcimboldo',
    category: 'HIDDEN IMAGE',
    question: 'How many sea creatures can you find in the face?',
    answer: 'The profile is built from sea creatures: fish, crabs, lobster, turtle, octopus, rays, eel, shark, shellfish, coral, and more.',
  },
  vry_045: {
    title: 'Earth, by Arcimboldo',
    category: 'HIDDEN IMAGE',
    question: 'How many land animals can you find in the face?',
    answer: 'The head is assembled from land animals including deer, lion, ram, elephant, monkey, boar, leopard, hare, fox, goat, wolf, and cattle.',
  },
  vry_046: {
    title: 'Air, by Arcimboldo',
    category: 'HIDDEN IMAGE',
    question: 'How many birds can you find in the face?',
    answer: 'The face is made from birds including peacock, parrot, rooster, owl, ducks, turkey, eagles, doves, and many other birds.',
  },
  vry_047: {
    title: 'Summer, by Arcimboldo',
    category: 'HIDDEN IMAGE',
    question: 'Which face is hidden in the fruit?',
    answer: 'A human profile is assembled from summer fruit, vegetables, grain, and flowers.',
  },
  vry_048: {
    title: 'Winter, by Arcimboldo',
    category: 'HIDDEN IMAGE',
    question: 'What face is hidden in the old tree?',
    answer: 'A human profile is formed from a gnarled trunk, ivy, bark, mushrooms, and winter fruit.',
  },
  vry_049: {
    title: 'Spring, by Arcimboldo',
    category: 'HIDDEN IMAGE',
    question: 'What face is hidden in the bouquet?',
    answer: 'One human profile is built from flowers, leaves, and spring plants.',
  },
  vry_051: {
    title: 'The Librarian, by Arcimboldo',
    category: 'HIDDEN IMAGE',
    question: 'Where is the face hidden, and what is the figure made from?',
    answer: 'The whole figure is made from books: open pages, bindings, bookmarks, and book edges form the face, body, and hands.',
  },
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function idFromVideo(video) {
  return basename(String(video.file || '')).replace(/\.mp4$/i, '');
}

function assetPath(id) {
  return resolve(ASSET_DIR, `${id}.mp4`);
}

function isCommonsFilePath(url) {
  return /commons\.wikimedia\.org\/wiki\/Special:FilePath/i.test(String(url));
}

function withWidth(url, width) {
  if (!isCommonsFilePath(url) || /[?&]width=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}width=${width}`;
}

function runCurl(url, out) {
  execFileSync('timeout', [
    '180s',
    'curl',
    '-fsSL',
    '-A',
    UA,
    '--connect-timeout',
    '20',
    '--max-time',
    '90',
    '--retry',
    '3',
    '--retry-delay',
    '2',
    '--retry-all-errors',
    url,
    '-o',
    out,
  ], { stdio: 'pipe' });
}

function pilOk(file) {
  try {
    const out = execFileSync(VENV_PY, [
      '-c',
      'from PIL import Image;import sys;im=Image.open(sys.argv[1]);im.verify();print(im.format or "")',
      file,
    ], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
    return Boolean(out);
  } catch {
    return false;
  }
}

function looksSvg(file) {
  try {
    const head = readFileSync(file).slice(0, 500).toString('utf8').toLowerCase();
    return head.includes('<svg') || (head.includes('<?xml') && head.includes('svg'));
  } catch {
    return false;
  }
}

function downloadImage(source) {
  const id = source.id;
  const png = resolve(SRC_DIR, `${id}.png`);
  const raw = resolve(SRC_DIR, `${id}.src`);
  if (existsSync(png) && pilOk(png)) return png;
  if (existsSync(raw) && pilOk(raw)) return raw;

  const baseUrl = source.downloadUrl || source.sourceUrl;
  const attempts = [withWidth(baseUrl, 1400), withWidth(baseUrl, 1000), baseUrl]
    .filter((url, i, arr) => url && arr.indexOf(url) === i);
  let lastErr;
  for (const url of attempts) {
    try {
      runCurl(url, raw);
      if (looksSvg(raw)) {
        execFileSync(VENV_PY, [
          '-c',
          'import cairosvg,sys;cairosvg.svg2png(url=sys.argv[1],write_to=sys.argv[2],output_width=1400)',
          raw,
          png,
        ], { stdio: 'pipe' });
        if (pilOk(png)) return png;
      }
      if (pilOk(raw)) return raw;
      throw new Error('downloaded file is not a decodable image');
    } catch (error) {
      lastErr = error;
    }
  }
  throw lastErr || new Error(`could not download ${id}`);
}

function toSource(source) {
  const translated = EN[source.id];
  if (!translated) throw new Error(`Missing curated English copy for ${source.id}`);
  return {
    ...source,
    type: source.type || '',
    title: translated.title,
    category: translated.category || CATEGORY[source.category] || source.category || 'PUZZLE',
    question: translated.question,
    answer: translated.answer,
  };
}

function runBuilder() {
  execFileSync(process.execPath, [
    resolve(ROOT, 'scripts/build-visual-riddles.mjs'),
    MANIFEST,
    '--outdir',
    OUT_DIR,
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      VR_VOICE: process.env.VR_VOICE || 'en-US-GuyNeural',
      VR_CTA: process.env.VR_CTA || 'Write your answer in the comments',
    },
  });
}

function replaceWithVoiceOnly(inMp4, voiceMp3, outMp4) {
  execFileSync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inMp4,
    '-i',
    voiceMp3,
    '-filter_complex',
    '[1:a]apad=pad_dur=1.8[a]',
    '-map',
    '0:v:0',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-shortest',
    '-movflags',
    '+faststart',
    outMp4,
  ], { stdio: 'pipe' });
}

function main() {
  mkdirSync(SRC_DIR, { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(ASSET_DIR, { recursive: true });

  const ruSources = readJson(RU_SOURCES);
  const enSources = readJson(EN_SOURCES);
  const enVideos = readJson(EN_VIDEOS);
  const ruOrder = new Map(ruSources.map((source, index) => [source.id, index]));
  const sourceById = new Map(enSources.map((source) => [source.id, source]));
  const videoById = new Map(enVideos.map((video) => [idFromVideo(video), video]));

  const incomplete = ruSources.filter((source) => {
    const id = source.id;
    return !sourceById.has(id) || !videoById.has(id) || !existsSync(assetPath(id));
  });
  const unsupported = incomplete.filter((source) => !EN[source.id]);
  if (unsupported.length) {
    throw new Error(`No curated English copy for: ${unsupported.map((source) => source.id).join(', ')}`);
  }
  const targets = FORCE ? ruSources.filter((source) => EN[source.id]) : incomplete;

  console.log(`[vr-en-fill] before: sources=${enSources.length}, videos=${enVideos.length}, incomplete=${incomplete.length}, force=${FORCE ? 'yes' : 'no'}`);
  if (!targets.length) {
    console.log('[vr-en-fill] nothing to fill');
    return;
  }

  const manifest = [];
  for (const source of targets) {
    const translated = toSource(source);
    const image = downloadImage(source);
    manifest.push({
      id: source.id,
      type: translated.type,
      category: translated.category,
      title: translated.title,
      question: translated.question,
      cta: 'Write your answer in the comments',
      vo: `${translated.question} Write your answer in the comments.`,
      image,
      answer: translated.answer,
    });
    sourceById.set(source.id, translated);
    videoById.set(source.id, {
      file: `visual-riddles-en/${source.id}.mp4`,
      title: translated.title,
      text: translated.title,
    });
    console.log(`[vr-en-fill] staged ${source.id}: ${translated.title}`);
  }

  writeJson(MANIFEST, manifest);
  runBuilder();

  for (const item of manifest) {
    const built = resolve(OUT_DIR, `${item.id}.mp4`);
    const voiceMp3 = resolve(OUT_DIR, `${item.id}.voice.mp3`);
    const clean = resolve(OUT_DIR, `${item.id}.voice-only.mp4`);
    if (!existsSync(built)) throw new Error(`builder did not create ${built}`);
    if (!existsSync(voiceMp3)) throw new Error(`builder did not create ${voiceMp3}`);
    replaceWithVoiceOnly(built, voiceMp3, clean);
    copyFileSync(clean, assetPath(item.id));
    console.log(`[vr-en-fill] copied ${item.id}.mp4`);
  }

  const sortByRu = (a, b, getId) => {
    const aid = getId(a);
    const bid = getId(b);
    const ao = ruOrder.has(aid) ? ruOrder.get(aid) : Number.MAX_SAFE_INTEGER;
    const bo = ruOrder.has(bid) ? ruOrder.get(bid) : Number.MAX_SAFE_INTEGER;
    return ao - bo || aid.localeCompare(bid);
  };
  const nextSources = [...sourceById.values()].sort((a, b) => sortByRu(a, b, (x) => x.id));
  const nextVideos = [...videoById.values()].sort((a, b) => sortByRu(a, b, idFromVideo));
  writeJson(EN_SOURCES, nextSources);
  writeJson(EN_VIDEOS, nextVideos);
  console.log(`[vr-en-fill] after: sources=${nextSources.length}, videos=${nextVideos.length}`);
}

main();

#!/usr/bin/env node
// Build an English manifest for visual-riddles from the checked source ledger.
// Downloads the original CC0/PD images, then writes:
//   temp/visual-riddles-en/build-manifest.json
//   temp/visual-riddles-en/sources.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENV_PY = resolve(ROOT, '.venv-tts/bin/python');
const UA = 'Mozilla/5.0 (shorts-factory visual-riddles-en builder)';
const INPUT = resolve(ROOT, 'data/visual-riddles-de/sources.json');
const WORK = resolve(ROOT, 'temp/visual-riddles-en');
const SRC_DIR = resolve(WORK, 'src');
const MANIFEST = resolve(WORK, 'build-manifest.json');
const SOURCES = resolve(WORK, 'sources.json');
const ONLY_IDS = new Set(String(process.env.VR_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean));
const SKIP_IDS = new Set([
  'vry_025',
  'vry_030',
  'vry_044',
  'vry_045',
  'vry_046',
  'vry_047',
  'vry_048',
  'vry_049',
  'vry_051',
]);
mkdirSync(SRC_DIR, { recursive: true });

const CATEGORY = {
  'LABYRINTH': 'MAZE',
  'TÄUSCHUNG': 'ILLUSION',
  'RAUM': 'SPATIAL',
  'LOGIK': 'LOGIC',
  'SUCHBILD': 'HIDDEN IMAGE',
  'ZÄHLEN': 'COUNTING',
  'FARBTEST': 'COLOR TEST',
};

const EXACT_TITLES = {
  'Müller-Lyer-Täuschung': 'Muller-Lyer Illusion',
  'Müller-Lyer-Pfeile': 'Muller-Lyer Arrows',
  'Ebbinghaus-Täuschung': 'Ebbinghaus Illusion',
  'Poggendorff-Täuschung': 'Poggendorff Illusion',
  'Zöllner-Täuschung': 'Zollner Illusion',
  'Fraser-Spirale': 'Fraser Spiral',
  'Café-Wand-Täuschung': 'Cafe Wall Illusion',
  'Hermann-Gitter': 'Hermann Grid',
  'Flimmergitter': 'Scintillating Grid',
  'Ehrenstein-Täuschung': 'Ehrenstein Illusion',
  'Dürers Magisches Quadrat': "Durer's Magic Square",
  'Delboeuf-Täuschung': 'Delboeuf Illusion',
  'Sander-Parallelogramm': 'Sander Parallelogram',
  'Penrose-Dreieck': 'Penrose Triangle',
  'Orbison-Täuschung': 'Orbison Illusion',
  'Mach-Streifen': 'Mach Bands',
  'Necker-Würfel': 'Necker Cube',
  'Rubins Vase': "Rubin's Vase",
  'White-Täuschung': 'White Illusion',
  'Bezold-Effekt': 'Bezold Effect',
  'Das Wasser, Arcimboldo': 'Water, by Arcimboldo',
  'Die Erde, Arcimboldo': 'Earth, by Arcimboldo',
  'Die Luft, Arcimboldo': 'Air, by Arcimboldo',
  'Der Sommer, Arcimboldo': 'Summer, by Arcimboldo',
  'Der Winter, Arcimboldo': 'Winter, by Arcimboldo',
  'Der Frühling, Arcimboldo': 'Spring, by Arcimboldo',
  'Vertumnus, Arcimboldo': 'Vertumnus, by Arcimboldo',
  'Der Bibliothekar, Arcimboldo': 'The Librarian, by Arcimboldo',
  'Labyrinth mit Spiralen': 'Spiral Maze',
  'Labyrinth mit Halle in der Mitte': 'Maze with a Center Hall',
  'Quadrate und Linien': 'Squares and Lines',
  'Mehrere Würfelnetze': 'Several Cube Nets',
  'Bogen mit Würfelnetzen': 'Sheet of Cube Nets',
  'Würfelnetz zum Ausdrucken': 'Printable Cube Net',
  'Die schlaue Acht': 'The Clever Eight',
  'Die sibirischen Kerker': 'The Siberian Cells',
  'Magisches Quadrat aus Karten': 'Magic Square with Cards',
  'Kreuze aus Spielsteinen': 'Crosses with Counters',
  'Rahmen aus Karten': 'Frame of Cards',
  'Rot auf Grau: welche Zahl?': 'Red on Gray: What Number?',
  'Versteckte Zahlen aus Punkten': 'Hidden Numbers in Dots',
  'Finde die Zahl in den Punkten': 'Find the Number in the Dots',
  'Farbsehtest: Zahl aus Punkten': 'Color Vision Test: Number in Dots',
  'Alte Farbenblind-Tafel (1883)': 'Historic Color Blindness Plate (1883)',
  'Eichhörnchen und Eichel': 'Squirrel and Acorn',
  'Katzen-Labyrinth': 'Cat Maze',
};

function shell(url, out) {
  execFileSync('timeout', ['120s', 'curl', '-fsSL', '-A', UA, '--connect-timeout', '15', '--max-time', '35', '--retry', '2', '--retry-delay', '2', '--retry-all-errors', url, '-o', out], { stdio: 'pipe' });
}
function isCommons(u) {
  return /commons\.wikimedia\.org\/wiki\/Special:FilePath/i.test(u);
}
function withWidth(u) {
  return isCommons(u) && !/[?&]width=/.test(u) ? `${u}${u.includes('?') ? '&' : '?'}width=1400` : u;
}
function pilOk(f) {
  try {
    return !!execFileSync(VENV_PY, ['-c', 'from PIL import Image;import sys;print(Image.open(sys.argv[1]).format or "")', f], { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    return false;
  }
}
function looksSvg(f) {
  try {
    const b = readFileSync(f).slice(0, 400).toString('utf8').toLowerCase();
    return b.includes('<svg') || (b.includes('<?xml') && b.includes('svg'));
  } catch {
    return false;
  }
}
function download(url, id) {
  const png = resolve(SRC_DIR, `${id}.png`);
  const img = resolve(SRC_DIR, `${id}.img`);
  if (existsSync(png) && pilOk(png)) return png;
  if (existsSync(img) && pilOk(img)) return img;
  shell(withWidth(url), img);
  if (looksSvg(img)) {
    execFileSync(VENV_PY, ['-c', 'import cairosvg,sys;cairosvg.svg2png(url=sys.argv[1],write_to=sys.argv[2],output_width=1400)', img, png], { stdio: 'pipe' });
    if (!pilOk(png)) throw new Error('svg rasterized but unreadable');
    return png;
  }
  if (!pilOk(img)) throw new Error('not a decodable image');
  return img;
}

function sourceStem(s) {
  const raw = decodeURIComponent(String(s.downloadUrl || s.sourceUrl || ''));
  let part = raw.includes('/Special:FilePath/') ? raw.split('/Special:FilePath/').pop() : basename(raw.split('?')[0]);
  part = String(part || '').replace(/\.(svg|png|jpe?g|gif|webp)$/i, '');
  return part.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function cleanTitle(s) {
  if (EXACT_TITLES[s.title]) return EXACT_TITLES[s.title];
  const stem = sourceStem(s);
  if (/[A-Za-z]{4,}/.test(stem) && !/^\d+$/.test(stem)) {
    return stem
      .replace(/\bFile:/i, '')
      .replace(/\bSpecial:FilePath\b/i, '')
      .replace(/\bLCCN\d+\b/gi, '')
      .replace(/\bBHL\d+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 64);
  }
  return translateTitle(s.title, s.category);
}
function translateTitle(title, category) {
  let out = String(title || '');
  const repl = [
    [/Labyrinth/gi, 'Maze'],
    [/Pfeilen/gi, 'Arrows'],
    [/Maus/gi, 'Mouse'],
    [/Käse/gi, 'Cheese'],
    [/Eichhörnchen/gi, 'Squirrel'],
    [/Eichel/gi, 'Acorn'],
    [/Würfelnetze?/gi, 'Cube Net'],
    [/Würfel/gi, 'Cube'],
    [/Netz/gi, 'Net'],
    [/Magisches Quadrat/gi, 'Magic Square'],
    [/Quadrate?/gi, 'Squares'],
    [/Dreiecke?/gi, 'Triangles'],
    [/Vögel/gi, 'Birds'],
    [/Enten/gi, 'Ducks'],
    [/Farbpunkte/gi, 'Color Dots'],
    [/versteckte Zahlen/gi, 'Hidden Numbers'],
    [/Wie viele/gi, 'How Many'],
    [/Unmögliche/gi, 'Impossible'],
    [/Täuschung/gi, 'Illusion'],
  ];
  for (const [from, to] of repl) out = out.replace(from, to);
  out = out.replace(/[„“"]/g, '').replace(/\s+/g, ' ').trim();
  if (!out || /[äöüß]/i.test(out)) {
    const fallback = {
      'LABYRINTH': 'Maze Challenge',
      'TÄUSCHUNG': 'Optical Illusion',
      'RAUM': 'Spatial Puzzle',
      'LOGIK': 'Logic Puzzle',
      'SUCHBILD': 'Hidden Picture',
      'ZÄHLEN': 'Counting Challenge',
      'FARBTEST': 'Color Vision Test',
    };
    return fallback[category] || 'Visual Riddle';
  }
  return out.slice(0, 64);
}
function questionFor(s) {
  const hay = `${s.title} ${s.question}`.toLowerCase();
  if (s.category === 'LABYRINTH') {
    if (hay.includes('a, b')) return 'Which entrance leads to the exit: A or B?';
    if (hay.includes('maus') || hay.includes('mouse')) return 'Can you guide the mouse to the cheese?';
    if (hay.includes('eichhörnchen') || hay.includes('acorn')) return 'Can you guide the squirrel to the acorn?';
    if (hay.includes('mitte')) return 'Can you find the path to the center?';
    return 'Can you find the way out?';
  }
  if (s.category === 'FARBTEST') return 'Can you see the hidden number?';
  if (s.category === 'ZÄHLEN') {
    if (hay.includes('dreieck')) return 'How many triangles can you count?';
    if (hay.includes('quadrat')) return 'How many squares are there in total?';
    if (hay.includes('würfel')) return 'How many cubes can you see?';
    if (hay.includes('vögel') || hay.includes('falke') || hay.includes('enten')) return 'How many birds can you count?';
    return 'How many can you find?';
  }
  if (s.category === 'SUCHBILD') {
    if (hay.includes('arcimboldo')) return 'How many hidden details can you find in the face?';
    return 'How many hidden faces and animals can you find?';
  }
  if (s.category === 'RAUM') {
    if (hay.includes('würfel')) return 'Can this net fold into a cube?';
    if (hay.includes('flächen')) return 'How many faces does this solid have?';
    return 'What solid does this net fold into?';
  }
  if (s.category === 'LOGIK') {
    if (hay.includes('summe')) return 'Can you find the equal sum in this puzzle?';
    return 'Can you solve this logic puzzle?';
  }
  if (s.category === 'TÄUSCHUNG') {
    if (hay.includes('länger')) return 'Which line looks longer?';
    if (hay.includes('parallel')) return 'Are the long lines really parallel?';
    if (hay.includes('kreis')) return 'Which center circle looks bigger?';
    if (hay.includes('vase')) return 'Do you see a vase or two faces?';
    if (hay.includes('zinken')) return 'How many prongs does this fork have?';
    if (hay.includes('würfel')) return 'Which side of the cube comes forward?';
    return 'Can you trust what your eyes are seeing?';
  }
  return 'Can you solve this visual riddle?';
}

const rows = JSON.parse(readFileSync(INPUT, 'utf8'));
const manifest = [];
const sources = [];
let ok = 0;
let failed = 0;
for (const src of rows) {
  if (ONLY_IDS.size && !ONLY_IDS.has(src.id)) continue;
  if (SKIP_IDS.has(src.id)) {
    console.log(`SKIP ${src.id}: slow/unreliable Commons source`);
    failed++;
    continue;
  }
  try {
    const image = download(src.downloadUrl, src.id);
    const title = cleanTitle(src);
    const question = questionFor(src);
    manifest.push({
      id: src.id,
      type: src.type || '',
      category: CATEGORY[src.category] || src.category || 'PUZZLE',
      title,
      question,
      cta: 'Write your answer in the comments',
      vo: `${question} Write your answer in the comments.`,
      image,
      answer: src.answer || '',
    });
    sources.push({ ...src, title, category: CATEGORY[src.category] || src.category || 'PUZZLE', question });
    ok++;
  } catch (e) {
    failed++;
    console.log(`SKIP ${src.id}: ${String(e.message || e).slice(0, 120)}`);
  }
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(SOURCES, JSON.stringify(sources, null, 2) + '\n');
console.log(`visual-riddles-en manifest: ${ok} ok, ${failed} failed -> ${MANIFEST}`);

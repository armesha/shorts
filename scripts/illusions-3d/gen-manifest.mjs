#!/usr/bin/env node
// Generate RU + DE + EN 200-clip manifests for the illusions-3d pack.
//   20 figures x 10 variants (direction / speed / view angle) = 200 clips.
//   Titles are ONE theme only: "rotate/flip the figure with your mind" (RU силой мысли / DE Gedankenkraft).
//   Same geometry RU/DE/EN; only the baked title + ids differ. Palette fixed = spectrum.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const WORK = resolve(ROOT, 'tmp/illusions-3d'); // generated manifests live in the gitignored work dir
mkdirSync(WORK, { recursive: true });

const FIGURES = [
  { shape: 'cube', ru: 'Куб Неккера', de: 'Necker-Würfel', en: 'Necker Cube' },
  { shape: 'tetra', ru: 'Тетраэдр', de: 'Tetraeder', en: 'Tetrahedron' },
  { shape: 'octa', ru: 'Октаэдр', de: 'Oktaeder', en: 'Octahedron' },
  { shape: 'icosa', ru: 'Икосаэдр', de: 'Ikosaeder', en: 'Icosahedron' },
  { shape: 'dodeca', ru: 'Додекаэдр', de: 'Dodekaeder', en: 'Dodecahedron' },
  { shape: 'stella', ru: 'Звёздный тетраэдр', de: 'Sterntetraeder', en: 'Stella Octangula' },
  { shape: 'tesseract', ru: 'Тессеракт', de: 'Tesserakt', en: 'Tesseract' },
  { shape: 'torus', ru: 'Тор', de: 'Torus', en: 'Torus' },
  { shape: 'mobius', ru: 'Лента Мёбиуса', de: 'Möbiusband', en: 'Mobius Strip' },
  { shape: 'orbital', ru: 'Орбитальная сфера', de: 'Orbitale Sphäre', en: 'Orbital Sphere' },
  { shape: 'pyramid', ru: 'Пирамида', de: 'Pyramide', en: 'Pyramid' },
  { shape: 'bipyramid', ru: 'Бипирамида', de: 'Bipyramide', en: 'Bipyramid' },
  { shape: 'prism', ru: 'Призма', de: 'Prisma', en: 'Prism' },
  { shape: 'antiprism', ru: 'Антипризма', de: 'Antiprisma', en: 'Antiprism' },
  { shape: 'cubocta', ru: 'Кубооктаэдр', de: 'Kuboktaeder', en: 'Cuboctahedron' },
  { shape: 'helix', ru: 'Спираль', de: 'Spirale', en: 'Helix' },
  { shape: 'dna', ru: 'Двойная спираль', de: 'Doppelhelix', en: 'Double Helix' },
  { shape: 'trefoil', ru: 'Узел', de: 'Knoten', en: 'Trefoil Knot' },
  { shape: 'fivecell', ru: 'Пентатоп (4D)', de: 'Pentachoron (4D)', en: '5-Cell (4D)' },
  { shape: 'sixteencell', ru: '16-ячейник (4D)', de: '16-Zell (4D)', en: '16-Cell (4D)' },
];

// 10 visual variants — direction, number of turns over the 8s loop, and a view-angle nudge.
// IMPORTANT: the FIRST 5 must stay byte-identical — the original 100 clips were rendered from them, and
// the two-pass generation below reuses those ids so SKIP_EXISTING doesn't re-render them.
const VARIANTS = [
  { dir: 1, turns: 1, dTilt: 0.0, dRoll: 0.0 },
  { dir: -1, turns: 1, dTilt: -0.18, dRoll: 0.12 },
  { dir: 1, turns: 2, dTilt: 0.16, dRoll: -0.1 },
  { dir: -1, turns: 2, dTilt: -0.1, dRoll: 0.2 },
  { dir: 1, turns: 1, dTilt: 0.28, dRoll: -0.18 },
  // +5 new variants for the 100→200 expansion (distinct angles / directions / speeds):
  { dir: -1, turns: 1, dTilt: 0.10, dRoll: -0.26 },
  { dir: 1, turns: 2, dTilt: -0.24, dRoll: 0.16 },
  { dir: -1, turns: 2, dTilt: 0.22, dRoll: 0.0 },
  { dir: 1, turns: 1, dTilt: -0.30, dRoll: -0.12 },
  { dir: -1, turns: 1, dTilt: 0.06, dRoll: 0.28 },
];

// On-theme title banks (ALL = "turn/flip it with your mind"). No off-theme quiz questions.
const RU = [
  'Поверни картинку силой мысли',
  'Измени направление вращения силой мысли',
  'Разверни фигуру силой мысли',
  'Заставь её крутиться в обратную сторону силой мысли',
  'Переключи вращение силой мысли',
  'Силой мысли измени, куда она крутится',
  'Можешь развернуть её одним взглядом?',
  'Твой мозг сам переворачивает эту фигуру',
  'Поймай момент, когда вращение развернётся',
  'Один взгляд — и фигура крутится иначе',
  'Останови и разверни вращение силой мысли',
  'Заставь фигуру крутиться назад силой мысли',
  'Смотри, пока направление не сменится',
  'Разверни вращение силой мысли',
];
const DE = [
  'Dreh das Bild mit deiner Gedankenkraft',
  'Ändere die Drehrichtung mit Gedankenkraft',
  'Dreh die Figur allein mit Gedankenkraft',
  'Lass sie mit Gedankenkraft andersherum drehen',
  'Schalt die Drehrichtung mit Gedankenkraft um',
  'Ändere mit Gedankenkraft, wohin sie sich dreht',
  'Kannst du sie mit einem Blick umdrehen?',
  'Dein Gehirn dreht diese Figur von selbst um',
  'Erwische den Moment, in dem sie umkippt',
  'Ein Blick — und sie dreht sich andersherum',
  'Stopp sie und dreh sie mit Gedankenkraft um',
  'Lass die Figur mit Gedankenkraft rückwärts drehen',
  'Schau hin, bis sich die Richtung ändert',
  'Dreh die Drehung mit Gedankenkraft um',
];
const EN = [
  'Rotate the image with your mind',
  'Change the spin direction with your mind',
  'Flip the figure with your mind',
  'Make it spin the other way with your mind',
  'Switch the rotation with your mind',
  'Change which way it turns with your mind',
  'Can you flip it with one look?',
  'Your brain flips this figure on its own',
  'Catch the moment when the spin reverses',
  'One look and it spins the other way',
  'Stop it and reverse the spin with your mind',
  'Make the figure spin backward with your mind',
  'Keep watching until the direction changes',
  'Flip the rotation with your mind',
];

const ru = [], de = [], en = [];
let num = 0;
function emit(fi, fig, k) {
  num++;
  const id = String(num).padStart(3, '0');
  const vr = VARIANTS[k];
  const tIdx = (fi * 5 + k) % 14; // spread titles so a figure's clips get different on-theme lines
  const common = { shape: fig.shape, dir: vr.dir, turns: vr.turns, dTilt: vr.dTilt, dRoll: vr.dRoll };
  ru.push({ id: `ilr_${id}_${fig.shape}`, ...common, title: RU[tIdx], name: fig.ru });
  de.push({ id: `ild_${id}_${fig.shape}`, ...common, title: DE[tIdx], name: fig.de });
  en.push({ id: `ile_${id}_${fig.shape}`, ...common, title: EN[tIdx], name: fig.en });
}
// Pass A (ids 001..100): variants 0..4 — IDENTICAL to the original 100 so SKIP_EXISTING reuses them.
FIGURES.forEach((fig, fi) => { for (let k = 0; k < 5; k++) emit(fi, fig, k); });
// Pass B (ids 101..200): variants 5..9 — the new clips for the 100→200 expansion.
FIGURES.forEach((fig, fi) => { for (let k = 5; k < 10; k++) emit(fi, fig, k); });

writeFileSync(resolve(WORK, 'ru-manifest.json'), JSON.stringify(ru, null, 2) + '\n');
writeFileSync(resolve(WORK, 'de-manifest.json'), JSON.stringify(de, null, 2) + '\n');
writeFileSync(resolve(WORK, 'en-manifest.json'), JSON.stringify(en, null, 2) + '\n');
console.log(`ru-manifest: ${ru.length} clips; de-manifest: ${de.length} clips; en-manifest: ${en.length} clips (20 figures x 10 variants)`);

#!/usr/bin/env node
// Merge per-type scripts/illusions-en/variants/<key>.json files (written by the solo agents) into
// matrix.json (designs to render) + hooks.json (English title per design). Caps total designs at TARGET
// (default 100): every type contributes variant 0 first, then extra variants round-robin until TARGET.
// Each variants/<key>.json = { key, name, dur, fps, light, variants:[{},{...}], hooksEN:[...] }
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const VDIR = resolve(HERE, 'variants');
const TARGET = parseInt(process.env.TARGET || '100', 10);

const files = readdirSync(VDIR).filter((f) => f.endsWith('.json'));
const types = files.map((f) => JSON.parse(readFileSync(resolve(VDIR, f), 'utf8')))
  .filter((t) => t && t.key && Array.isArray(t.variants) && t.variants.length);
types.sort((a, b) => a.key.localeCompare(b.key));

const designs = []; // {type, vi}
// pass 0: variant 0 of every type
for (const t of types) designs.push({ t, vi: 0 });
// round-robin extra variants until TARGET
let vi = 1, added = true;
while (designs.length < TARGET && added) {
  added = false;
  for (const t of types) {
    if (t.variants[vi]) { designs.push({ t, vi }); added = true; if (designs.length >= TARGET) break; }
  }
  vi++;
}

const matrix = [], hooks = [];
for (const { t, vi } of designs) {
  const id = `${t.key}-v${vi}`;
  matrix.push({ id, key: t.key, html: `illusions/${t.key}.html`, variant: t.variants[vi] || {}, dur: t.dur || 8, fps: t.fps || 30, name: t.name || t.key });
  const bank = (t.hooksEN || []).filter(Boolean);
  const en = bank.length ? bank[vi % bank.length] : '';
  hooks.push({ id, en });
}
writeFileSync(resolve(HERE, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n');
writeFileSync(resolve(HERE, 'hooks.json'), JSON.stringify(hooks, null, 2) + '\n');
console.log(`matrix.json: ${matrix.length} designs from ${types.length} types (TARGET ${TARGET}); hooks.json: ${hooks.length}`);
console.log('per-type variant counts:', types.map((t) => `${t.key}:${t.variants.length}`).join(' '));

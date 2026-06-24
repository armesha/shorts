#!/usr/bin/env node
// Build matrix.json (one design per type, canonical variant {}) + hooks.json (English title per
// design) from manifest.json. No variants — the "real types × 5 langs" plan.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const man = JSON.parse(readFileSync(resolve(HERE, 'manifest.json'), 'utf8'));
const matrix = man.map((m) => ({ id: m.id, key: m.id, html: m.html, variant: {}, dur: m.dur, fps: m.fps, name: m.name }));
const hooks = man.map((m) => ({ id: m.id, en: m.title || '' }));
writeFileSync(resolve(HERE, 'matrix.json'), JSON.stringify(matrix, null, 2) + '\n');
writeFileSync(resolve(HERE, 'hooks.json'), JSON.stringify(hooks, null, 2) + '\n');
console.log(`matrix.json: ${matrix.length} designs; hooks.json: ${hooks.length} (non-empty EN: ${hooks.filter((h) => h.en.trim()).length})`);

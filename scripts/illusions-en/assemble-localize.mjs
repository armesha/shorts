#!/usr/bin/env node
// Assemble localize.json { "<id>": { en, de, it, es, ru } } from hooks.json (English) + the translate
// workflow's result file (byLang). Usage: node assemble-localize.mjs <translate-output-file>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const outFile = process.argv[2];
if (!outFile) { console.error('usage: assemble-localize.mjs <translate-output-file>'); process.exit(2); }

const raw = readFileSync(outFile, 'utf8');
let byLang = null;
try { const o = JSON.parse(raw); const r = typeof o.result === 'string' ? JSON.parse(o.result) : o.result; byLang = r?.byLang || r; } catch { /* fall through */ }
if (!byLang || !byLang.de) {
  const m = raw.match(/"byLang"\s*:\s*(\{[\s\S]*\})\s*\}?\s*(,\s*"usage"|$)/);
  if (m) { try { byLang = JSON.parse(m[1]); } catch {} }
}
if (!byLang || !byLang.de) { console.error('could not extract byLang from output file'); process.exit(1); }

const hooks = JSON.parse(readFileSync(resolve(HERE, 'hooks.json'), 'utf8'));
const LANGS = ['de', 'it', 'es', 'ru'];
const loc = {};
let missing = 0;
for (const h of hooks) {
  const en = h.en || '';
  const entry = { en };
  for (const l of LANGS) {
    const t = en.trim() ? (byLang[l] && byLang[l][h.id]) : '';
    if (en.trim() && !t) missing++;
    entry[l] = t || '';
  }
  loc[h.id] = entry;
}
writeFileSync(resolve(HERE, 'localize.json'), JSON.stringify(loc, null, 2) + '\n');
const cov = Object.fromEntries(LANGS.map((l) => [l, Object.keys(byLang[l] || {}).length]));
console.log(`localize.json: ${Object.keys(loc).length} designs; per-lang translations:`, JSON.stringify(cov), missing ? `(MISSING ${missing})` : '(complete)');

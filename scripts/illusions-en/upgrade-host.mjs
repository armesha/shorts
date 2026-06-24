#!/usr/bin/env node
// Deterministically migrate every illusions/<key>.html from the v1 host to skeleton-v2:
// keep the illusion's own SPEC + drawIllusion (between the region markers), swap the host boilerplate
// for skeleton-v2 (adds H.v variants / H.PALETTES / renderBase / renderTitle). variant-0 == original
// because v1 drawIllusion simply ignores the new H.v. Backs up originals to illusions-v1-backup/.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ILL = resolve(HERE, 'illusions');
const BACKUP = resolve(HERE, 'illusions-v1-backup');
const V2 = resolve(HERE, 'skeleton-v2.html');

const SPEC_MARK = '(1) SPEC — replace these values';
const DRAW_MARK = '(2) drawIllusion — replace this whole function body';
// Host-level region boundary "// ====...====" — EXACTLY 2-space indent. In-function decorative
// "// ====" comments are indented >=4 spaces, so they must NOT match (that truncated devilsfork).
const isRule = (l) => /^ {2}\/\/ ={10,}\s*$/.test(l);

function splitRegions(text, file) {
  const lines = text.split('\n');
  const iSpec = lines.findIndex((l) => l.includes(SPEC_MARK));
  const iDraw = lines.findIndex((l) => l.includes(DRAW_MARK));
  if (iSpec < 0 || iDraw < 0) throw new Error(`markers missing in ${file}`);
  let iSpecEnd = -1; for (let i = iSpec + 1; i < lines.length; i++) if (isRule(lines[i])) { iSpecEnd = i; break; }
  let iDrawEnd = -1; for (let i = iDraw + 1; i < lines.length; i++) if (isRule(lines[i])) { iDrawEnd = i; break; }
  if (iSpecEnd < 0 || iDrawEnd < 0) throw new Error(`closing rule missing in ${file}`);
  return {
    head: lines.slice(0, iSpec + 1).join('\n'),
    specBody: lines.slice(iSpec + 1, iSpecEnd).join('\n'),
    mid: lines.slice(iSpecEnd, iDraw + 1).join('\n'),
    drawBody: lines.slice(iDraw + 1, iDrawEnd).join('\n'),
    tail: lines.slice(iDrawEnd).join('\n'),
  };
}

const v2 = splitRegions(readFileSync(V2, 'utf8'), 'skeleton-v2.html');
mkdirSync(BACKUP, { recursive: true });
const files = readdirSync(ILL).filter((f) => f.endsWith('.html'));
let ok = 0, fail = 0;
for (const f of files) {
  const p = resolve(ILL, f);
  try {
    const txt = readFileSync(p, 'utf8');
    if (txt.includes('window.renderBase')) { console.log(`skip ${f} (already v2)`); ok++; continue; }
    const ill = splitRegions(txt, f);
    if (!ill.specBody.includes('SPEC') || !ill.drawBody.includes('function drawIllusion')) throw new Error('extracted body looks wrong');
    if (!existsSync(resolve(BACKUP, f))) copyFileSync(p, resolve(BACKUP, f));
    const merged = [v2.head, ill.specBody, v2.mid, ill.drawBody, v2.tail].join('\n');
    writeFileSync(p, merged);
    ok++;
  } catch (e) { fail++; console.log(`FAIL ${f}: ${e.message}`); }
}
console.log(`upgrade-host: ${ok} migrated, ${fail} failed (backup in ${BACKUP})`);

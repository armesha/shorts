#!/usr/bin/env node
// Generate a free, royalty-free ambient pad for the illusions-en pack (ffmpeg synthesis, no external asset).
// Loudness-normalised (I=-16) so it is actually audible after the quiet mux (lesson from illusions-3d).
// Output: assets/audio/illusions-en/ambient.mp3  (~32s, loopable)
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(ROOT, 'assets/audio/illusions-en/ambient.mp3');
mkdirSync(dirname(OUT), { recursive: true });

// Calm, slightly hypnotic chord (D2/A2/D3/F#3) with slow tremolo, lowpass warmth and a long echo tail.
const D = 32;
const fc = '[0:a]volume=0.5[a0];[1:a]volume=0.34[a1];[2:a]volume=0.24[a2];[3:a]volume=0.16[a3];' +
  '[a0][a1][a2][a3]amix=inputs=4:normalize=0,tremolo=f=0.10:d=0.32,' +
  'lowpass=f=1500,aecho=0.8:0.85:140:0.35,loudnorm=I=-16:TP=-1.0:LRA=11,' +
  `afade=t=in:st=0:d=2.5,afade=t=out:st=${D - 2.5}:d=2.5[out]`;

execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', `sine=frequency=73.42:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=110.00:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=146.83:duration=${D}`,
  '-f', 'lavfi', '-i', `sine=frequency=185.00:duration=${D}`,
  '-filter_complex', fc, '-map', '[out]', '-ac', '2', '-ar', '48000', '-b:a', '192k', OUT],
  { stdio: 'inherit' });

if (!existsSync(OUT)) { console.error('audio synth failed'); process.exit(1); }
console.log('ambient written:', OUT);

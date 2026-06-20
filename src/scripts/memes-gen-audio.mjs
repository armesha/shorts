// Generate copyright-free QUIET, LIGHT, DIVERSE background beds for the memes deck.
// 100% synthesized with ffmpeg (summed sine partials, melodic arpeggios via adelay, faint lo-fi hiss,
// tremolo + reverb) → no licensing/attribution and cannot match any Content-ID fingerprint. Several
// timbre families (pads, music-box/bells, pizzicato arps, lo-fi, quirky) in major & minor so the deck
// rotates real variety under random ~6s meme clips. Re-run to regenerate. Run: node src/scripts/memes-gen-audio.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const pexec = promisify(execFile);
const OUT = "/home/davtian/Documents/shorts/assets/audio/memes";
mkdirSync(OUT, { recursive: true });

const DUR = 16;

// ---- held-chord PAD ----
function pad(name, notes, opts = {}) {
  const { lpf = 3000, tremF = 2.0, tremD = 0.1, echo = true, noise = 0, octave = 0.34, I = -24 } = opts;
  const parts = [];
  let n = 0;
  for (const [f, a] of notes) {
    parts.push(`sine=frequency=${f}:duration=${DUR}:sample_rate=44100,volume=${a}[n${n}]`);
    n++;
    parts.push(`sine=frequency=${(f * 2).toFixed(2)}:duration=${DUR}:sample_rate=44100,volume=${(a * octave).toFixed(3)}[n${n}]`);
    n++;
  }
  if (noise > 0) {
    parts.push(`anoisesrc=color=pink:a=${noise}:d=${DUR}:r=44100[n${n}]`);
    n++;
  }
  const labels = Array.from({ length: n }, (_, i) => `[n${i}]`).join("");
  const echoChain = echo ? `aecho=0.8:0.85:60|110:0.35|0.2,` : ``;
  const fc =
    parts.join(";") + ";" +
    `${labels}amix=inputs=${n}:normalize=0[mix];` +
    `[mix]tremolo=f=${tremF}:d=${tremD},lowpass=f=${lpf},` + echoChain +
    `alimiter=limit=0.9,afade=t=in:st=0:d=2,afade=t=out:st=${DUR - 2}:d=2,loudnorm=I=${I}:TP=-2,aresample=44100`;
  return { name, fc };
}

// ---- melodic SEQUENCE (arpeggio / pluck / bells) ----
// events: [freqHz, startSec, durSec, amp]; each note is a sine with a decay envelope, placed with adelay.
function seq(name, events, opts = {}) {
  const { lpf = 4200, echo = true, I = -24, ring = 1.0 } = opts;
  const parts = events.map(([f, st, du, a], i) => {
    const d = (du * ring).toFixed(3);
    return `sine=frequency=${f}:duration=${d}:sample_rate=44100,volume=${a},afade=t=out:st=0:d=${d},adelay=${Math.round(st * 1000)}[s${i}]`;
  });
  const labels = events.map((_, i) => `[s${i}]`).join("");
  const echoChain = echo ? `aecho=0.8:0.8:90|170:0.3|0.16,` : ``;
  const fc =
    parts.join(";") + ";" +
    `${labels}amix=inputs=${events.length}:normalize=0[mix];` +
    `[mix]lowpass=f=${lpf},${echoChain}alimiter=limit=0.9,` +
    `apad=whole_dur=${DUR},atrim=0:${DUR},afade=t=in:st=0:d=0.4,afade=t=out:st=${DUR - 2}:d=2,loudnorm=I=${I}:TP=-2,aresample=44100`;
  return { name, fc };
}

// arpeggio helper: tile a scale-index pattern across the whole DUR.
function arp(scale, pattern, noteLen, amp, ring = 1.7) {
  const ev = [];
  const total = Math.ceil(DUR / noteLen);
  for (let i = 0; i < total; i++) {
    const f = scale[pattern[i % pattern.length] % scale.length];
    ev.push([f, +(i * noteLen).toFixed(3), +(noteLen * ring).toFixed(3), amp]);
  }
  return ev;
}

const C_MAJ_HI = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5]; // C major (bells)
const A_MIN_MID = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0]; // A minor
const C_MAJ_MID = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C major (mid)
const D_MIX = [293.66, 349.23, 392.0, 440.0, 587.33]; // D-ish bouncy

const variants = [
  // — PADS (held chords): warm/bright/deep/moody/dreamy —
  pad("pad_warm.mp3", [[130.81, 0.46], [164.81, 0.36], [196.0, 0.36], [246.94, 0.26]], { lpf: 2500, tremF: 1.5, tremD: 0.08 }),
  pad("pad_bright.mp3", [[146.83, 0.46], [185.0, 0.38], [220.0, 0.38], [277.18, 0.24]], { lpf: 4200, tremF: 2.4, tremD: 0.12, octave: 0.3 }),
  pad("pad_deep.mp3", [[98.0, 0.5], [123.47, 0.4], [146.83, 0.4], [196.0, 0.28]], { lpf: 2200, tremF: 1.2, tremD: 0.07 }),
  pad("pad_moody.mp3", [[110.0, 0.46], [130.81, 0.38], [164.81, 0.38], [220.0, 0.24]], { lpf: 2600, tremF: 1.8, tremD: 0.1 }), // A minor — deadpan/ironic
  pad("pad_dream.mp3", [[164.81, 0.4], [220.0, 0.34], [246.94, 0.34], [329.63, 0.22]], { lpf: 3600, tremF: 0.9, tremD: 0.06, echo: true }),
  // — MUSIC-BOX / BELLS (plucky highs) —
  seq("box_major.mp3", arp(C_MAJ_HI, [0, 2, 4, 2, 3, 5, 4, 2], 0.5, 0.42, 1.4), { lpf: 6500, ring: 1.0 }),
  seq("box_minor.mp3", arp([329.63, 392.0, 440.0, 523.25, 659.25], [0, 1, 2, 4, 3, 2, 1, 0], 0.55, 0.4, 1.4), { lpf: 6000 }),
  // — PIZZICATO / ARPEGGIO (mid, light bounce) —
  seq("arp_bounce.mp3", arp(C_MAJ_MID, [0, 2, 4, 5, 4, 2], 0.34, 0.46, 1.2), { lpf: 3800 }),
  seq("arp_walk.mp3", arp(A_MIN_MID, [0, 1, 2, 3, 2, 1], 0.4, 0.44, 1.3), { lpf: 3400 }),
  seq("pluck_playful.mp3", arp(D_MIX, [0, 2, 1, 3, 4, 2], 0.3, 0.46, 0.9), { lpf: 4000, ring: 0.8 }),
  // — LO-FI (cosy + faint hiss) —
  pad("lofi_chill.mp3", [[130.81, 0.44], [164.81, 0.34], [196.0, 0.34], [246.94, 0.22]], { lpf: 2300, tremF: 1.3, tremD: 0.07, noise: 0.018 }),
  pad("lofi_tape.mp3", [[123.47, 0.44], [146.83, 0.36], [185.0, 0.34], [220.0, 0.22]], { lpf: 2000, tremF: 1.0, tremD: 0.05, noise: 0.022 }),
  // — QUIRKY / COMEDIC —
  seq("quirky_boop.mp3", arp([392.0, 329.63, 440.0, 293.66], [0, 2, 1, 3, 0, 2], 0.36, 0.46, 0.7), { lpf: 3200, ring: 0.55 }),
  seq("quirky_skip.mp3", arp([523.25, 392.0, 659.25, 440.0], [0, 1, 2, 1, 3, 1], 0.32, 0.42, 0.8), { lpf: 5000, ring: 0.7 }),
];

let ok = 0;
for (const v of variants) {
  try {
    await pexec(
      ffmpegPath,
      ["-y", "-filter_complex", v.fc, "-t", String(DUR), "-ar", "44100", "-ac", "2", "-b:a", "160k", `${OUT}/${v.name}`],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
    );
    ok++;
    console.log("generated", v.name);
  } catch (e) {
    console.error("FAIL", v.name, String(e.message).split("\n").slice(-3).join(" "));
  }
}
console.log(`DONE → assets/audio/memes/ (${ok}/${variants.length})`);

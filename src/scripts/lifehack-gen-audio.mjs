// Generate copyright-free upbeat background beds for lifehack decks.
// 100% synthesized with ffmpeg sine/noise filters: no sampled music, no downloaded assets.
// Run: node src/scripts/lifehack-gen-audio.mjs
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";

const pexec = promisify(execFile);
const OUT = "/home/davtian/Documents/shorts/assets/audio/lifehacks";
mkdirSync(OUT, { recursive: true });

const DUR = 18;

function seq(name, notes, opts = {}) {
  const { step = 0.32, amp = 0.36, lpf = 4600, I = -23, echo = "70|140:0.22|0.12" } = opts;
  const events = [];
  const total = Math.ceil(DUR / step);
  for (let i = 0; i < total; i++) {
    const f = notes[i % notes.length];
    const st = +(i * step).toFixed(3);
    events.push([f, st, +(step * 1.35).toFixed(3), amp]);
  }
  const parts = events.map(([f, st, du, a], i) =>
    `sine=frequency=${f}:duration=${du}:sample_rate=44100,volume=${a},afade=t=out:st=0:d=${du},adelay=${Math.round(st * 1000)}[s${i}]`,
  );
  const labels = events.map((_, i) => `[s${i}]`).join("");
  const fc = `${parts.join(";")};${labels}amix=inputs=${events.length}:normalize=0[mix];` +
    `[mix]lowpass=f=${lpf},aecho=0.8:0.78:${echo},apad=whole_dur=${DUR},atrim=0:${DUR},` +
    `afade=t=in:st=0:d=0.4,afade=t=out:st=${DUR - 2}:d=2,loudnorm=I=${I}:TP=-2,aresample=44100`;
  return { name, fc };
}

function pad(name, notes, opts = {}) {
  const { trem = 1.4, lpf = 2600, I = -24, noise = 0.01 } = opts;
  const parts = [];
  let n = 0;
  for (const [f, a] of notes) {
    parts.push(`sine=frequency=${f}:duration=${DUR}:sample_rate=44100,volume=${a}[n${n++}]`);
    parts.push(`sine=frequency=${(f * 2).toFixed(2)}:duration=${DUR}:sample_rate=44100,volume=${(a * 0.24).toFixed(3)}[n${n++}]`);
  }
  if (noise) parts.push(`anoisesrc=color=pink:a=${noise}:d=${DUR}:r=44100[n${n++}]`);
  const labels = Array.from({ length: n }, (_, i) => `[n${i}]`).join("");
  const fc = `${parts.join(";")};${labels}amix=inputs=${n}:normalize=0[mix];` +
    `[mix]tremolo=f=${trem}:d=0.08,lowpass=f=${lpf},aecho=0.8:0.7:90|180:0.18|0.1,` +
    `alimiter=limit=0.9,afade=t=in:st=0:d=1,afade=t=out:st=${DUR - 2}:d=2,loudnorm=I=${I}:TP=-2,aresample=44100`;
  return { name, fc };
}

const variants = [
  seq("spark_loop.mp3", [523.25, 659.25, 783.99, 987.77, 880.0, 659.25], { step: 0.28, amp: 0.32, lpf: 5200 }),
  seq("busy_pluck.mp3", [392.0, 493.88, 587.33, 739.99, 659.25, 493.88], { step: 0.34, amp: 0.34, lpf: 4300 }),
  seq("clean_clicks.mp3", [329.63, 392.0, 493.88, 587.33, 493.88, 392.0], { step: 0.38, amp: 0.36, lpf: 3800 }),
  seq("quick_steps.mp3", [293.66, 369.99, 440.0, 587.33, 554.37, 440.0], { step: 0.3, amp: 0.33, lpf: 4700 }),
  pad("bright_pad.mp3", [[130.81, 0.36], [164.81, 0.3], [196.0, 0.28], [261.63, 0.18]], { trem: 1.6, lpf: 3000 }),
  pad("focus_pad.mp3", [[146.83, 0.34], [185.0, 0.3], [220.0, 0.26], [293.66, 0.16]], { trem: 1.1, lpf: 2400, noise: 0.014 }),
];

let ok = 0;
for (const v of variants) {
  await pexec(
    ffmpegPath,
    ["-y", "-filter_complex", v.fc, "-t", String(DUR), "-ar", "44100", "-ac", "2", "-b:a", "160k", `${OUT}/${v.name}`],
    { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
  );
  ok++;
  console.log("generated", v.name);
}
console.log(`DONE -> assets/audio/lifehacks (${ok}/${variants.length})`);

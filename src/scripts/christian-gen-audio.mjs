// Generate copyright-free SACRED PAD beds (warm organ/choir-like drones) for the Christian deck.
// 100% synthesized with ffmpeg (summed sine partials + reverb) → no licensing/attribution at all.
// Christian videos use these instead of the instrumental music pool. Re-run to regenerate.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const pexec = promisify(execFile);
const OUT = "/home/davtian/Documents/shorts/assets/audio/christian";
mkdirSync(OUT, { recursive: true });

const DUR = 12;
// A chord = list of [frequencyHz, amplitude]. Low fundamentals + octave/fifth shimmer ≈ organ pad.
// Each note also gets a quiet octave-up partial for an organ-ish timbre (added in build()).
function build(name, notes) {
  const parts = [];
  let n = 0;
  for (const [f, a] of notes) {
    parts.push(`sine=frequency=${f}:duration=${DUR}:sample_rate=44100,volume=${a}[n${n}]`);
    n++;
    // octave-up partial at ~40% amplitude for richness
    parts.push(`sine=frequency=${(f * 2).toFixed(2)}:duration=${DUR}:sample_rate=44100,volume=${(a * 0.38).toFixed(3)}[n${n}]`);
    n++;
  }
  const labels = Array.from({ length: n }, (_, i) => `[n${i}]`).join("");
  const fc =
    parts.join(";") + ";" +
    `${labels}amix=inputs=${n}:normalize=0[mix];` +
    // slow tremolo (Leslie-ish), warm lowpass, cathedral reverb, gentle stereo, fades, level
    `[mix]tremolo=f=2.1:d=0.12,lowpass=f=3000,` +
    `aecho=0.8:0.85:90|160|240:0.45|0.3|0.18,` +
    `alimiter=limit=0.92,` +
    `afade=t=in:st=0:d=2.8,afade=t=out:st=${DUR - 2}:d=2,` +
    `loudnorm=I=-23:TP=-2,aresample=44100`;
  return { name, fc };
}

// Three moods (all major / peaceful). Frequencies in Hz.
const variants = [
  build("pad_grace.mp3", [[130.81, 0.5], [164.81, 0.42], [196.0, 0.42], [261.63, 0.34], [392.0, 0.16]]),     // C major
  build("pad_sanctuary.mp3", [[98.0, 0.52], [123.47, 0.42], [146.83, 0.42], [196.0, 0.32], [293.66, 0.16]]), // G major (deeper)
  build("pad_dawn.mp3", [[146.83, 0.48], [185.0, 0.4], [220.0, 0.4], [293.66, 0.32], [440.0, 0.15]]),         // D major (brighter)
];

for (const v of variants) {
  await pexec(
    ffmpegPath,
    ["-y", "-filter_complex", v.fc, "-t", String(DUR), "-ar", "44100", "-ac", "2", "-b:a", "160k", `${OUT}/${v.name}`],
    { maxBuffer: 64 * 1024 * 1024, timeout: 60000 },
  );
  console.log("generated", v.name);
}
console.log("DONE → assets/audio/christian/");

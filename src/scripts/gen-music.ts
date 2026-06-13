import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";

// Generates ~15 soft looping placeholder tracks (major triads, varied keys/tremolo).
// Replace with real royalty-free tracks anytime — just drop files in this folder.
const pexec = promisify(execFile);
const FF = ffmpegPath as unknown as string;
const OUT = resolve(process.cwd(), "assets/audio/anekdoty");
await mkdir(OUT, { recursive: true });
await rm(resolve(OUT, "pad-major-c.mp3"), { force: true });
await rm(resolve(OUT, "pad-major-f.mp3"), { force: true });

const NOTE: Record<string, number> = {
  C: 261.63, Cs: 277.18, D: 293.66, Ds: 311.13, E: 329.63, F: 349.23,
  Fs: 369.99, G: 392.0, Gs: 415.3, A: 440.0, As: 466.16, B: 493.88,
};
const triad = (r: number) => [r, r * 2 ** (4 / 12), r * 2 ** (7 / 12)];

const roots = ["C", "D", "E", "F", "G", "A", "B", "Cs", "Ds", "Fs", "Gs", "As", "C", "G", "F"];
const trems = [5, 6, 4.5, 5.5, 4, 6.5, 5, 4.8, 5.2, 6, 4.2, 5.8, 3.8, 7, 4.5];

for (let k = 0; k < 15; k++) {
  const f = triad(NOTE[roots[k]]);
  const name = `loop-${String(k + 1).padStart(2, "0")}.mp3`;
  await pexec(
    FF,
    [
      "-y",
      "-f", "lavfi", "-i", `sine=frequency=${f[0].toFixed(2)}:duration=6`,
      "-f", "lavfi", "-i", `sine=frequency=${f[1].toFixed(2)}:duration=6`,
      "-f", "lavfi", "-i", `sine=frequency=${f[2].toFixed(2)}:duration=6`,
      "-filter_complex",
      `[0][1][2]amix=inputs=3:normalize=0,volume=0.4,tremolo=f=${trems[k]}:d=0.4,afade=t=in:d=0.3,afade=t=out:st=5.4:d=0.6`,
      "-c:a", "libmp3lame", "-b:a", "128k",
      resolve(OUT, name),
    ],
    { timeout: 60_000 },
  );
  console.log("track ->", name);
}
console.log("done: 15 loops");

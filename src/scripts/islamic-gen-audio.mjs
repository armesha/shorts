// Generate copyright-free nature-ambient beds (wind + light rain) for the Islamic deck.
// 100% synthesized with ffmpeg → no licensing/attribution at all (no musical instruments).
// Islamic videos use these instead of the instrumental music pool. Re-run to regenerate.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";

const pexec = promisify(execFile);
const OUT = "/home/davtian/Documents/shorts/assets/audio/islamic";
mkdirSync(OUT, { recursive: true });

const variants = [
  {
    name: "ambient_wind.mp3",
    // brown noise → soft low wind with slow gusts, + faint high hiss
    fc:
      "anoisesrc=color=brown:amplitude=0.85:duration=9[b];" +
      "anoisesrc=color=pink:amplitude=0.16:duration=9,highpass=f=1800,lowpass=f=6500[h];" +
      "[b]lowpass=f=420,tremolo=f=0.11:d=0.6[w];" +
      "[w][h]amix=inputs=2:weights=1 0.5:normalize=0," +
      "afade=t=in:st=0:d=1.3,afade=t=out:st=8:d=1,loudnorm=I=-21:TP=-2",
  },
  {
    name: "ambient_rain.mp3",
    // steady gentle rain (filtered white) over a low rumble bed
    fc:
      "anoisesrc=color=brown:amplitude=0.5:duration=9[b];" +
      "anoisesrc=color=white:amplitude=0.3:duration=9,highpass=f=900,lowpass=f=8200[r];" +
      "[b]lowpass=f=600[w];" +
      "[w][r]amix=inputs=2:weights=0.7 1:normalize=0," +
      "afade=t=in:st=0:d=1,afade=t=out:st=8:d=1,loudnorm=I=-21:TP=-2",
  },
];

for (const v of variants) {
  await pexec(ffmpegPath, ["-y", "-filter_complex", v.fc, "-t", "9", "-ar", "44100", "-ac", "2", "-b:a", "160k", `${OUT}/${v.name}`], {
    maxBuffer: 64 * 1024 * 1024,
    timeout: 60000,
  });
  console.log("generated", v.name);
}
console.log("DONE → assets/audio/islamic/");

// Generate small copyright-free animated stickers for lifehack cards.
// The GIFs are made from ffmpeg color/drawtext filters only: no downloaded art, no Content-ID source.
// Run: node src/scripts/lifehack-gen-motion.mjs
import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { promisify } from "node:util";
import { resolve } from "node:path";

const pexec = promisify(execFile);
const OUT = resolve(process.cwd(), "assets/motion/lifehacks");
const FFMPEG = existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg";
mkdirSync(OUT, { recursive: true });

const W = 300;
const H = 300;
const DUR = 2.4;
const R = 18;

function escText(s) {
  return s.replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

function filter(bg, steps) {
  const chain = [
    `format=rgba`,
    `drawbox=x=0:y=0:w=iw:h=ih:color=${bg}:t=fill`,
    `drawbox=x=18:y=18:w=${W - 36}:h=${H - 36}:color=white@0.22:t=5`,
    ...steps,
  ].join(",");
  return `[0:v]${chain},split[s0][s1];[s0]palettegen=reserve_transparent=0[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`;
}

const FONT = "font='DejaVu Sans'";
const variants = [
  {
    file: "eyes-look.gif",
    bg: "0xfef3c7",
    steps: [
      `drawtext=${FONT}:text='${escText("LOOK")}':fontsize=38:fontcolor=0x78350f:x=(w-text_w)/2:y=46+4*sin(6.283*t/1.2)`,
      `drawtext=${FONT}:text='${escText("O     O")}':fontsize=78:fontcolor=0x111827:x=(w-text_w)/2:y=104`,
      `drawtext=${FONT}:text='${escText("•     •")}':fontsize=64:fontcolor=0x2563eb:x=(w-text_w)/2+18*sin(6.283*t/1.2):y=117`,
      `drawtext=${FONT}:text='${escText("__")}':fontsize=34:fontcolor=0x78350f:x=(w-text_w)/2:y=206+8*sin(6.283*t/2.4)`,
    ],
  },
  {
    file: "idea-pop.gif",
    bg: "0xecfeff",
    steps: [
      `drawtext=${FONT}:text='${escText("TIP")}':fontsize=46:fontcolor=0x155e75:x=(w-text_w)/2:y=42`,
      `drawtext=${FONT}:text='${escText("!")}':fontsize=128:fontcolor=0xf59e0b:x=(w-text_w)/2:y=92-10*abs(sin(6.283*t/2.4))`,
      `drawbox=x=118:y=220:w=64:h=12:color=0x155e75:t=fill`,
      `drawbox=x=128:y=238:w=44:h=10:color=0x155e75:t=fill`,
      `drawtext=${FONT}:text='${escText("*  *  *")}':fontsize=28:fontcolor=0xf59e0b:x=(w-text_w)/2:y=88+12*sin(6.283*t/2.4)`,
    ],
  },
  {
    file: "scan-check.gif",
    bg: "0xf0fdf4",
    steps: [
      `drawtext=${FONT}:text='${escText("CHECK")}':fontsize=35:fontcolor=0x14532d:x=(w-text_w)/2:y=42`,
      `drawbox=x=58:y=102:w=184:h=120:color=0xffffff:t=fill`,
      `drawbox=x=58:y=102:w=184:h=120:color=0x22c55e:t=4`,
      `drawtext=${FONT}:text='${escText("|")}':fontsize=116:fontcolor=0x22c55e@0.85:x=82+76*abs(sin(6.283*t/2.4)):y=102`,
      `drawtext=${FONT}:text='${escText("OK")}':fontsize=58:fontcolor=0x166534:x=(w-text_w)/2:y=132`,
    ],
  },
  {
    file: "tap-arrow.gif",
    bg: "0xfff1f2",
    steps: [
      `drawtext=${FONT}:text='${escText("SAVE")}':fontsize=40:fontcolor=0x9f1239:x=(w-text_w)/2:y=42`,
      `drawtext=${FONT}:text='${escText(">")}':fontsize=116:fontcolor=0xe11d48:x=78+26*abs(sin(6.283*t/1.2)):y=100`,
      `drawbox=x=176:y=134:w=58:h=58:color=0xffffff:t=fill`,
      `drawbox=x=176:y=134:w=58:h=58:color=0xe11d48:t=4`,
      `drawbox=x=194:y=152:w=22:h=22:color=0xe11d48@0.45:t=fill`,
    ],
  },
  {
    file: "radar-pulse.gif",
    bg: "0xeff6ff",
    steps: [
      `drawtext=${FONT}:text='${escText("WHY?")}':fontsize=42:fontcolor=0x1e3a8a:x=(w-text_w)/2:y=42`,
      `drawbox=x=88:y=106:w=124:h=124:color=0xffffff:t=fill`,
      `drawbox=x=88:y=106:w=124:h=124:color=0x2563eb:t=5`,
      `drawtext=${FONT}:text='${escText("o")}':fontsize=58:fontcolor=0xf97316:x=103+36*sin(6.283*t/2.4):y=113+36*cos(6.283*t/2.4)`,
      `drawbox=x=135:y=153:w=30:h=30:color=0x2563eb@0.75:t=fill`,
      `drawbox=x=78:y=96:w=144:h=144:color=0x60a5fa@0.28:t=3`,
    ],
  },
];

let ok = 0;
for (const v of variants) {
  const fc = filter(v.bg, v.steps);
  await pexec(
    FFMPEG,
    [
      "-y",
      "-f", "lavfi", "-i", `color=c=black:s=${W}x${H}:d=${DUR}:r=${R}`,
      "-filter_complex", fc,
      "-loop", "0",
      resolve(OUT, v.file),
    ],
    { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 },
  );
  ok++;
  console.log("generated", v.file);
}
console.log(`DONE -> ${OUT} (${ok}/${variants.length})`);

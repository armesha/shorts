import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "assets/motion/jokes");
const TMP_DIR = resolve(ROOT, "temp/joke-motion-build");

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const r = spawnSync("test", ["-x", candidate]);
    if (r.status === 0) return candidate;
  }
  throw new Error("Chrome/Chromium binary not found");
}

const specs = [
  { id: "laugh-bounce", face: "#ffd43b", tear: "#35a7ff", mouth: "#4b1d18", accent: "#ff8a00", mode: "bounce", shape: "round", decor: "marks" },
  { id: "laugh-wiggle", face: "#ffcc4d", tear: "#48cae4", mouth: "#301314", accent: "#e63946", mode: "wiggle", shape: "oval", decor: "drops" },
  { id: "laugh-pop", face: "#ffe066", tear: "#60a5fa", mouth: "#3f1516", accent: "#22c55e", mode: "pop", shape: "round", decor: "ring" },
  { id: "laugh-squash", face: "#ffd166", tear: "#38bdf8", mouth: "#3a0f16", accent: "#fb7185", mode: "squash", shape: "bean", decor: "confetti" },
  { id: "laugh-shake", face: "#facc15", tear: "#0ea5e9", mouth: "#441818", accent: "#a855f7", mode: "shake", shape: "round", decor: "zigzag" },
  { id: "laugh-nod", face: "#fcd34d", tear: "#22d3ee", mouth: "#381016", accent: "#14b8a6", mode: "nod", shape: "squircle", decor: "bubbles" },
  { id: "laugh-tilt", face: "#fde047", tear: "#67e8f9", mouth: "#3d1214", accent: "#f97316", mode: "tilt", shape: "tilted", decor: "sunburst" },
  { id: "laugh-hop", face: "#ffdf64", tear: "#2563eb", mouth: "#2f1113", accent: "#84cc16", mode: "hop", shape: "round", decor: "shadow" },
  { id: "laugh-pulse", face: "#fee440", tear: "#38bdf8", mouth: "#431407", accent: "#ef4444", mode: "pulse", shape: "soft", decor: "hearts" },
  { id: "laugh-slide", face: "#ffe45e", tear: "#3b82f6", mouth: "#421717", accent: "#06b6d4", mode: "slide", shape: "oval", decor: "speed" },
  { id: "laugh-drum", face: "#ffd24a", tear: "#60a5fa", mouth: "#361010", accent: "#f59e0b", mode: "drum", shape: "round", decor: "beats" },
  { id: "laugh-spark", face: "#fff176", tear: "#29b6f6", mouth: "#4a1714", accent: "#ec4899", mode: "spark", shape: "soft", decor: "sparkles" },
  { id: "laugh-wave", face: "#ffda55", tear: "#7dd3fc", mouth: "#451a1a", accent: "#10b981", mode: "wave", shape: "bean", decor: "waves" },
  { id: "laugh-flip", face: "#ffd95a", tear: "#0ea5e9", mouth: "#321112", accent: "#6366f1", mode: "flip", shape: "squircle", decor: "triangles" },
  { id: "laugh-zoom", face: "#fef08a", tear: "#2dd4bf", mouth: "#3b1516", accent: "#eab308", mode: "zoom", shape: "round", decor: "burst" },
];

function frameState(mode, i, frames) {
  const t = i / frames;
  const wave = Math.sin(t * Math.PI * 2);
  if (mode === "wiggle") return { rot: wave * 9, scale: 1 + Math.abs(wave) * 0.04, y: Math.cos(t * Math.PI * 4) * 5 };
  if (mode === "pop") return { rot: Math.sin(t * Math.PI * 4) * 4, scale: 0.94 + Math.abs(wave) * 0.11, y: -Math.abs(wave) * 13 };
  if (mode === "squash") return { rot: wave * 3, scale: 1 + Math.abs(wave) * 0.09, scaleY: 1 - Math.abs(wave) * 0.07, y: Math.abs(wave) * 9 };
  if (mode === "shake") return { rot: Math.sin(t * Math.PI * 8) * 7, scale: 1.03, x: Math.sin(t * Math.PI * 12) * 8, y: Math.cos(t * Math.PI * 8) * 4 };
  if (mode === "nod") return { rot: wave * 2, scale: 1.02, y: Math.sin(t * Math.PI * 4) * 12 };
  if (mode === "tilt") return { rot: Math.sin(t * Math.PI * 2) * 14, scale: 1 + Math.abs(wave) * 0.03, y: Math.cos(t * Math.PI * 2) * 4 };
  if (mode === "hop") return { rot: wave * 5, scale: 1, y: -Math.max(0, wave) * 34 };
  if (mode === "pulse") return { rot: 0, scale: 0.96 + Math.abs(wave) * 0.13, y: 0 };
  if (mode === "slide") return { rot: wave * 4, scale: 1.02, x: wave * 16, y: -Math.abs(wave) * 8 };
  if (mode === "drum") return { rot: Math.sin(t * Math.PI * 10) * 4, scale: 1 + Math.abs(Math.sin(t * Math.PI * 6)) * 0.06, y: Math.sin(t * Math.PI * 6) * 8 };
  if (mode === "spark") return { rot: Math.sin(t * Math.PI * 6) * 6, scale: 1 + Math.abs(wave) * 0.08, y: -Math.abs(wave) * 10 };
  if (mode === "wave") return { rot: Math.sin(t * Math.PI * 2) * 10, scale: 1.01, y: Math.sin(t * Math.PI * 4) * 6 };
  if (mode === "flip") return { rot: Math.sin(t * Math.PI * 2) * 16, scale: 1 + Math.abs(wave) * 0.05, y: -Math.abs(wave) * 9 };
  if (mode === "zoom") return { rot: wave * 3, scale: 0.92 + Math.abs(wave) * 0.16, y: -Math.abs(wave) * 5 };
  return { rot: wave * 6, scale: 1 + Math.abs(wave) * 0.06, y: -Math.abs(wave) * 18 };
}

function decorHtml(decor) {
  const spans = {
    marks: '<div class="mark m1"></div><div class="mark m2"></div><div class="mark m3"></div>',
    drops: '<div class="drop d1"></div><div class="drop d2"></div><div class="drop d3"></div>',
    ring: '<div class="ring r1"></div><div class="ring r2"></div>',
    confetti: '<div class="conf c1"></div><div class="conf c2"></div><div class="conf c3"></div><div class="conf c4"></div>',
    zigzag: '<div class="zig z1"></div><div class="zig z2"></div>',
    bubbles: '<div class="bubble b1"></div><div class="bubble b2"></div><div class="bubble b3"></div>',
    sunburst: '<div class="ray a"></div><div class="ray b"></div><div class="ray c"></div><div class="ray d"></div>',
    shadow: '<div class="floor-shadow"></div><div class="hop-line h1"></div><div class="hop-line h2"></div>',
    hearts: '<div class="heart h1"></div><div class="heart h2"></div>',
    speed: '<div class="speed s1"></div><div class="speed s2"></div><div class="speed s3"></div>',
    beats: '<div class="beat bt1"></div><div class="beat bt2"></div><div class="beat bt3"></div>',
    sparkles: '<div class="sparkle sp1"></div><div class="sparkle sp2"></div><div class="sparkle sp3"></div>',
    waves: '<div class="wave w1"></div><div class="wave w2"></div><div class="wave w3"></div>',
    triangles: '<div class="tri t1"></div><div class="tri t2"></div><div class="tri t3"></div>',
    burst: '<div class="burst br1"></div><div class="burst br2"></div><div class="burst br3"></div><div class="burst br4"></div>',
  };
  return spans[decor] ?? spans.marks;
}

function html(spec, state) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { width: 360px; height: 360px; margin: 0; background: transparent; overflow: hidden; }
  .wrap {
    width: 360px; height: 360px;
    display: grid; place-items: center;
    position: relative;
  }
  .face {
    position: relative;
    width: var(--face-w, 260px); height: var(--face-h, 260px);
    border-radius: var(--face-radius, 50%);
    background:
      radial-gradient(circle at 34% 30%, rgba(255,255,255,.85), transparent 13%),
      radial-gradient(circle at 64% 78%, rgba(255,170,0,.28), transparent 24%),
      ${spec.face};
    border: 10px solid rgba(0,0,0,.12);
    box-shadow: 0 18px 28px rgba(0,0,0,.22);
    transform: translate(${state.x ?? 0}px, ${state.y}px) rotate(${state.rot}deg) scale(${state.scale}, ${state.scaleY ?? state.scale});
    transform-origin: 50% 55%;
  }
  .face.oval { --face-w: 282px; --face-h: 234px; --face-radius: 48% 52% 46% 54%; }
  .face.bean { --face-w: 272px; --face-h: 246px; --face-radius: 56% 44% 48% 52% / 46% 58% 42% 54%; }
  .face.squircle { --face-w: 254px; --face-h: 254px; --face-radius: 38%; }
  .face.tilted { --face-w: 258px; --face-h: 260px; --face-radius: 52% 38% 54% 42%; }
  .face.soft { --face-w: 266px; --face-h: 254px; --face-radius: 44% 56% 48% 52%; }
  .eye {
    position: absolute;
    top: 78px;
    width: 54px; height: 20px;
    border: 10px solid #20120d;
    border-top: 0; border-left: 0; border-right: 0;
    border-radius: 50%;
  }
  .eye.left { left: 58px; transform: rotate(14deg); }
  .eye.right { right: 58px; transform: rotate(-14deg); }
  .mouth {
    position: absolute;
    left: 50px; right: 50px; top: 118px; height: 82px;
    background: ${spec.mouth};
    border-radius: 0 0 90px 90px;
    overflow: hidden;
    border: 8px solid rgba(0,0,0,.12);
  }
  .mouth::before {
    content: "";
    position: absolute;
    left: 18px; right: 18px; top: 8px; height: 20px;
    background: #fff;
    border-radius: 0 0 20px 20px;
  }
  .mouth::after {
    content: "";
    position: absolute;
    left: 45px; right: 45px; bottom: -20px; height: 42px;
    background: #ff6b7a;
    border-radius: 50% 50% 0 0;
  }
  .tear {
    position: absolute;
    top: 103px;
    width: 31px; height: 52px;
    background: ${spec.tear};
    border-radius: 56% 44% 58% 42%;
    box-shadow: inset 7px 7px 0 rgba(255,255,255,.42);
  }
  .tear.left { left: 24px; transform: rotate(28deg) translateY(${Math.max(0, state.y * -0.25)}px); }
  .tear.right { right: 24px; transform: rotate(-28deg) translateY(${Math.max(0, state.y * -0.18)}px); }
  .spark {
    position: absolute;
    width: 36px; height: 36px;
    color: ${spec.accent};
    font: 900 36px/1 system-ui, sans-serif;
    text-shadow: 0 3px 0 rgba(0,0,0,.12);
  }
  .spark.a { left: 40px; top: 42px; transform: rotate(-18deg); }
  .spark.b { right: 34px; bottom: 58px; transform: rotate(18deg); }
  .mark, .drop, .bubble, .conf, .ray, .speed, .beat, .sparkle, .wave, .tri, .burst, .zig, .hop-line, .heart {
    position: absolute;
    pointer-events: none;
  }
  .mark { width: 14px; height: 46px; border-radius: 999px; background: ${spec.accent}; opacity: .86; }
  .m1 { left: 44px; top: 48px; transform: rotate(-28deg); } .m2 { right: 48px; top: 38px; transform: rotate(30deg); } .m3 { right: 34px; bottom: 72px; height: 28px; }
  .drop { width: 24px; height: 38px; border-radius: 60% 40% 60% 40%; background: ${spec.tear}; box-shadow: inset 6px 6px 0 rgba(255,255,255,.35); opacity: .85; }
  .d1 { left: 18px; top: 118px; transform: rotate(24deg); } .d2 { right: 22px; top: 108px; transform: rotate(-24deg); } .d3 { left: 58px; bottom: 42px; transform: scale(.72) rotate(-10deg); }
  .ring { border: 8px solid ${spec.accent}; border-radius: 50%; opacity: .42; }
  .r1 { inset: -18px; } .r2 { inset: -36px; border-width: 5px; opacity: .2; }
  .conf { width: 26px; height: 12px; border-radius: 6px; background: ${spec.accent}; opacity: .88; }
  .c1 { left: 16px; top: 58px; transform: rotate(18deg); } .c2 { right: 18px; top: 72px; transform: rotate(-24deg); } .c3 { left: 38px; bottom: 56px; transform: rotate(-16deg); } .c4 { right: 42px; bottom: 44px; transform: rotate(35deg); }
  .zig { width: 54px; height: 28px; border-top: 8px solid ${spec.accent}; border-right: 8px solid ${spec.accent}; transform: skewX(-20deg); opacity: .7; }
  .z1 { left: 14px; top: 48px; transform: rotate(-15deg) skewX(-20deg); } .z2 { right: 18px; bottom: 64px; transform: rotate(170deg) skewX(-20deg); }
  .bubble { border: 7px solid ${spec.accent}; border-radius: 50%; opacity: .7; }
  .b1 { width: 34px; height: 34px; left: 20px; top: 48px; } .b2 { width: 23px; height: 23px; right: 32px; top: 58px; } .b3 { width: 28px; height: 28px; right: 38px; bottom: 46px; }
  .ray { width: 9px; height: 54px; background: ${spec.accent}; border-radius: 999px; opacity: .65; transform-origin: 50% 150px; left: 175px; top: 16px; }
  .ray.a { transform: rotate(0deg); } .ray.b { transform: rotate(45deg); } .ray.c { transform: rotate(-45deg); } .ray.d { transform: rotate(90deg); }
  .floor-shadow { position: absolute; width: 190px; height: 26px; border-radius: 50%; background: rgba(0,0,0,.22); left: 86px; bottom: 24px; filter: blur(4px); }
  .hop-line { width: 58px; height: 8px; background: ${spec.accent}; border-radius: 999px; opacity: .6; }
  .hop-line.h1 { left: 28px; bottom: 74px; transform: rotate(12deg); } .hop-line.h2 { right: 26px; bottom: 86px; transform: rotate(-12deg); }
  .heart { width: 34px; height: 34px; background: ${spec.accent}; transform: rotate(45deg); opacity: .76; }
  .heart::before, .heart::after { content: ""; position: absolute; width: 34px; height: 34px; border-radius: 50%; background: ${spec.accent}; }
  .heart::before { left: -17px; top: 0; } .heart::after { left: 0; top: -17px; }
  .heart.h1 { left: 34px; top: 54px; transform: rotate(32deg) scale(.72); } .heart.h2 { right: 38px; bottom: 64px; transform: rotate(54deg) scale(.62); }
  .speed { width: 82px; height: 10px; border-radius: 999px; background: ${spec.accent}; opacity: .72; }
  .s1 { left: 8px; top: 78px; } .s2 { left: 22px; top: 111px; width: 58px; } .s3 { right: 10px; bottom: 82px; width: 68px; }
  .beat { width: 18px; height: 54px; border-radius: 999px; background: ${spec.accent}; opacity: .72; bottom: 46px; }
  .bt1 { left: 34px; height: 30px; } .bt2 { left: 60px; height: 52px; } .bt3 { left: 86px; height: 40px; }
  .sparkle { width: 42px; height: 42px; background: ${spec.accent}; clip-path: polygon(50% 0, 61% 37%, 100% 50%, 61% 63%, 50% 100%, 39% 63%, 0 50%, 39% 37%); opacity: .74; }
  .sp1 { left: 30px; top: 38px; } .sp2 { right: 36px; top: 62px; transform: scale(.72); } .sp3 { right: 54px; bottom: 48px; transform: scale(.56); }
  .wave { width: 74px; height: 28px; border: 7px solid ${spec.accent}; border-left: 0; border-right: 0; border-bottom: 0; border-radius: 50%; opacity: .7; }
  .w1 { left: 12px; top: 70px; transform: rotate(-20deg); } .w2 { right: 16px; top: 82px; transform: rotate(20deg); } .w3 { left: 40px; bottom: 54px; transform: rotate(8deg); }
  .tri { width: 0; height: 0; border-left: 19px solid transparent; border-right: 19px solid transparent; border-bottom: 34px solid ${spec.accent}; opacity: .7; }
  .t1 { left: 26px; top: 48px; transform: rotate(-18deg); } .t2 { right: 28px; top: 66px; transform: rotate(28deg) scale(.8); } .t3 { right: 56px; bottom: 48px; transform: rotate(-12deg) scale(.62); }
  .burst { width: 13px; height: 62px; background: ${spec.accent}; border-radius: 999px; opacity: .68; left: 174px; top: 24px; transform-origin: 50% 155px; }
  .br1 { transform: rotate(-50deg); } .br2 { transform: rotate(-18deg); } .br3 { transform: rotate(22deg); } .br4 { transform: rotate(58deg); }
</style>
</head>
<body>
  <div class="wrap">
    <div class="face ${spec.shape}">
      ${decorHtml(spec.decor)}
      <div class="spark a">!</div>
      <div class="spark b">!</div>
      <div class="eye left"></div><div class="eye right"></div>
      <div class="tear left"></div><div class="tear right"></div>
      <div class="mouth"></div>
    </div>
  </div>
</body>
</html>`;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${cmd} failed`);
}

async function main() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(TMP_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  try {
    for (const spec of specs) {
      const dir = resolve(TMP_DIR, spec.id);
      mkdirSync(dir, { recursive: true });
      const page = await browser.newPage();
      await page.setViewport({ width: 360, height: 360, deviceScaleFactor: 1 });
      const frames = 18;
      for (let i = 0; i < frames; i += 1) {
        await page.setContent(html(spec, frameState(spec.mode, i, frames)), { waitUntil: "load" });
        await page.screenshot({ path: resolve(dir, `frame-${String(i).padStart(3, "0")}.png`), omitBackground: true });
      }
      await page.close();
      const palette = resolve(dir, "palette.png");
      run("ffmpeg", [
        "-y",
        "-framerate",
        "12",
        "-i",
        resolve(dir, "frame-%03d.png"),
        "-vf",
        "palettegen=reserve_transparent=1",
        "-frames:v",
        "1",
        "-update",
        "1",
        palette,
      ]);
      run("ffmpeg", [
        "-y",
        "-framerate",
        "12",
        "-i",
        resolve(dir, "frame-%03d.png"),
        "-i",
        palette,
        "-lavfi",
        "paletteuse=alpha_threshold=128",
        "-loop",
        "0",
        resolve(OUT_DIR, `${spec.id}.gif`),
      ]);
    }
  } finally {
    await browser.close();
  }
  writeFileSync(
    resolve(OUT_DIR, "sources.json"),
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        license: "Project-owned generated CSS sticker animations; no external imagery.",
        files: specs.map((spec) => `${spec.id}.gif`),
        generator: "src/scripts/build-joke-motion-assets.mjs",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

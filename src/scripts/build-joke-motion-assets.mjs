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
  { id: "laugh-bounce", face: "#ffd43b", tear: "#35a7ff", mouth: "#4b1d18", accent: "#ff8a00", mode: "bounce" },
  { id: "laugh-wiggle", face: "#ffcc4d", tear: "#48cae4", mouth: "#301314", accent: "#e63946", mode: "wiggle" },
  { id: "laugh-pop", face: "#ffe066", tear: "#60a5fa", mouth: "#3f1516", accent: "#22c55e", mode: "pop" },
];

function frameState(mode, i, frames) {
  const t = i / frames;
  const wave = Math.sin(t * Math.PI * 2);
  if (mode === "wiggle") return { rot: wave * 9, scale: 1 + Math.abs(wave) * 0.04, y: Math.cos(t * Math.PI * 4) * 5 };
  if (mode === "pop") return { rot: Math.sin(t * Math.PI * 4) * 4, scale: 0.94 + Math.abs(wave) * 0.11, y: -Math.abs(wave) * 13 };
  return { rot: wave * 6, scale: 1 + Math.abs(wave) * 0.06, y: -Math.abs(wave) * 18 };
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
  }
  .face {
    position: relative;
    width: 260px; height: 260px;
    border-radius: 50%;
    background:
      radial-gradient(circle at 34% 30%, rgba(255,255,255,.85), transparent 13%),
      radial-gradient(circle at 64% 78%, rgba(255,170,0,.28), transparent 24%),
      ${spec.face};
    border: 10px solid rgba(0,0,0,.12);
    box-shadow: 0 18px 28px rgba(0,0,0,.22);
    transform: translateY(${state.y}px) rotate(${state.rot}deg) scale(${state.scale});
    transform-origin: 50% 55%;
  }
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
</style>
</head>
<body>
  <div class="wrap">
    <div class="face">
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

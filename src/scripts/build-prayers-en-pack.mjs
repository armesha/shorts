import { execFile } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import puppeteer from "puppeteer-core";

const pexec = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = resolve(ROOT, "assets/fact-videos/prayers-en");
const DATA_DIR = resolve(ROOT, "data/prayers-en");
const TEMP_DIR = resolve(ROOT, "tmp/prayers-en-render");
const COUNT = Math.max(1, Number(process.argv[2] || 160));

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
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Chrome/Chromium not found; set CHROME_PATH");
}

const topics = [
  { key: "morning", title: "Morning Prayer", line: "Guide this day with calm courage and a faithful heart." },
  { key: "evening", title: "Evening Prayer", line: "Let this night bring rest, mercy, and quiet trust." },
  { key: "family", title: "Prayer for Family", line: "Keep our home patient, gentle, and full of forgiving love." },
  { key: "peace", title: "Prayer for Peace", line: "Teach my heart to choose peace before pride." },
  { key: "strength", title: "Prayer for Strength", line: "Give me strength to do the next right thing." },
  { key: "wisdom", title: "Prayer for Wisdom", line: "Make my thoughts clear and my choices humble." },
  { key: "hope", title: "Prayer for Hope", line: "Let hope rise again where worry has grown loud." },
  { key: "gratitude", title: "Prayer of Gratitude", line: "Open my eyes to the blessings I keep missing." },
  { key: "protection", title: "Prayer for Protection", line: "Keep my steps steady and my heart awake." },
  { key: "work", title: "Prayer for Work", line: "Bless honest work with patience, fairness, and purpose." },
  { key: "forgiveness", title: "Prayer for Forgiveness", line: "Soften what is hard in me and restore what is broken." },
  { key: "children", title: "Prayer for Children", line: "Guard young hearts with kindness, wisdom, and safe paths." },
  { key: "courage", title: "Prayer for Courage", line: "Help me move with courage without losing gentleness." },
  { key: "comfort", title: "Prayer for Comfort", line: "Stay near when words are small and grief is heavy." },
  { key: "journey", title: "Prayer for the Journey", line: "Bless the road ahead, every departure, and every return." },
  { key: "patience", title: "Prayer for Patience", line: "Teach me to wait without bitterness and act without fear." },
  { key: "healing", title: "Prayer for Healing", line: "Bring comfort, wise care, and patient strength day by day." },
  { key: "friendship", title: "Prayer for Friendship", line: "Make my words loyal, honest, and kind." },
  { key: "decision", title: "Prayer for a Decision", line: "Open the good door and close what would lead me away." },
  { key: "faith", title: "Prayer for Faith", line: "Help my faith stay steady when the way is unclear." },
];

const openers = [
  "Lord, I place this moment in Your hands.",
  "Heavenly Father, quiet my heart before You.",
  "Jesus, lead me with mercy and truth.",
  "God of grace, draw near to my thoughts.",
  "Father, let Your light guide my steps.",
  "Lord, teach me to trust You today.",
  "Merciful God, meet me with peace.",
  "Jesus, keep my heart close to Your love.",
];

const closers = [
  "Let my words be gentle and my choices faithful. Amen.",
  "Give me a grateful spirit and a steady mind. Amen.",
  "Keep me from fear, haste, and bitterness. Amen.",
  "Let Your peace shape what I do next. Amen.",
  "Help me carry hope into the day. Amen.",
  "Make my heart humble, awake, and kind. Amen.",
  "Hold what I cannot control in Your mercy. Amen.",
  "Let love be stronger than worry in me. Amen.",
];

const palettes = [
  ["#f6efe2", "#314d63", "#d8a44f", "#6f5132"],
  ["#f4f1e8", "#3b3954", "#b88d54", "#6d5b7a"],
  ["#f8f3ea", "#2f5a55", "#c79856", "#5a4535"],
  ["#f5efe5", "#403b35", "#c27a57", "#83533e"],
  ["#eff5f4", "#243f58", "#c6a15b", "#4f6073"],
  ["#f7f0e8", "#4a3a62", "#c09b69", "#765d4d"],
];

function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cardHtml(card, index) {
  const [paper, ink, accent, muted] = palettes[index % palettes.length];
  const titleSize = card.title.length > 24 ? 62 : 70;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;width:1080px;height:1920px;background:${paper};font-family:"Noto Serif","DejaVu Serif",serif;color:${ink};}
    .frame{position:relative;width:100%;height:100%;overflow:hidden;background:
      radial-gradient(circle at 18% 12%, rgba(255,255,255,.85), transparent 22%),
      linear-gradient(135deg, rgba(255,255,255,.48), transparent 46%),
      ${paper};}
    .arch{position:absolute;left:110px;top:88px;width:860px;height:620px;border-radius:430px 430px 26px 26px;border:18px solid rgba(255,255,255,.72);box-shadow:0 18px 48px rgba(44,36,27,.18);overflow:hidden;background:
      linear-gradient(90deg, rgba(255,255,255,.22), transparent 45%, rgba(255,255,255,.18)),
      radial-gradient(circle at 50% 12%, ${accent}cc, transparent 16%),
      linear-gradient(145deg, ${ink}e6, ${muted}d9);}
    .arch:before{content:"";position:absolute;left:50%;top:92px;width:22px;height:340px;transform:translateX(-50%);background:rgba(255,255,255,.82);border-radius:14px;}
    .arch:after{content:"";position:absolute;left:50%;top:190px;width:250px;height:22px;transform:translateX(-50%);background:rgba(255,255,255,.82);border-radius:14px;}
    .rays{position:absolute;inset:-160px;background:repeating-conic-gradient(from ${index * 11}deg, rgba(255,255,255,.12) 0 8deg, transparent 8deg 18deg);opacity:.8}
    .card{position:absolute;left:96px;right:96px;top:760px;min-height:760px;border-radius:34px;background:rgba(255,255,255,.78);border:2px solid rgba(83,67,45,.18);box-shadow:0 24px 70px rgba(43,33,22,.14);padding:64px 70px 58px;}
    .rule{height:7px;width:260px;background:${accent};border-radius:99px;margin:0 auto 38px;}
    h1{margin:0 0 44px;text-align:center;font-size:${titleSize}px;line-height:1.05;text-transform:uppercase;letter-spacing:.02em;color:${ink};}
    p{margin:0 0 30px;font-size:48px;line-height:1.36;text-align:center;color:#1f2833;}
    .amen{margin-top:44px;text-align:center;font-size:40px;font-weight:700;color:${muted};}
    .candle{position:absolute;left:122px;bottom:190px;width:94px;height:240px;border-radius:30px 30px 12px 12px;background:linear-gradient(#fff8dd,#e5c37d);box-shadow:0 18px 42px rgba(61,41,21,.18);}
    .flame{position:absolute;left:28px;top:-70px;width:42px;height:78px;border-radius:50% 50% 50% 50%;background:radial-gradient(circle at 52% 70%, #fff 0 10%, #ffca5d 32%, #d06b2b 74%);box-shadow:0 0 46px #e7a64a;}
    .mark{position:absolute;right:112px;bottom:176px;font-size:32px;color:${muted};opacity:.8}
  </style></head><body><main class="frame">
    <div class="arch"><div class="rays"></div></div>
    <section class="card"><div class="rule"></div><h1>${esc(card.title)}</h1>
      <p>${esc(card.opener)}</p><p>${esc(card.line)}</p><p>${esc(card.closer)}</p>
      <div class="amen">Amen</div>
    </section>
    <div class="candle"><div class="flame"></div></div><div class="mark">Christian Prayers</div>
  </main></body></html>`;
}

function makeCards(count) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    const topic = topics[i % topics.length];
    const opener = openers[(Math.floor(i / topics.length) + i) % openers.length];
    const closer = closers[(Math.floor(i / topics.length) * 3 + i) % closers.length];
    const title = topic.title;
    const text = `${title.toUpperCase()}\n\n${opener}\n\n${topic.line}\n\n${closer}`;
    cards.push({
      file: `prayers-en/prayer_en_${String(i + 1).padStart(4, "0")}_${topic.key}.mp4`,
      title,
      text,
      theme: "english-prayer-card",
      template: `prayer-en-template-${String((i % palettes.length) + 1).padStart(2, "0")}`,
      opener,
      line: topic.line,
      closer,
    });
  }
  return cards;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });
  mkdirSync(TEMP_DIR, { recursive: true });
  const cards = makeCards(COUNT);
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const png = resolve(TEMP_DIR, `prayer_en_${String(i + 1).padStart(4, "0")}.png`);
      const mp4 = resolve(ROOT, "assets/fact-videos", card.file);
      await page.setContent(cardHtml(card, i), { waitUntil: "load", timeout: 15_000 });
      await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 80));
      await page.screenshot({ path: png, type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 } });
      await pexec(
        "ffmpeg",
        [
          "-y",
          "-loop",
          "1",
          "-i",
          png,
          "-t",
          "7",
          "-vf",
          "format=yuv420p",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-movflags",
          "+faststart",
          mp4,
        ],
        { timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
      );
      if ((i + 1) % 20 === 0) process.stdout.write(`rendered ${i + 1}/${cards.length}\n`);
    }
  } finally {
    await browser.close();
  }
  const videoRows = cards.map(({ opener, line, closer, ...row }) => row);
  writeFileSync(resolve(DATA_DIR, "videos.json"), `${JSON.stringify(videoRows, null, 2)}\n`);
  writeFileSync(
    resolve(DATA_DIR, "sources.json"),
    `${JSON.stringify(
      {
        deckId: "prayers-en",
        rights: "Original devotional text and HTML/CSS visuals generated locally for this project. No external media or copyrighted quotes.",
        generator: "src/scripts/build-prayers-en-pack.mjs",
        count: cards.length,
        safety: [
          "Christian devotional tone only.",
          "No claims of guaranteed healing, political attacks, or protected-class hate.",
          "No external portraits, music, scripture quotations, or stock media.",
        ],
      },
      null,
      2,
    )}\n`,
  );
  process.stdout.write(`done: ${cards.length} cards\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

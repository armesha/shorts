// Render the selected insert-slot templates with sample captions to verify the caption lands inside
// the blank slot. Reads tmp/meme-recheck/newimg/slots-selection.json; writes PNGs to .../render/.
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launch } from "puppeteer-core";
import { chromePath } from "../render.ts";
import { buildMemeBoardHtml, type MemeCard } from "../memes/render.ts";
import { photoDataUri } from "../memes/photos.ts";

const sel = JSON.parse(
  readFileSync("tmp/meme-recheck/newimg/slots-selection.json", "utf8"),
) as Array<{ boardIdx: number; photoFile: string; slot: MemeCard["slot"] }>;

const CAPS = [
  "Опять понедельник",
  "Когда зарплата пришла и сразу ушла",
  "POV: ты обещал себе лечь рано",
  "Я после третьей чашки кофе",
  "Когда нашёл баг в проде в пятницу вечером",
  "Мама: ты весь день в телефоне",
  "Когда открыл холодильник в пятый раз и там ничего",
  "Я объясняю, почему мне опять нужна новая идея",
  "Когда сказал «ещё пять минут» три часа назад",
  "Никто: \nЯ в 3 ночи:",
  "Когда выходные кончились слишком быстро",
  "POV: понедельник смотрит на тебя",
  "Я и мой план лечь спать вовремя",
  "Когда наконец доделал задачу",
  "Это знак, что пора в отпуск",
  "Когда кто-то ест твою еду из холодильника",
  "Я делаю вид, что всё под контролем",
  "Когда увидел счёт за интернет",
];

const OUT = resolve("tmp/meme-recheck/newimg/render");
mkdirSync(OUT, { recursive: true });

const browser = await launch({
  executablePath: chromePath(),
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  headless: true,
});
try {
  for (let i = 0; i < sel.length; i++) {
    const s = sel[i];
    const card: MemeCard = { caption: CAPS[i % CAPS.length], photoFile: s.photoFile, slot: s.slot };
    const img = photoDataUri(s.photoFile) ?? "";
    const html = buildMemeBoardHtml(card, img);
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle0" as "load", timeout: 30_000 });
    await page.waitForFunction("window.__fitted === true", { timeout: 5_000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/slot-${s.boardIdx}.png` as `${string}.png`, clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    await page.close();
    process.stderr.write(`rendered board-${s.boardIdx}\n`);
  }
} finally {
  await browser.close();
}
console.error(`DONE: ${sel.length} -> ${OUT}`);

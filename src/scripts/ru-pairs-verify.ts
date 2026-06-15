// Рендер выборки НОВЫХ карточек (друг + дека) для визуальной проверки.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { chromePath } from "../render.ts";
import { renderTemplateCard, type TemplateDoc, type TemplateContent } from "../template/render.ts";
import { renderAnecdote } from "../anecdotes/render.ts";

const OUT = resolve(process.cwd(), "data/output/ru-pairs-check");

// ---- друг ----
const pack = JSON.parse(readFileSync(resolve(process.cwd(), "data/packs/анекдоты-ру-впн-mqe5ovw1.json"), "utf8")) as {
  templates: TemplateDoc[]; cards: { values: TemplateContent }[];
};
const fIdx = [10, Math.floor(pack.cards.length / 2), pack.cards.length - 1];
const browser = await puppeteer.launch({
  executablePath: chromePath(), headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
});
try {
  for (const i of fIdx) {
    await renderTemplateCard(pack.templates[0], pack.cards[i].values, resolve(OUT, `friend-${i}.png`), browser);
    console.log("friend card", i, "ok");
  }
} finally { await browser.close(); }

// ---- моя дека (новые в titled.json, на разных фонах russian_jokes) ----
const titled = JSON.parse(readFileSync(resolve(process.cwd(), "data/anecdotes/titled.json"), "utf8")) as { text: string; title: string }[];
const bgs = ["russian_kitchen_table.jpg", "russian_garage_workshop.jpg", "russian_banya.jpg", "russian_dacha_porch.jpg"];
const mIdx = [276, 360, 450, 524]; // новые (после 275)
for (let k = 0; k < mIdx.length; k++) {
  const it = titled[mIdx[k]];
  if (!it) continue;
  await renderAnecdote({ title: it.title, text: it.text, channel: "Русские анекдоты", deck: "ru", bg: bgs[k % bgs.length] }, resolve(OUT, `deck-${mIdx[k]}.png`));
  console.log("deck item", mIdx[k], "ok ·", it.text.length, "симв ·", bgs[k % bgs.length]);
}
console.log("=== rendered →", OUT, "===");

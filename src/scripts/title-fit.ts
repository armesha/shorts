import puppeteer from "puppeteer-core";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromePath } from "../render.ts";

// Measures the max number of characters a one-line title can hold at the current title font.
const tpl = await readFile(resolve(process.cwd(), "templates/anecdote.html"), "utf8");
const html = tpl
  .replaceAll("{{TITLE}}", "X")
  .replace("{{TEXT}}", "текст")
  .replaceAll("{{CHANNEL}}", "Русские анекдоты")
  .replaceAll("{{BG}}", "#fbf6ea");

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle0" });
await page.evaluateHandle("document.fonts.ready");

// String-body evaluate (avoids esbuild's __name helper in the page context).
const res = (await page.evaluate(`(function () {
  var t = document.querySelector('.title');
  var wrap = document.querySelector('.title-wrap');
  var sample = 'Про тёщу, зятя и соседского кота Барсика на даче летом ';
  function fits(n) { var s=''; while (s.length<n) s+=sample; t.textContent=s.slice(0,n); return t.scrollWidth <= wrap.clientWidth; }
  var lo=1, hi=90, best=1;
  while (lo<=hi) { var mid=(lo+hi)>>1; if (fits(mid)) { best=mid; lo=mid+1; } else hi=mid-1; }
  return { best: best, wrapWidth: wrap.clientWidth };
})()`)) as { best: number; wrapWidth: number };

console.log(`MAX_TITLE_CHARS=${res.best} (content width ${res.wrapWidth}px @ 68px title font)`);
await browser.close();

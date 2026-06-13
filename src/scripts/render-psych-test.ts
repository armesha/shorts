// Render the generated psychology cards (data/psych/cards.json) onto templates/psych.html → PNGs.
// Run: node --import tsx src/scripts/render-psych-test.ts
import { resolve } from "node:path";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { launch } from "puppeteer-core";

const TEMPLATE = resolve(process.cwd(), "templates/psych.html");
const CARDS = resolve(process.cwd(), "data/psych/cards.json");
const OUT = resolve(process.cwd(), "data/output/psych");
mkdirSync(OUT, { recursive: true });

const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"].find(
    (p) => existsSync(p),
  ) ||
  "google-chrome";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function itemsHtml(card: any): string {
  const it: any[] = card.items || [];
  let lis = "";
  switch (card.pattern) {
    case "numbered":
    case "numbered_tight":
      lis = it.map((x, i) => `<li><span class="m">${i + 1}. ${esc(x.lead)}</span> — ${esc(x.text)}</li>`).join("");
      break;
    case "bullet":
    case "premium":
      lis = it.map((x) => `<li>${esc(x.text)}</li>`).join("");
      break;
    case "bullet_color":
      lis = it.map((x) => `<li><span class="m">${esc(x.lead)}</span> – ${esc(x.text)}</li>`).join("");
      break;
    case "term":
      lis = it.map((x) => `<li><span class="term">${esc(x.term)} — </span><span class="m">${esc(x.val)}</span></li>`).join("");
      break;
    case "myth":
      lis = it
        .map(
          (x) =>
            `<li><span class="pair"><span class="m">Mythos</span> — ${esc(x.myth)}</span><span class="pair"><span class="m">Wahrheit</span> — ${esc(x.real)}</span></li>`,
        )
        .join("");
      break;
    case "quote":
      lis = it.map((x, i) => `<li><span class="m">${i + 1}.</span> «${esc(x.quote)}» <span class="auth">— ${esc(x.author)}</span></li>`).join("");
      break;
    default:
      lis = it.map((x) => `<li>${esc(x.text ?? "")}</li>`).join("");
  }
  const outro = card.outro ? `<li class="outro"><span class="m">${esc(card.outro)}</span></li>` : "";
  return lis + outro;
}

const cards: any[] = JSON.parse(readFileSync(CARDS, "utf8"));
const tpl = readFileSync(TEMPLATE, "utf8");
const browser = await launch({
  executablePath: CHROME,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
  headless: true,
});
let i = 0;
for (const card of cards) {
  i++;
  const title = (card.title_lines || []).map(esc).join("<br>");
  const html = tpl
    .replaceAll("{{TITLE_PLAIN}}", (card.title_lines || []).join(" "))
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{PATTERN}}", card.pattern)
    .replace("{{ITEMS}}", itemsHtml(card));
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  try {
    await page.evaluateHandle("document.fonts.ready");
  } catch {
    /* fonts api missing — proceed */
  }
  await new Promise((r) => setTimeout(r, 350));
  const idx = String(i).padStart(2, "0");
  const out = resolve(OUT, `${idx}-${card.pattern}.png`);
  const el = await page.$(".canvas");
  if (el) await el.screenshot({ path: out as `${string}.png` });
  await page.close();
  console.log(`${idx} ${card.pattern}`);
}
await browser.close();
console.log(`done → ${OUT}`);

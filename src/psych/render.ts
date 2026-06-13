// Isolated renderer for the German psychology cards (preview-only, NOT wired into the deck pipeline).
// Builds HTML from templates/psych.html + data/psych/cards.json and screenshots it via puppeteer.
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { launch } from "puppeteer-core";

const TEMPLATE = resolve(process.cwd(), "templates/psych.html");
const CARDS_FILE = resolve(process.cwd(), "data/psych/cards.json");
const CHROME =
  process.env.CHROME_PATH ||
  ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"].find(
    (p) => existsSync(p),
  ) ||
  "google-chrome";

export interface PsychCard {
  pattern: string;
  title_lines: string[];
  items: Record<string, string>[];
  outro: string;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function listPsychCards(): PsychCard[] {
  try {
    return JSON.parse(readFileSync(CARDS_FILE, "utf8")) as PsychCard[];
  } catch {
    return [];
  }
}

function itemsHtml(card: PsychCard): string {
  const it = card.items || [];
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

export function buildPsychHtml(card: PsychCard): string {
  const tpl = readFileSync(TEMPLATE, "utf8");
  const title = (card.title_lines || []).map(esc).join("<br>");
  return tpl
    .replaceAll("{{TITLE_PLAIN}}", (card.title_lines || []).join(" "))
    .replaceAll("{{TITLE}}", title)
    .replaceAll("{{PATTERN}}", card.pattern)
    .replace("{{ITEMS}}", itemsHtml(card));
}

/** Render one card to a 1080x1920 PNG at outPath. */
export async function renderPsychCard(card: PsychCard, outPath: string): Promise<void> {
  const html = buildPsychHtml(card);
  const browser = await launch({
    executablePath: CHROME,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    try {
      await page.evaluateHandle("document.fonts.ready");
    } catch {
      /* fonts api missing — proceed */
    }
    await new Promise((r) => setTimeout(r, 300));
    const el = await page.$(".canvas");
    if (el) await el.screenshot({ path: outPath as `${string}.png` });
  } finally {
    await browser.close();
  }
}

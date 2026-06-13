import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromePath } from "../render.ts";

const url = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "data/output/web.png";

const browser = await puppeteer.launch({
  executablePath: chromePath(),
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 600));
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log("shot ->", out);
} finally {
  await browser.close();
}

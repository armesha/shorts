// Visual check: channel grid shows avatars; account page avatar picker opens & lists the set.
// Run: node --experimental-sqlite --import tsx src/scripts/avatar-e2e.ts
import { chromium } from "playwright";
import { openDb } from "../../server/db.ts";
import { loadBaseConfig } from "../../server/config.ts";
import { newSessionToken, SESSION_TTL_DAYS } from "../../server/auth.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const ACC = process.env.ACC ?? "15";
const out: string[] = [];
const ok = (l: string, c: boolean) => { out.push(`${c ? "✅" : "❌"} ${l}`); if (!c) process.exitCode = 1; };

const db = openDb(loadBaseConfig().dbPath);
const admin = db.listUsers().find((u) => u.role === "admin") ?? db.listUsers()[0];
const token = newSessionToken();
db.createSession(token, admin.id, new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString());

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
try {
  await page.context().addCookies([{ name: "sid", value: token, url: BASE }]);

  await page.goto(`${BASE}/accounts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const gridAvatars = await page.locator('a[href^="/accounts/"] img[src*="/avatars/"], a[href^="/accounts/"] img[src*="/files/avatars/"]').count();
  ok(`Аватарки в сетке каналов: ${gridAvatars} (>0)`, gridAvatars > 0);
  await page.screenshot({ path: "data/output/_e2e_channels_grid.png" });

  await page.goto(`${BASE}/accounts/${ACC}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /Библиотека роликов/ }).waitFor({ timeout: 15000 });
  const headerAv = page.locator('header img[src*="/avatars/"], header img[src*="/files/avatars/"]');
  ok("Аватар в шапке канала виден", (await headerAv.count()) > 0);

  await page.locator('button[title="Сменить аватар канала"]').click();
  const modal = page.locator(".modal.modal-open");
  await modal.waitFor({ timeout: 8000 });
  await page.waitForTimeout(800);
  const choices = await modal.locator("img").count();
  ok(`В модалке набор аватарок: ${choices} (>50)`, choices > 50);
  ok("Есть кнопка «Загрузить своё фото»", await modal.getByText("Загрузить своё фото").isVisible());
  ok("Есть кнопка «Случайная»", await modal.getByText("Случайная").isVisible());
  await page.screenshot({ path: "data/output/_e2e_avatar_picker.png" });

  console.log(out.join("\n"));
  console.log(process.exitCode ? "\nAVATAR E2E: FAIL" : "\nAVATAR E2E: PASS");
} catch (e) {
  console.log(out.join("\n"));
  console.error("ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  try { db.deleteSession(token); } catch {}
  await browser.close();
}

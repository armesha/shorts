// E2E: open a channel's library, open a video in the custom player, verify it plays.
// Auth: mints a fresh admin session directly (no password guessing); cleans it up at the end.
// Run: node --experimental-sqlite --import tsx src/scripts/library-e2e.ts
import { chromium } from "playwright";
import { openDb } from "../../server/db.ts";
import { loadBaseConfig } from "../../server/config.ts";
import { newSessionToken, SESSION_TTL_DAYS } from "../../server/auth.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const ACC = process.env.ACC ?? "15";

const out: string[] = [];
const ok = (label: string, cond: boolean) => {
  out.push(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
};

// --- mint a throwaway admin session so we can view the real page ---
const db = openDb(loadBaseConfig().dbPath);
const admin = db.listUsers().find((u) => u.role === "admin") ?? db.listUsers()[0];
if (!admin) throw new Error("no admin user");
const token = newSessionToken();
db.createSession(token, admin.id, new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString());

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newPage({ viewport: { width: 1280, height: 900 } });
try {
  await ctx.context().addCookies([{ name: "sid", value: token, url: BASE }]);
  await ctx.goto(`${BASE}/accounts/${ACC}`, { waitUntil: "networkidle" });

  const lib = ctx.getByRole("heading", { name: /Библиотека роликов/ });
  await lib.waitFor({ timeout: 15000 });
  ok("Заголовок «Библиотека роликов» виден", await lib.isVisible());
  ok("Не выкинуло на логин", !(await ctx.getByRole("button", { name: "Войти" }).isVisible().catch(() => false)));

  const cards = ctx.locator('[title="Открыть и посмотреть"]');
  const n = await cards.count();
  ok(`Карточек-постеров в сетке: ${n} (>0)`, n > 0);
  await ctx.screenshot({ path: "data/output/_e2e_library_grid.png" });

  await cards.first().click();
  const modal = ctx.locator(".modal.modal-open");
  await modal.waitFor({ timeout: 8000 });
  ok("Модалка открылась по клику", await modal.isVisible());

  const video = modal.locator("video");
  await video.waitFor({ timeout: 8000 });
  ok("В модалке есть <video>", (await video.count()) > 0);
  ok("Есть полоса перемотки (range)", (await modal.locator("input.range").count()) > 0);
  ok("Есть тайм-код m:ss / m:ss", /\d:\d\d\s*\/\s*\d:\d\d/.test(await modal.innerText()));

  await video.click(); // exercise the click-to-play control (UI gesture)
  // headless Chrome blocks autoplay WITH sound; mute to verify the element actually decodes & advances
  await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play().catch(() => {}); });
  await ctx.waitForTimeout(1600);
  const ct = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
  const dur = await video.evaluate((v: HTMLVideoElement) => v.duration);
  ok(`Видео воспроизводится (currentTime=${ct.toFixed(2)} > 0)`, ct > 0);
  ok(`Длительность считана (${isFinite(dur) ? dur.toFixed(1) : "?"}с)`, isFinite(dur) && dur > 0);
  await ctx.screenshot({ path: "data/output/_e2e_player_modal.png" });

  // custom confirm dialog (no native window.confirm): click «Удалить» → expect in-app alertdialog → cancel
  await modal.getByRole("button", { name: "Удалить" }).click();
  const cdlg = ctx.locator('[role="alertdialog"]');
  await cdlg.waitFor({ timeout: 5000 });
  ok("Кастомная модалка подтверждения (не нативная)", await cdlg.isVisible());
  await cdlg.getByRole("button", { name: "Отмена" }).click(); // отмена — НЕ удаляем
  ok("Подтверждение закрылось по «Отмена»", !(await cdlg.isVisible().catch(() => true)));

  console.log(out.join("\n"));
  console.log(process.exitCode ? "\nE2E: FAIL" : "\nE2E: PASS");
} catch (e) {
  console.log(out.join("\n"));
  console.error("E2E ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  try { db.deleteSession(token); } catch {}
  await browser.close();
}

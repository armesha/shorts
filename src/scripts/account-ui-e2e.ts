// E2E: account detail UI for multi-pack generation.
// Creates local-only test data, mints a temporary session, and checks the browser payload.
// Run against a started app:
//   BASE_URL=http://localhost:8080 node --experimental-sqlite --import tsx src/scripts/account-ui-e2e.ts
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { openDb } from "../../server/db.ts";
import { loadBaseConfig } from "../../server/config.ts";
import { hashPassword, newSessionToken, SESSION_TTL_DAYS } from "../../server/auth.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
const TEST_USER = process.env.E2E_USER ?? "codex-e2e-admin";
const TEST_CHANNEL = "Codex E2E Admin Multi-Pack";
const LIMIT_CHANNEL = "Codex E2E Daily Limit Blocker";
const START_SOURCES = ["space"];
const SOURCES = ["space", "fact-en"];

type GenPayload = { accountId?: number; count?: number; deckIds?: string[] };

const out: string[] = [];
const ok = (label: string, cond: boolean) => {
  out.push(`${cond ? "✅" : "❌"} ${label}`);
  if (!cond) process.exitCode = 1;
};
const same = (label: string, actual: unknown, expected: unknown) => {
  ok(`${label}: ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`, JSON.stringify(actual) === JSON.stringify(expected));
};
const manyTimes = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const m = (i * 15) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  });

mkdirSync("data/output", { recursive: true });

const db = openDb(loadBaseConfig().dbPath);
const randomPassHash = () => hashPassword(`e2e-${randomUUID()}`);
let user = db.getUserByUsername(TEST_USER);
if (!user) user = db.createUser({ username: TEST_USER, passHash: randomPassHash(), role: "admin" });
else {
  db.db.prepare("UPDATE users SET pass_hash = ?, role = 'admin' WHERE id = ?").run(randomPassHash(), user.id);
  user = db.getUserById(user.id)!;
}
db.clearLock(user.id);

let account = db.listAccountsByUser(user.id).find((a) => a.channelName === TEST_CHANNEL);
let limitAccount = db.listAccountsByUser(user.id).find((a) => a.channelName === LIMIT_CHANNEL);
if (limitAccount) {
  limitAccount = db.updateAccount(limitAccount.id, {
    channelName: LIMIT_CHANNEL,
    lang: "space",
    sourceDecks: ["space"],
    channelLang: "en",
    schedule: [],
    status: "needs_auth",
    enabled: true,
  })!;
}
if (!account) {
  account = db.createAccount({
    userId: user.id,
    channelName: TEST_CHANNEL,
    theme: "E2E проверка мультипаков",
    lang: "space",
    sourceDecks: START_SOURCES,
    channelLang: "en",
    schedule: ["10:25", "17:14"],
    slotDecks: { "10:25": "space" },
    status: "needs_auth",
  });
} else {
  account = db.updateAccount(account.id, {
    channelName: TEST_CHANNEL,
    theme: "E2E проверка мультипаков",
    lang: "space",
    sourceDecks: START_SOURCES,
    channelLang: "en",
    schedule: ["10:25", "17:14"],
    slotDecks: { "10:25": "space" },
    enabled: true,
  })!;
}

const existing = db.listVideos(account.id);
for (const deck of SOURCES) {
  if (!existing.some((v) => v.deck === deck && v.title.startsWith("Codex E2E"))) {
    db.createVideo({
      accountId: account.id,
      title: deck === "space" ? "Codex E2E Space" : "Codex E2E Interesting Facts",
      text: `Codex E2E placeholder for ${deck}`,
      bg: "",
      music: "",
      deck,
      videoRel: "e2e-placeholder.mp4",
      imageRel: null,
    });
  }
}

const token = newSessionToken();
db.createSession(token, user.id, new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000).toISOString());

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const genRequests: GenPayload[] = [];
const waiters: Array<(body: GenPayload) => void> = [];
const nextGenRequest = () => new Promise<GenPayload>((resolve) => waiters.push(resolve));

try {
  await page.context().addCookies([{ name: "sid", value: token, url: BASE }]);
  await page.route("**/api/gen-queue", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = route.request().postDataJSON() as GenPayload;
    genRequests.push(body);
    waiters.shift()?.(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobId: `e2e-job-${genRequests.length}`, total: body.count ?? 1 }),
    });
  });
  await page.route("**/api/gen-queue/e2e-job-*", async (route) => {
    const n = genRequests.at(-1)?.count ?? 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "e2e-job", total: n, done: n, ahead: 0, position: -1, state: "done" }),
    });
  });

  await page.goto(`${BASE}/accounts/${account.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Библиотека роликов/ }).waitFor({ timeout: 15_000 });
  ok("Не выкинуло на логин", !(await page.getByRole("button", { name: "Войти" }).isVisible().catch(() => false)));
  ok("Блок «Паки канала» виден", await page.getByText("Паки канала").isVisible());
  ok("Блок «Генерация в библиотеку» виден", await page.getByText("Генерация в библиотеку").isVisible());

  await page.getByLabel("Добавить пак").selectOption("fact-en");
  await page.getByTitle("Interesting Facts", { exact: true }).waitFor({ timeout: 5_000 });
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await page.getByRole("button", { name: "Сохранено", exact: true }).waitFor({ timeout: 5_000 });
  same("Верхний «Сохранить» сохраняет добавленный пак", db.getAccount(account.id)?.sourceDecks, SOURCES);

  const packSelect = page.getByLabel("Пак для генерации");
  await packSelect.waitFor({ timeout: 10_000 });
  ok("В селекте есть вариант «Все паки»", (await packSelect.locator("option", { hasText: "Все паки" }).count()) === 1);
  ok("В селекте есть Space", (await packSelect.locator("option", { hasText: "Space" }).count()) === 1);
  ok("В селекте есть Interesting Facts", (await packSelect.locator("option", { hasText: "Interesting Facts" }).count()) === 1);

  await packSelect.selectOption("__all_decks__");
  await page.getByLabel("Сколько роликов сгенерировать").fill("3");
  const allReq = nextGenRequest();
  await page.getByRole("button", { name: "Генерировать", exact: true }).click();
  const allBody = await allReq;
  same("Все паки отправляет общий count", allBody.count, 3);
  same("Все паки отправляет оба источника", allBody.deckIds, SOURCES);

  await packSelect.selectOption("space");
  await page.getByLabel("Сколько роликов сгенерировать").fill("2");
  const oneReq = nextGenRequest();
  await page.getByRole("button", { name: "Генерировать", exact: true }).click();
  const oneBody = await oneReq;
  same("Один пак отправляет count без умножения", oneBody.count, 2);
  same("Один пак отправляет только выбранный источник", oneBody.deckIds, ["space"]);

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`Desktop без горизонтального скролла (${desktopOverflow}px)`, desktopOverflow <= 1);
  await page.screenshot({ path: "data/output/_e2e_account_multipack_desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(400);
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`Mobile без горизонтального скролла (${mobileOverflow}px)`, mobileOverflow <= 1);
  ok("Кнопка «Генерировать» видна на mobile", await page.getByRole("button", { name: "Генерировать", exact: true }).isVisible());
  await page.screenshot({ path: "data/output/_e2e_account_multipack_mobile.png", fullPage: true });

  limitAccount = limitAccount
    ? db.updateAccount(limitAccount.id, { schedule: manyTimes(91) })!
    : db.createAccount({
        userId: user.id,
        channelName: LIMIT_CHANNEL,
        theme: "E2E daily schedule cap",
        lang: "space",
        sourceDecks: ["space"],
        channelLang: "en",
        schedule: manyTimes(91),
        status: "needs_auth",
      });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/accounts/${account.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: /Библиотека роликов/ }).waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  const limitToast = page.getByText(/Лимит 92 публикаций/);
  await limitToast.waitFor({ timeout: 5_000 });
  ok("Лимит 92 показывает тост при сохранении", await limitToast.isVisible());
  const toastPosition = await limitToast.evaluate((el) => {
    const box = el.closest(".toast")?.getBoundingClientRect();
    if (!box) return null;
    return { right: window.innerWidth - box.right, bottom: window.innerHeight - box.bottom };
  });
  ok("Тост лимита находится справа внизу", !!toastPosition && toastPosition.right < 40 && toastPosition.bottom < 40);
  await page.screenshot({ path: "data/output/_e2e_account_daily_limit_toast.png", fullPage: true });

  console.log(`BASE=${BASE}`);
  console.log(`TEST_USER=${TEST_USER}`);
  console.log(`ACCOUNT=${account.id}`);
  console.log(out.join("\n"));
  console.log(process.exitCode ? "\nACCOUNT UI E2E: FAIL" : "\nACCOUNT UI E2E: PASS");
} catch (e) {
  console.log(out.join("\n"));
  console.error("ACCOUNT UI E2E ERROR:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  try {
    if (limitAccount) db.updateAccount(limitAccount.id, { schedule: [] });
    db.deleteSession(token);
  } catch {
    /* ignore cleanup failures */
  }
  await browser.close();
}

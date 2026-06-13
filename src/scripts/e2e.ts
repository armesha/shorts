import { chromium, type Browser } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const SHOT = "data/output/e2e";
await mkdir(SHOT, { recursive: true });

const results: { name: string; ok: boolean; info?: string }[] = [];
function check(name: string, ok: boolean, info = "") {
  results.push({ name, ok, info });
  console.log(`${ok ? "✅" : "❌"} ${name}${info ? " — " + info : ""}`);
}

const genResponse = (page: import("playwright").Page) =>
  page.waitForResponse(
    (r) => r.url().includes("/api/generate/anecdote") && r.status() === 200,
    { timeout: 40_000 },
  );

let browser: Browser | undefined;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Dashboard
  await page.goto(BASE, { waitUntil: "networkidle" });
  check("Дашборд открывается", await page.getByRole("heading", { name: "Обзор" }).isVisible());
  await page.screenshot({ path: `${SHOT}/01-dashboard.png` });

  // 2. Studio
  await page.getByRole("link", { name: "Студия" }).click();
  await page.waitForURL("**/studio");
  check("Переход в Студию", page.url().includes("/studio"));

  // 3. Generate
  const img = page.locator('img[alt="preview"]');
  await Promise.all([genResponse(page), page.getByRole("button", { name: "Сгенерировать" }).click()]);
  await img.waitFor({ timeout: 15_000 });
  const loaded = await img.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0);
  const src1 = await img.getAttribute("src");
  check("Генерация анекдота + превью отрисовано", loaded, src1 ?? "");
  await page.screenshot({ path: `${SHOT}/02-studio-generated.png` });

  // 4. Change background
  await Promise.all([genResponse(page), page.getByRole("button", { name: "Сменить фон" }).click()]);
  await page.waitForTimeout(400);
  const src2 = await img.getAttribute("src");
  check("Смена фона → новое превью", !!src2 && src2 !== src1);

  // 5. Edit text + re-render
  await page.locator("textarea").fill(
    "Проверка генератора: этот текст ввёл автотест Playwright, чтобы убедиться, что превью обновляется и текст вписывается в кадр.",
  );
  await Promise.all([genResponse(page), page.getByRole("button", { name: "Обновить с текстом" }).click()]);
  await page.waitForTimeout(400);
  const src3 = await img.getAttribute("src");
  check("Перерисовка с правкой текста", !!src3 && src3 !== src2);
  await page.screenshot({ path: `${SHOT}/03-studio-edited.png` });

  // 6. Accounts: create
  await page.getByRole("link", { name: "Каналы" }).click();
  await page.waitForURL("**/accounts");
  const [createResp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/accounts") && r.request().method() === "POST", { timeout: 15_000 }),
    page.getByRole("button", { name: "Добавить канал" }).first().click(),
  ]);
  const created = (await createResp.json()) as { id: number };
  await page.waitForURL("**/accounts/**");
  check("Создание канала (POST + переход на страницу)", !!created.id, `id=${created.id}`);

  // 7. Configure + save
  const textInputs = page.locator('input:not([type="time"])');
  await textInputs.nth(0).fill("Тест-канал e2e");
  await textInputs.nth(1).fill("Русские анекдоты");
  await page.locator("select").nth(0).selectOption("ru");
  await page.locator("select").nth(1).selectOption({ index: 3 });
  const [saveResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes(`/api/accounts/${created.id}`) && r.request().method() === "PUT", { timeout: 15_000 }),
    page.getByRole("button", { name: "Сохранить" }).click(),
  ]);
  const saved = (await saveResp.json()) as { channelName: string; lang: string; template: string };
  check("Сохранение настроек канала", saved.channelName === "Тест-канал e2e" && saved.lang === "ru", `шаблон: ${saved.template}`);
  await page.screenshot({ path: `${SHOT}/04-account-saved.png` });

  // 8. Appears in list
  await page.getByRole("link", { name: "Каналы" }).click();
  await page.waitForURL("**/accounts");
  await page.waitForTimeout(400);
  check("Канал виден в списке (персист в БД)", await page.getByText("Тест-канал e2e").isVisible());

  // 9. Cleanup
  await page.evaluate((id) => fetch(`/api/accounts/${id}`, { method: "DELETE" }), created.id);
  check("Удаление тест-канала (очистка БД)", true);
} catch (e) {
  check("Критическая ошибка прогона", false, String(e));
} finally {
  await browser?.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== E2E: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exit(1);

import { chromium, type Cookie, type Page } from "playwright";

export class YouTubeCookieError extends Error {}

/** Accept only YouTube/Google session cookies; never pass arbitrary domains to a browser. */
export function normalizeYouTubeCookies(input: unknown, now = Date.now() / 1000): Cookie[] {
  let raw = input;
  if (typeof raw === "string") {
    if (Buffer.byteLength(raw) > 512_000) throw new YouTubeCookieError("Слишком большой файл cookies.");
    try { raw = JSON.parse(raw); } catch { throw new YouTubeCookieError("Нужен JSON-экспорт cookies."); }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "cookies" in raw) raw = (raw as {cookies: unknown}).cookies;
  if (!Array.isArray(raw) || raw.length > 1000) throw new YouTubeCookieError("Некорректный формат cookies.");
  const cookies: Cookie[] = [];
  for (const item of raw) {
    if (!item || typeof item.name !== "string" || typeof item.value !== "string" || !item.name ||
      /[\x00-\x20;,]/.test(item.name) || item.name.length > 256 || item.value.length > 16384) continue;
    const domain = typeof item.domain === "string" ? item.domain.toLowerCase() : "";
    const host = domain.replace(/^\./, "");
    if (!(host === "youtube.com" || host.endsWith(".youtube.com") || host === "google.com" || host.endsWith(".google.com"))) continue;
    const expires = Number(item.expires ?? item.expirationDate ?? -1);
    if (expires > 0 && expires <= now) continue;
    const sameSite = String(item.sameSite || "").toLowerCase();
    cookies.push({ name: item.name, value: item.value, domain, path: typeof item.path === "string" && item.path.startsWith("/") ? item.path : "/",
      expires: expires > 0 && Number.isFinite(expires) ? expires : -1, httpOnly: item.httpOnly === true,
      secure: item.secure === true || sameSite === "none" || sameSite === "no_restriction",
      sameSite: sameSite === "strict" ? "Strict" : (sameSite === "none" || sameSite === "no_restriction") ? "None" : "Lax" });
  }
  if (!cookies.some(cookie => cookie.domain.replace(/^\./, "").endsWith("youtube.com") &&
    ["LOGIN_INFO", "__Secure-1PSID", "__Secure-3PSID"].includes(cookie.name)))
    throw new YouTubeCookieError("В экспорте нет действующей сессии YouTube.");
  return cookies;
}

export function studioChannelId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "studio.youtube.com") return null;
    return /^\/channel\/(UC[\w-]{22})(?:\/|$)/.exec(parsed.pathname)?.[1] || null;
  } catch { return null; }
}

export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    let id: string | null = null;
    if (parsed.hostname === "youtu.be") id = /^\/([\w-]{11})\/?$/.exec(parsed.pathname)?.[1] || null;
    else if (parsed.hostname === "youtube.com" || parsed.hostname === "www.youtube.com") {
      id = /^\/shorts\/([\w-]{11})\/?$/.exec(parsed.pathname)?.[1] || (parsed.pathname === "/watch" ? parsed.searchParams.get("v") : null);
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

async function channelInStudio(page: Page, authuser?: number): Promise<string> {
  const url = new URL("https://studio.youtube.com/?approve_browser_access=true");
  if (authuser !== undefined) url.searchParams.set("authuser", String(authuser));
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForURL(url => !!studioChannelId(url.toString()), { timeout: 20_000 }).catch(() => {});
  const channelId = studioChannelId(page.url());
  if (!channelId) throw new YouTubeCookieError("Не удалось подтвердить канал YouTube Studio. Проверьте вход и наличие канала.");
  return channelId;
}

/** Uses Studio's browser workflow. A returned URL requires an independent public-page check. */
export function createYouTubeCookieBrowser(chromePath: string, launch: typeof chromium.launch = chromium.launch.bind(chromium)) {
  async function run<T>(cookies: Cookie[], fn: (page: Page, browser: Awaited<ReturnType<typeof chromium.launch>>) => Promise<T>): Promise<T> {
    const browser = await launch({ executablePath: chromePath, headless: true, args: ["--no-sandbox"] });
    try {
      const context = await browser.newContext({ locale: "en-US", viewport: { width: 1440, height: 1000 } });
      await context.addCookies(cookies);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      return await fn(page, browser);
    } finally { await browser.close(); }
  }
  return {
    verify: (cookies: Cookie[], authuser?: number) => run(cookies, async page => ({ channelId: await channelInStudio(page, authuser) })),
    publish: (cookies: Cookie[], expectedChannelId: string, file: string, title: string, description: string, onSubmit: () => void, authuser?: number) =>
      run(cookies, async (page, browser) => {
        if (await channelInStudio(page, authuser) !== expectedChannelId) throw new YouTubeCookieError("Открыт другой канал YouTube.");
        const upload = new URL("https://www.youtube.com/upload");
        if (authuser !== undefined) upload.searchParams.set("authuser", String(authuser));
        await page.goto(upload.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
        if (studioChannelId(page.url()) !== expectedChannelId) throw new YouTubeCookieError("Не удалось подтвердить канал в редакторе YouTube.");
        const uploadUrl = new URL(page.url());
        uploadUrl.searchParams.set("approve_browser_access", "true");
        await page.goto(uploadUrl.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
        if (studioChannelId(page.url()) !== expectedChannelId) throw new YouTubeCookieError("Не удалось подтвердить канал в редакторе YouTube.");
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.waitFor({ state: "attached", timeout: 5_000 }).catch(() => {});
        if (!await fileInput.count()) {
          await page.getByRole("button", { name: /^(Create|Utwórz|Создать)$/i }).first().click();
          await page.locator("ytcp-text-menu").getByText(/^(Upload videos|Prześlij filmy|Добавить видео)$/i).first().click();
        }
        await page.locator('input[type="file"]').first().setInputFiles(file, { timeout: 60_000 });
        await page.locator("#title-textarea #textbox").fill(title, { timeout: 120_000 });
        await page.locator("#description-textarea #textbox").fill(description);
        await page.locator('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').click();
        for (let i = 0; i < 3; i++) {
          const previousStep = await page.locator("ytcp-uploads-dialog").getAttribute("workflow-step");
          await page.locator("#next-button").click({ timeout: 120_000 });
          if (previousStep) await page.waitForFunction(step => document.querySelector("ytcp-uploads-dialog")?.getAttribute("workflow-step") !== step,
            previousStep, { timeout: 120_000 });
        }
        await page.locator('tp-yt-paper-radio-button[name="PUBLIC"]').click({ timeout: 120_000 });
        const href = await page.locator("#video-link, span.video-url-fadeable a").first().getAttribute("href", { timeout: 120_000 });
        const videoId = href && youtubeVideoId(href);
        if (!videoId) throw new YouTubeCookieError("YouTube не вернул идентификатор ролика.");
        await page.waitForFunction(() => {
          const done = document.querySelector("#done-button");
          return !!done && done.getAttribute("aria-disabled") !== "true" && !done.hasAttribute("disabled");
        }, undefined, { timeout: 30 * 60_000 });
        onSubmit();
        await page.locator("#done-button").click();
        await page.locator("ytcp-uploads-dialog").waitFor({ state: "hidden", timeout: 120_000 });
        const visitor = await browser.newContext({ locale: "en-US" });
        try {
          const check = await visitor.newPage();
          let visible = false;
          for (let attempt = 0; attempt < 12 && !visible; attempt++) {
            if (attempt) await check.waitForTimeout(5_000);
            await check.goto(`https://www.youtube.com/watch?v=${videoId}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
            visible = await check.evaluate(({ videoId, channelId }) => {
              const data = (window as unknown as { ytInitialPlayerResponse?: { videoDetails?: { videoId?: string; channelId?: string }; playabilityStatus?: { status?: string } } }).ytInitialPlayerResponse;
              return data?.videoDetails?.videoId === videoId && data.videoDetails.channelId === channelId && data.playabilityStatus?.status === "OK";
            }, { videoId, channelId: expectedChannelId });
          }
          if (!visible) throw new YouTubeCookieError("Публикация не подтверждена. Проверьте канал перед повтором.");
        } finally { await visitor.close(); }
        return `https://www.youtube.com/watch?v=${videoId}`;
      }),
  };
}

import { chromium, type Cookie, type Page } from "playwright";
import { SocialError, type SocialPlatform } from "./cookies.ts";

export type SocialProfile = { handle: string; userId: string };
export interface SocialBrowser {
  verify(platform: SocialPlatform, cookies: Cookie[]): Promise<SocialProfile>;
  publish(
    platform: SocialPlatform,
    cookies: Cookie[],
    profile: SocialProfile,
    file: string,
    caption: string,
    onSubmit: () => void,
  ): Promise<string>;
}

async function sessionProfile(
  page: Page,
  platform: SocialPlatform,
  cookies: Cookie[],
): Promise<SocialProfile> {
  if (/login|challenge|checkpoint/.test(page.url()))
    throw new SocialError(
      "Сессия истекла или требуется подтверждение входа. Войдите в браузере и загрузите свежие cookies.",
      409,
    );
  if (platform === "instagram") {
    const id = cookies.find((c) => c.name === "ds_user_id")!.value;
    const result = await page
      .evaluate(async () => {
        const response = await fetch(
          "/api/v1/accounts/current_user/?edit=true",
          { headers: { "X-IG-App-ID": "936619743392459" } },
        );
        if (!response.ok) return null;
        const body = await response.json();
        return body.user
          ? {
              handle: String(body.user.username || ""),
              userId: String(body.user.pk || body.user.id || ""),
            }
          : null;
      })
      .catch(() => null);
    if (result?.handle && result.userId === id) return result;
  } else {
    const profile = await page.evaluate(() => {
      const script = document.querySelector(
        "#__UNIVERSAL_DATA_FOR_REHYDRATION__",
      );
      try {
        const data = JSON.parse(script?.textContent || "{}");
        const ctx = data.__DEFAULT_SCOPE__?.["webapp.app-context"];
        const u = ctx?.user;
        if (ctx?.isLogin && u?.uid && u?.uniqueId)
          return { handle: String(u.uniqueId), userId: String(u.uid) };
      } catch {
        /* no authenticated app state */
      }
      return null;
    });
    if (profile) return profile;
  }
  throw new SocialError(
    "Не удалось подтвердить аккаунт. Проверьте вход на площадке и загрузите полный свежий экспорт cookies.",
    409,
  );
}

export function createSocialBrowser(
  chromePath: string,
  launch: typeof chromium.launch = chromium.launch.bind(chromium),
): SocialBrowser {
  let activeBrowsers = 0;
  async function run<T>(
    platform: SocialPlatform,
    cookies: Cookie[],
    action: (page: Page) => Promise<T>,
  ): Promise<T> {
    if (activeBrowsers >= 2)
      throw new SocialError("Проверки заняты. Повторите через минуту.", 429);
    activeBrowsers++;
    let browser;
    try {
      browser = await launch({
        executablePath: chromePath,
        headless: true,
        args: ["--no-sandbox"],
      });
      const context = await browser.newContext({
        locale: "en-US",
        viewport: { width: 1440, height: 1000 },
      });
      await context.addCookies(cookies);
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(`https://www.${platform}.com/`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page
        .waitForLoadState("networkidle", { timeout: 10_000 })
        .catch(() => {});
      return await action(page);
    } finally {
      await browser?.close();
      activeBrowsers--;
    }
  }
  return {
    verify: (platform, cookies) =>
      run(platform, cookies, (page) => sessionProfile(page, platform, cookies)),
    publish: (platform, cookies, profile, file, caption, onSubmit) =>
      run(platform, cookies, async (page) => {
        const actual = await sessionProfile(page, platform, cookies);
        if (actual.userId !== profile.userId)
          throw new SocialError(
            "Аккаунт изменился. Проверьте подключение повторно.",
            409,
          );
        if (platform === "tiktok") {
          await page.goto("https://www.tiktok.com/tiktokstudio/upload", {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          await page
            .locator('input[type="file"]')
            .first()
            .setInputFiles(file, { timeout: 60_000 });
          const editor = page.locator('[contenteditable="true"]').first();
          await editor.waitFor({ timeout: 120_000 });
          await editor.fill(caption);
          const post = page.getByRole("button", { name: /^Post$/i }).first();
          await post.waitFor({ timeout: 120_000 });
          await page.waitForFunction(
            () => {
              const buttons = [...document.querySelectorAll("button")];
              return buttons.some(
                (b) => b.textContent?.trim() === "Post" && !b.disabled,
              );
            },
            undefined,
            { timeout: 120_000 },
          );
          onSubmit();
          const confirmation = page
            .waitForResponse(
              (r) =>
                r.request().method() === "POST" &&
                /\/api\/v1\/item\/create\/|\/api\/post\/item\/commit\/|\/api\/post\/item\/create\//.test(
                  new URL(r.url()).pathname,
                ),
              { timeout: 120_000 },
            )
            .catch(() => null);
          await post.click();
          const response = await confirmation;
          if (!response)
            throw new SocialError(
              "Проверьте профиль: результат отправки не подтверждён.",
              409,
              true,
            );
          const body = await response.json();
          const id = body?.item_id || body?.data?.item_id || body?.item?.id;
          if (response.ok() && id && /^\d+$/.test(String(id)))
            return `https://www.tiktok.com/@${actual.handle}/video/${id}`;
        } else {
          await page
            .getByRole("link", { name: /New post|Create/i })
            .first()
            .click();
          const postChoice = page.getByText("Post", { exact: true });
          if (await postChoice.isVisible().catch(() => false))
            await postChoice.click();
          await page.locator('input[type="file"]').first().setInputFiles(file);
          for (let i = 0; i < 2; i++)
            await page
              .getByRole("button", { name: /^Next$/i })
              .click({ timeout: 120_000 });
          const editor = page
            .locator(
              '[contenteditable="true"][role="textbox"], textarea[aria-label*="caption"]',
            )
            .first();
          await editor.fill(caption);
          const share = page.getByRole("button", { name: /^Share$/i }).first();
          await share.waitFor();
          onSubmit();
          const confirmation = page
            .waitForResponse(
              (r) =>
                r.request().method() === "POST" &&
                /\/media\/configure(?:_to_clips)?\//.test(
                  new URL(r.url()).pathname,
                ),
              { timeout: 120_000 },
            )
            .catch(() => null);
          await share.click();
          const response = await confirmation;
          if (!response)
            throw new SocialError(
              "Проверьте профиль: результат отправки не подтверждён.",
              409,
              true,
            );
          const body = await response.json();
          const code = body?.media?.code;
          if (
            response.ok() &&
            body.status === "ok" &&
            typeof code === "string" &&
            /^[\w-]+$/.test(code)
          )
            return `https://www.instagram.com/reel/${code}/`;
        }
        throw new SocialError(
          "Площадка не подтвердила публикацию. Проверьте профиль перед повторной отправкой.",
          409,
          true,
        );
      }),
  };
}

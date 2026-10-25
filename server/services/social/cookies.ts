import type { Cookie } from "playwright";

export type SocialPlatform = "instagram" | "tiktok";
export class SocialError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
    public uncertain = false,
  ) {
    super(message);
  }
}
export function platformValue(value: unknown): SocialPlatform {
  if (value === "instagram" || value === "tiktok") return value;
  throw new SocialError("Неизвестная площадка.");
}
export function normalizeSocialCookies(
  input: unknown,
  platform: SocialPlatform,
  now = Date.now() / 1000,
): Cookie[] {
  const domain = `.${platform}.com`;
  const authNames =
    platform === "instagram"
      ? ["sessionid"]
      : ["sessionid", "sessionid_ss", "sid_tt"];
  let raw: unknown = input;
  if (typeof raw === "string") {
    if (Buffer.byteLength(raw) > 512_000)
      throw new SocialError("Файл cookies слишком большой. Максимум — 500 КБ.");
    const text = raw.trim();
    try {
      raw = JSON.parse(text);
    } catch {
      if (text.includes("\t")) {
        raw = text
          .split(/\r?\n/)
          .filter(
            (line) =>
              line && (!line.startsWith("#") || line.startsWith("#HttpOnly_")),
          )
          .map((line) => {
            const [domain, , path, secure, expires, name, ...value] = line
              .replace(/^#HttpOnly_/, "")
              .split("\t");
            return {
              domain,
              path,
              secure: secure === "TRUE",
              expires: Number(expires),
              name,
              value: value.join("\t"),
              httpOnly: line.startsWith("#HttpOnly_"),
            };
          });
      } else if (text.includes("=")) {
        raw = text
          .replace(/^cookie:\s*/i, "")
          .split(";")
          .filter((p) => p.includes("="))
          .map((p) => {
            const i = p.indexOf("=");
            return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
          });
      } else
        throw new SocialError(
          "Нужен JSON-экспорт cookies, storageState или cookies.txt.",
        );
    }
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "cookies" in raw)
    raw = (raw as { cookies: unknown }).cookies;
  if (raw && typeof raw === "object" && !Array.isArray(raw))
    raw = Object.entries(raw).map(([name, value]) => ({ name, value }));
  if (!Array.isArray(raw) || raw.length > 1000)
    throw new SocialError("Некорректный формат cookies.");
  const cookies: Cookie[] = [];
  for (const c of raw) {
    if (
      !c ||
      typeof c.name !== "string" ||
      typeof c.value !== "string" ||
      !c.name ||
      /[\x00-\x20;,]/.test(c.name) ||
      c.name.length > 256 ||
      c.value.length > 16384
    )
      continue;
    let host = typeof c.domain === "string" ? c.domain.toLowerCase() : domain;
    if (c.url) {
      try {
        host = new URL(c.url).hostname;
      } catch {
        continue;
      }
    }
    const bare = host.replace(/^\./, "");
    if (bare !== `${platform}.com` && !bare.endsWith(`.${platform}.com`))
      continue;
    const expires = Number(c.expires ?? c.expirationDate ?? -1);
    if (expires > 0 && expires <= now) continue;
    const same = String(c.sameSite || "").toLowerCase();
    cookies.push({
      name: c.name,
      value: c.value,
      domain: host,
      path: typeof c.path === "string" && c.path.startsWith("/") ? c.path : "/",
      expires: expires > 0 && Number.isFinite(expires) ? expires : -1,
      httpOnly: c.httpOnly === true || authNames.includes(c.name),
      secure: true,
      sameSite:
        same === "strict"
          ? "Strict"
          : ["none", "no_restriction"].includes(same)
            ? "None"
            : "Lax",
    });
  }
  if (!cookies.some((c) => authNames.includes(c.name) && c.value))
    throw new SocialError(
      "Нет действующей сессии. Экспортируйте cookies после входа на выбранную площадку.",
    );
  if (
    platform === "instagram" &&
    !cookies.some((c) => c.name === "ds_user_id" && /^\d+$/.test(c.value))
  )
    throw new SocialError(
      "В экспорте Instagram отсутствует ds_user_id. Экспортируйте все cookies сайта.",
    );
  return [
    ...new Map(
      cookies.map((c) => [`${c.domain}:${c.path}:${c.name}`, c]),
    ).values(),
  ];
}

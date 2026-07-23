import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import puppeteer from "puppeteer-core";
import { chromePath } from "../../src/core/chrome.ts";

export type CircleAdvertiser = {
  id: string;
  name: string;
  brand: string;
  headline: string;
  subline: string;
  cta: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  assetFile: string;
  assetType?: "generated" | "video";
  transparent?: boolean;
  chromaColor?: string;
  similarity?: number;
  blend?: number;
  fullFrame?: boolean;
  sourceName?: string;
  logoFile?: string;
  legacy?: boolean;
  hasLogo?: boolean;
  hasVideo?: boolean;
};

type AdvertiserStore = { version: 1; items: CircleAdvertiser[] };
type CircleConfig = {
  video?: {
    banner?: {
      enabled?: boolean;
      file?: string;
      transparent?: boolean;
      advertiserId?: string;
      chromaColor?: string;
      similarity?: number;
      blend?: number;
      fullFrame?: boolean;
    };
  };
};

const ffmpeg = ffmpegPath as unknown as string | null;
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".webm", ".mkv"]);

const LEGACY_YUKI: CircleAdvertiser = {
  id: "yuki",
  name: "Yuki · анимированный",
  brand: "Yuki",
  headline: "Быстрый VPN",
  subline: "Готовый анимированный баннер",
  cta: "Открыть",
  accentColor: "#ff2f78",
  backgroundColor: "#22121d",
  textColor: "#ffffff",
  assetFile: "output/yuki-shorts-alpha.mov",
  assetType: "video",
  transparent: true,
  fullFrame: true,
  sourceName: "yuki-shorts-alpha.mov",
  legacy: true,
};

export function circleProjectDir(): string {
  return resolve(process.cwd(), process.env.TG_CIRCLES_DIR?.trim() || "../tg circles");
}

function bannerDir(): string {
  return resolve(circleProjectDir(), "banner");
}

function storeFile(): string {
  return resolve(bannerDir(), "advertisers.json");
}

function configFile(): string {
  return resolve(circleProjectDir(), "config.json");
}

function clean(value: unknown, fallback: string, max = 120): string {
  const result = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return result || fallback;
}

function color(value: unknown, fallback: string): string {
  const result = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(result) ? result.toLowerCase() : fallback;
}

function finite(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function safeId(value: unknown): string {
  const result = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(result) ? result : "";
}

function loadStore(): AdvertiserStore {
  if (!existsSync(storeFile())) return { version: 1, items: [] };
  try {
    const parsed = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<AdvertiserStore>;
    return {
      version: 1,
      items: Array.isArray(parsed.items)
        ? parsed.items.filter((item): item is CircleAdvertiser => !!item && typeof item.id === "string")
        : [],
    };
  } catch {
    return { version: 1, items: [] };
  }
}

async function saveStore(store: AdvertiserStore): Promise<void> {
  const file = storeFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function loadConfig(): CircleConfig {
  if (!existsSync(configFile())) throw new Error(`Не найден ${configFile()}`);
  return JSON.parse(readFileSync(configFile(), "utf8")) as CircleConfig;
}

async function saveConfig(config: CircleConfig): Promise<void> {
  const file = configFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function publicAdvertiser(item: CircleAdvertiser): CircleAdvertiser {
  return {
    ...item,
    hasLogo: !!item.logoFile,
    hasVideo: item.assetType === "video" || VIDEO_EXTENSIONS.has(extname(item.assetFile).toLowerCase()),
  };
}

export function listCircleAdvertisers(): CircleAdvertiser[] {
  return loadStore().items.map(publicAdvertiser);
}

export function circleAdvertiserState(): {
  advertisers: CircleAdvertiser[];
  activeAdvertiserId: string;
  bannerEnabled: boolean;
} {
  const config = loadConfig();
  const banner = config.video?.banner;
  const advertisers = listCircleAdvertisers();
  const active = safeId(banner?.advertiserId);
  const ids = new Set(advertisers.map((item) => item.id));
  return {
    advertisers,
    activeAdvertiserId: ids.has(active) ? active : advertisers[0]?.id || "",
    bannerEnabled: advertisers.length > 0 && banner?.enabled !== false,
  };
}

function logoData(item: CircleAdvertiser): string {
  if (!item.logoFile) return "";
  const path = resolve(bannerDir(), item.logoFile);
  if (!existsSync(path)) return "";
  const extension = extname(path).toLowerCase();
  const mime = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function renderAdvertiser(item: CircleAdvertiser): Promise<void> {
  const output = resolve(bannerDir(), item.assetFile);
  await mkdir(dirname(output), { recursive: true });
  const logo = logoData(item);
  const initials = item.brand.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;background:transparent;overflow:hidden}
    body{font-family:Arial,sans-serif}
    .ad{position:absolute;left:90px;top:830px;width:900px;height:260px;border-radius:42px;padding:28px 30px;
      display:grid;grid-template-columns:160px minmax(0,1fr) 170px;align-items:center;gap:20px;color:${item.textColor};
      background:linear-gradient(125deg,${item.backgroundColor} 0%,${item.backgroundColor} 58%,${item.accentColor} 155%);
      border:3px solid ${item.accentColor};box-shadow:0 20px 55px rgba(0,0,0,.38)}
    .logo{width:140px;height:140px;border-radius:32px;display:grid;place-items:center;overflow:hidden;
      background:rgba(255,255,255,.13);border:2px solid rgba(255,255,255,.22);font-size:54px;font-weight:900}
    .logo img{width:100%;height:100%;object-fit:contain;padding:15px}
    .copy{min-width:0}.brand{font-size:25px;line-height:1;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${item.accentColor};
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .headline{margin-top:12px;font-size:35px;line-height:1.04;font-weight:900;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    .subline{margin-top:10px;font-size:24px;line-height:1.12;opacity:.82;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cta{height:76px;border-radius:24px;display:grid;place-items:center;padding:0 16px;text-align:center;
      color:#fff;background:${item.accentColor};font-size:24px;font-weight:900;box-shadow:0 12px 30px color-mix(in srgb,${item.accentColor} 42%,transparent)}
  </style></head><body><div class="ad">
    <div class="logo">${logo ? `<img src="${logo}">` : escapeHtml(initials || "AD")}</div>
    <div class="copy"><div class="brand">${escapeHtml(item.brand)}</div><div class="headline">${escapeHtml(item.headline)}</div><div class="subline">${escapeHtml(item.subline)}</div></div>
    <div class="cta">${escapeHtml(item.cta)}</div>
  </div></body></html>`;

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({
      path: output as `${string}.png`,
      type: "png",
      omitBackground: true,
      clip: { x: 0, y: 0, width: 1080, height: 1920 },
    });
  } finally {
    await browser.close();
  }
}

async function saveLogo(id: string, dataUrl: unknown, removeLogo: boolean, current?: CircleAdvertiser): Promise<string | undefined> {
  if (removeLogo) return undefined;
  if (typeof dataUrl !== "string" || !dataUrl) return current?.logoFile;
  const match = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
  if (!match) throw new Error("Логотип должен быть PNG, JPEG или WebP.");
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > 2_500_000) throw new Error("Логотип должен быть меньше 2,5 МБ.");
  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const relative = `custom/${id}-logo.${extension}`;
  const target = resolve(bannerDir(), relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return relative;
}

function validateVideo(file: string): Promise<{ width: number; height: number }> {
  if (!ffmpeg) throw new Error("FFmpeg недоступен на этой платформе.");
  return new Promise((resolvePromise, reject) => {
    const child = spawn(ffmpeg, [
      "-hide_banner", "-loglevel", "info", "-i", file,
      "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-",
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-30_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      const match = stderr.match(/Video:[^\r\n]*?(\d{2,5})x(\d{2,5})/i);
      if (code !== 0 || !match) return reject(new Error("Файл не удалось прочитать как видео."));
      resolvePromise({ width: Number(match[1]), height: Number(match[2]) });
    });
  });
}

async function saveUploadedVideo(
  id: string,
  input: Record<string, unknown>,
): Promise<{ assetFile: string; sourceName: string; fullFrame: boolean } | null> {
  if (typeof input.videoDataUrl !== "string" || !input.videoDataUrl) return null;
  const sourceName = clean(input.videoName, "banner.mov", 120);
  const extension = extname(sourceName).toLowerCase();
  if (!VIDEO_EXTENSIONS.has(extension)) throw new Error("Поддерживаются MOV, MP4, WebM и MKV.");
  const match = /^data:([^;,]+)?;base64,([a-z0-9+/=\s]+)$/i.exec(input.videoDataUrl);
  if (!match) throw new Error("Не удалось прочитать загруженное видео.");
  const mime = String(match[1] || "").toLowerCase();
  if (mime && !["video/quicktime", "video/mp4", "video/webm", "video/x-matroska", "application/octet-stream"].includes(mime)) {
    throw new Error("Неподдерживаемый тип видео.");
  }
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length) throw new Error("Загружен пустой видеофайл.");
  const relative = `custom/${id}${extension}`;
  const target = resolve(bannerDir(), relative);
  const temporary = `${target}.${process.pid}.upload`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, buffer);
  try {
    const dimensions = await validateVideo(temporary);
    await rm(target, { force: true });
    await rename(temporary, target);
    const requested = String(input.fullFrameMode || "auto");
    const fullFrame = requested === "canvas" || (requested !== "banner" && dimensions.height > dimensions.width * 1.2);
    return { assetFile: relative, sourceName, fullFrame };
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function upsertCircleAdvertiser(input: Record<string, unknown>): Promise<CircleAdvertiser> {
  const store = loadStore();
  const requestedId = safeId(input.id);
  const current = requestedId ? store.items.find((item) => item.id === requestedId) : undefined;
  if (requestedId === "yuki") throw new Error("Встроенный баннер Yuki нельзя перезаписать.");
  const id = requestedId || `ad-${randomUUID().slice(0, 8)}`;
  const brand = clean(input.brand, "Рекламодатель", 48);
  const uploaded = await saveUploadedVideo(id, input);
  const useVideo = !!uploaded || current?.assetType === "video";
  const oldAsset = current?.assetFile;
  const item: CircleAdvertiser = {
    id,
    name: clean(input.name, brand, 64),
    brand,
    headline: clean(input.headline, "Ваше предложение", 60),
    subline: clean(input.subline, "Короткое рекламное описание", 90),
    cta: clean(input.cta, "Подробнее", 24),
    accentColor: color(input.accentColor, "#ff2f78"),
    backgroundColor: color(input.backgroundColor, "#21151f"),
    textColor: color(input.textColor, "#ffffff"),
    assetFile: uploaded?.assetFile || current?.assetFile || `custom/${id}.png`,
    assetType: useVideo ? "video" : "generated",
    transparent: useVideo ? input.transparent !== false : true,
    chromaColor: color(input.chromaColor, current?.chromaColor || "#00ff00"),
    similarity: finite(input.similarity, current?.similarity ?? 0.18, 0.01, 1),
    blend: finite(input.blend, current?.blend ?? 0.08, 0, 1),
    fullFrame: uploaded?.fullFrame ?? current?.fullFrame ?? true,
    sourceName: uploaded?.sourceName || current?.sourceName,
    logoFile: useVideo ? current?.logoFile : await saveLogo(id, input.logoDataUrl, input.removeLogo === true, current),
  };
  if (!useVideo) await renderAdvertiser(item);
  const index = store.items.findIndex((entry) => entry.id === id);
  if (index >= 0) store.items[index] = item;
  else store.items.push(item);
  await saveStore(store);
  if (uploaded && oldAsset && oldAsset !== uploaded.assetFile) await rm(resolve(bannerDir(), oldAsset), { force: true });
  return publicAdvertiser(item);
}

export async function activateCircleAdvertiser(idValue: unknown, enabledValue: unknown): Promise<void> {
  const id = safeId(idValue);
  const item = listCircleAdvertisers().find((entry) => entry.id === id);
  const config = loadConfig();
  const video = (config.video ||= {});
  const banner = (video.banner ||= {});

  if (!item) {
    if (enabledValue !== false) throw new Error("Сначала загрузите рекламный баннер.");
    banner.enabled = false;
    banner.advertiserId = "";
    await saveConfig(config);
    return;
  }
  banner.enabled = enabledValue !== false;
  banner.advertiserId = item.id;
  banner.file = `./banner/${item.assetFile}`.replace(/\\/g, "/");
  banner.transparent = item.transparent !== false;
  banner.chromaColor = (item.chromaColor || "#00ff00").replace("#", "0x");
  banner.similarity = item.similarity ?? 0.18;
  banner.blend = item.blend ?? 0.08;
  banner.fullFrame = item.fullFrame !== false;
  await saveConfig(config);
}

export async function deleteCircleAdvertiser(idValue: unknown): Promise<void> {
  const id = safeId(idValue);
  if (!id || id === "yuki") throw new Error("Встроенный баннер Yuki удалить нельзя.");
  const store = loadStore();
  const item = store.items.find((entry) => entry.id === id);
  if (!item) throw new Error("Рекламодатель не найден.");
  const previous = circleAdvertiserState();
  const wasActive = previous.activeAdvertiserId === id;
  store.items = store.items.filter((entry) => entry.id !== id);
  await saveStore(store);
  await rm(resolve(bannerDir(), item.assetFile), { force: true });
  if (item.logoFile) await rm(resolve(bannerDir(), item.logoFile), { force: true });
  if (wasActive) {
    const next = listCircleAdvertisers()[0];
    await activateCircleAdvertiser(next?.id || "", next ? previous.bannerEnabled : false);
  }
}

export function circleAdvertiserSource(idValue?: unknown): string {
  const state = circleAdvertiserState();
  const id = safeId(idValue) || state.activeAdvertiserId;
  const item = state.advertisers.find((entry) => entry.id === id) || LEGACY_YUKI;
  return resolve(bannerDir(), item.assetFile);
}

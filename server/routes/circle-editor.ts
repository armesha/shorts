import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import ffmpegPath from "ffmpeg-static";
import type { Db } from "../db.ts";
import {
  circleAdvertiserSource,
  circleAdvertiserState,
  deleteCircleAdvertiser,
  upsertCircleAdvertiser,
} from "../services/circle-advertisers.ts";
import {
  activateCircleTemplate,
  activeCircleTemplateId,
  deleteCircleTemplate,
  listCircleTemplates,
  replaceCircleTemplateAdvertiser,
  saveCircleTemplate,
  setActiveCircleTemplateAdvertiser,
  type CircleLayout,
} from "../services/circle-templates.ts";

type Layout = CircleLayout;

const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]);
const packagedFfmpeg = ffmpegPath as unknown as string | null;
const ffmpeg = packagedFfmpeg && existsSync(packagedFfmpeg)
  ? packagedFfmpeg
  : (process.env.FFMPEG_PATH?.trim() || "ffmpeg");
let rendering = false;

function projectDir(): string {
  return resolve(process.cwd(), process.env.TG_CIRCLES_DIR?.trim() || "../tg circles");
}

function requireAdmin(req: FastifyRequest, reply: FastifyReply, db: Db): boolean {
  const userId = (req as FastifyRequest & { userId?: number }).userId;
  const user = userId ? db.getUserById(userId) : null;
  if (!user || user.role !== "admin") {
    void reply.code(403).send({ error: "Редактор кружков доступен только администраторам" });
    return false;
  }
  return true;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.min(max, Math.max(min, parsed))) : fallback;
}

function sanitizeLayout(value: unknown): Layout {
  const root = (value && typeof value === "object" ? value : {}) as Partial<Layout>;
  return {
    circle: {
      x: num(root.circle?.x, 130, -1000, 2080),
      y: num(root.circle?.y, 300, -1000, 2920),
      size: num(root.circle?.size, 820, 160, 1400),
    },
    puzzle: {
      x: num(root.puzzle?.x, 90, -1000, 2080),
      y: num(root.puzzle?.y, 92, 0, 1800),
      width: num(root.puzzle?.width, 900, 160, 2160),
      labelSize: num(root.puzzle?.labelSize, 30, 16, 120),
      puzzleSize: num(root.puzzle?.puzzleSize, 68, 24, 180),
      gap: num(root.puzzle?.gap, 14, 0, 100),
    },
    banner: {
      x: num(root.banner?.x, 90, -1000, 2080),
      y: num(root.banner?.y, 830, -500, 3000),
      width: num(root.banner?.width, 900, 160, 2160),
      height: num(root.banner?.height, 260, 60, 1080),
    },
  };
}

function loadCircleConfig(): Record<string, unknown> {
  const file = resolve(projectDir(), "config.json");
  if (!existsSync(file)) throw new Error(`Не найден проект tg circles: ${file}`);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function layoutFromConfig(config: Record<string, unknown>): Layout {
  const video = (config.video || {}) as Record<string, unknown>;
  const puzzle = (video.engagement || {}) as Record<string, unknown>;
  const banner = (video.banner || {}) as Record<string, unknown>;
  return sanitizeLayout({
    circle: { x: video.circleLeft, y: video.circleTop, size: video.circleDiameter },
    puzzle: {
      x: puzzle.left,
      y: puzzle.top,
      width: puzzle.width,
      labelSize: puzzle.labelFontSize,
      puzzleSize: puzzle.puzzleFontSize,
      gap: puzzle.lineGap,
    },
    banner: { x: banner.left, y: banner.top, width: banner.width, height: banner.height },
  });
}

function cleanTemplateName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

async function saveLayout(layoutValue: unknown, nameValue?: unknown): Promise<Layout> {
  const layout = sanitizeLayout(layoutValue);
  const file = resolve(projectDir(), "config.json");
  const config = loadCircleConfig();
  const requestedName = cleanTemplateName(nameValue);
  if (requestedName) config.templateName = requestedName;
  const video = ((config.video ||= {}) as Record<string, unknown>);
  video.circleLeft = layout.circle.x;
  video.circleTop = layout.circle.y;
  video.circleDiameter = layout.circle.size;
  const puzzle = ((video.engagement ||= {}) as Record<string, unknown>);
  puzzle.left = layout.puzzle.x;
  puzzle.top = layout.puzzle.y;
  puzzle.width = layout.puzzle.width;
  puzzle.labelFontSize = layout.puzzle.labelSize;
  puzzle.puzzleFontSize = layout.puzzle.puzzleSize;
  puzzle.lineGap = layout.puzzle.gap;
  const banner = ((video.banner ||= {}) as Record<string, unknown>);
  banner.left = layout.banner.x;
  banner.top = layout.banner.y;
  banner.width = layout.banner.width;
  banner.height = layout.banner.height;
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return layout;
}

function listVideos(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && VIDEO_EXT.has(extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "ru-RU"));
}

function mediaPath(kind: string, name: string): string | null {
  const dirs: Record<string, string> = {
    source: resolve(projectDir(), "downloads"),
    gameplay: resolve(projectDir(), "gameplay"),
    output: resolve(projectDir(), "output"),
  };
  const dir = dirs[kind];
  if (!dir) return null;
  const file = resolve(dir, basename(name));
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

function streamMedia(req: FastifyRequest, reply: FastifyReply, file: string): unknown {
  const size = statSync(file).size;
  const range = req.headers.range;
  const contentType = extname(file).toLowerCase() === ".webm" ? "video/webm" : "video/mp4";
  reply.header("Accept-Ranges", "bytes").header("Content-Type", contentType);
  if (!range) return reply.header("Content-Length", String(size)).send(createReadStream(file));
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return reply.code(416).header("Content-Range", `bytes */${size}`).send();
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return reply.code(416).header("Content-Range", `bytes */${size}`).send();
  }
  return reply
    .code(206)
    .header("Content-Range", `bytes ${start}-${end}/${size}`)
    .header("Content-Length", String(end - start + 1))
    .send(createReadStream(file, { start, end }));
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout = (stdout + chunk).slice(-20_000); });
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-20_000); });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.split(/\r?\n/).filter(Boolean).slice(-10).join(" ") || `Процесс завершился с кодом ${code}`));
    });
  });
}

async function bannerPreview(id?: unknown): Promise<string> {
  const source = circleAdvertiserSource(id);
  if (!existsSync(source)) throw new Error(`Не найден баннер: ${source}`);
  const state = circleAdvertiserState();
  const safeId = String(id || state.activeAdvertiserId).replace(/[^a-z0-9_-]+/gi, "-");
  const item = state.advertisers.find((entry) => entry.id === safeId)
    || state.advertisers.find((entry) => entry.id === state.activeAdvertiserId)
    || state.advertisers[0];
  const effectKey = `${item?.transparent !== false ? "alpha" : "key"}-${item?.chromaColor || "00ff00"}-${item?.similarity ?? 0.18}-${item?.blend ?? 0.08}-${item?.fullFrame !== false ? "canvas" : "banner"}`
    .replace(/[^a-z0-9_-]+/gi, "-");
  const target = resolve(projectDir(), `.runtime/editor-banner-preview-${safeId}-${effectKey}.png`);
  if (existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) return target;
  await mkdir(dirname(target), { recursive: true });
  const image = /\.(png|jpe?g|webp)$/i.test(source);
  const input = image ? ["-loop", "1", "-i", source] : ["-ss", "0.5", "-i", source];
  const crop = item?.fullFrame !== false ? "crop=900:260:90:830," : "";
  const effects = item?.transparent !== false
    ? "format=rgba"
    : `format=rgba,chromakey=${(item?.chromaColor || "#00ff00").replace("#", "0x")}:${item?.similarity ?? 0.18}:${item?.blend ?? 0.08}`;
  await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y", ...input,
    "-vf", `${crop}scale=900:260:flags=lanczos,${effects}`,
    "-frames:v", "1", "-pix_fmt", "rgba", target,
  ], projectDir());
  return target;
}

export function registerCircleEditorRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/circle-editor", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const root = projectDir();
    const config = loadCircleConfig();
    return {
      layout: layoutFromConfig(config),
      template: { id: "telegram-circles", name: cleanTemplateName(config.templateName) || "Telegram-кружочки" },
      templates: listCircleTemplates(),
      activeTemplateId: activeCircleTemplateId(),
      ...circleAdvertiserState(),
      sources: listVideos(resolve(root, "downloads")),
      gameplays: listVideos(resolve(root, "gameplay")),
      rendering,
    };
  });

  app.put("/api/circle-editor/layout", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const body = req.body as {
      layout?: unknown;
      name?: unknown;
      activeAdvertiserId?: unknown;
      bannerEnabled?: unknown;
      templateId?: unknown;
      createNew?: boolean;
    } | undefined;
    const name = cleanTemplateName(body?.name) || "Telegram-кружочки";
    const layout = sanitizeLayout(body?.layout);
    const template = await saveCircleTemplate({
      id: body?.templateId,
      createNew: body?.createNew,
      name,
      layout,
      advertiserId: body?.activeAdvertiserId,
      bannerEnabled: body?.bannerEnabled,
    });
    return {
      layout,
      saved: true,
      template,
      templates: listCircleTemplates(),
      activeTemplateId: template.id,
    };
  });

  app.put("/api/circle-editor/templates/active", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const template = await activateCircleTemplate((req.body as { id?: unknown } | undefined)?.id);
    return {
      template,
      layout: template.layout,
      templates: listCircleTemplates(),
      activeTemplateId: template.id,
      ...circleAdvertiserState(),
    };
  });

  app.delete("/api/circle-editor/templates/:id", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const template = await deleteCircleTemplate((req.params as { id?: unknown }).id);
    return {
      template,
      layout: template.layout,
      templates: listCircleTemplates(),
      activeTemplateId: template.id,
      ...circleAdvertiserState(),
    };
  });

  app.post("/api/circle-editor/advertisers", { bodyLimit: 112_000_000 }, async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const advertiser = await upsertCircleAdvertiser(body);
    if (body.activate !== false) await setActiveCircleTemplateAdvertiser(advertiser.id, true);
    return { advertiser, ...circleAdvertiserState() };
  });

  app.get("/api/circle-editor/advertisers", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    return circleAdvertiserState();
  });

  app.put("/api/circle-editor/advertisers/active", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const body = (req.body || {}) as { id?: unknown; enabled?: unknown };
    await setActiveCircleTemplateAdvertiser(body.id, body.enabled);
    return circleAdvertiserState();
  });

  app.delete("/api/circle-editor/advertisers/:id", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const id = (req.params as { id?: unknown }).id;
    await deleteCircleAdvertiser(id);
    await replaceCircleTemplateAdvertiser(id);
    return circleAdvertiserState();
  });

  app.get("/api/circle-editor/media/:kind/:file", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const { kind, file } = req.params as { kind: string; file: string };
    const path = mediaPath(kind, file);
    if (!path) return reply.code(404).send({ error: "Файл не найден" });
    return streamMedia(req, reply, path);
  });

  app.get("/api/circle-editor/banner-preview.png", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const file = await bannerPreview((req.query as { id?: unknown } | undefined)?.id);
    return reply.type("image/png").send(createReadStream(file));
  });

  app.post("/api/circle-editor/render", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    if (rendering) return reply.code(409).send({ error: "Другой ролик уже генерируется" });
    const body = (req.body || {}) as { source?: string; gameplay?: string; layout?: unknown };
    const requestedSource = String(body.source || "");
    const source = requestedSource === "__random__" || requestedSource === "__telegram__" ? requestedSource : basename(requestedSource);
    const gameplay = basename(String(body.gameplay || ""));
    if (source !== "__random__" && source !== "__telegram__" && !mediaPath("source", source)) return reply.code(400).send({ error: "Выберите Telegram-кружок" });
    if (!mediaPath("gameplay", gameplay)) return reply.code(400).send({ error: "Выберите gameplay" });
    await saveLayout(body.layout);
    rendering = true;
    try {
      const args = source === "__telegram__"
        ? [resolve(projectDir(), "node_modules/tsx/dist/cli.mjs"), "src/render-telegram-cli.ts", "--gameplay", gameplay]
        : [resolve(projectDir(), "node_modules/tsx/dist/cli.mjs"), "src/render-cli.ts", "--source", source, "--gameplay", gameplay, "--message-id", String(Date.now() % 2_000_000_000)];
      const stdout = await run(process.execPath, args, projectDir());
      const line = stdout.split(/\r?\n/).reverse().find((value) => value.trim().startsWith("{"));
      const result = line ? JSON.parse(line) as { file?: string; source?: string; sourceFile?: string; gameplayFile?: string } : {};
      const file = basename(result.file || `${source.replace(/\.[^.]+$/, "")}-short.mp4`);
      if (!mediaPath("output", file)) throw new Error("Рендер завершён, но итоговый файл не найден");
      return {
        file,
        sourceFile: result.sourceFile || result.source || source,
        gameplayFile: result.gameplayFile || gameplay,
        url: `/api/circle-editor/media/output/${encodeURIComponent(file)}`,
      };
    } finally {
      rendering = false;
    }
  });
}

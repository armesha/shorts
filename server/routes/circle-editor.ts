import { spawn } from "node:child_process";
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import ffmpegPath from "ffmpeg-static";
import type { Db } from "../db.ts";

type Layout = {
  circle: { x: number; y: number; size: number };
  puzzle: { x: number; y: number; width: number; labelSize: number; puzzleSize: number; gap: number };
  banner: { x: number; y: number; width: number; height: number };
};

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

async function saveLayout(layoutValue: unknown): Promise<Layout> {
  const layout = sanitizeLayout(layoutValue);
  const file = resolve(projectDir(), "config.json");
  const config = loadCircleConfig();
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

async function bannerPreview(): Promise<string> {
  const source = resolve(projectDir(), "banner/output/yuki-shorts-alpha.mov");
  const target = resolve(projectDir(), ".runtime/editor-banner-preview.png");
  if (existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs) return target;
  await mkdir(dirname(target), { recursive: true });
  await run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "2", "-i", source, "-vf", "crop=900:260:90:830", "-frames:v", "1", target], projectDir());
  return target;
}

export function registerCircleEditorRoutes(app: FastifyInstance, db: Db): void {
  app.get("/api/circle-editor", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    const root = projectDir();
    const config = loadCircleConfig();
    return {
      layout: layoutFromConfig(config),
      sources: listVideos(resolve(root, "downloads")),
      gameplays: listVideos(resolve(root, "gameplay")),
      rendering,
    };
  });

  app.put("/api/circle-editor/layout", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    return { layout: await saveLayout((req.body as { layout?: unknown } | undefined)?.layout), saved: true };
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
    const file = await bannerPreview();
    return reply.type("image/png").send(createReadStream(file));
  });

  app.post("/api/circle-editor/render", async (req, reply) => {
    if (!requireAdmin(req, reply, db)) return;
    if (rendering) return reply.code(409).send({ error: "Другой ролик уже генерируется" });
    const body = (req.body || {}) as { source?: string; gameplay?: string; layout?: unknown };
    const source = basename(String(body.source || ""));
    const gameplay = basename(String(body.gameplay || ""));
    if (!mediaPath("source", source)) return reply.code(400).send({ error: "Выберите Telegram-кружок" });
    if (!mediaPath("gameplay", gameplay)) return reply.code(400).send({ error: "Выберите gameplay" });
    await saveLayout(body.layout);
    rendering = true;
    try {
      const stdout = await run(
        process.execPath,
        [resolve(projectDir(), "node_modules/tsx/dist/cli.mjs"), "src/render-cli.ts", "--source", source, "--gameplay", gameplay, "--message-id", String(Date.now() % 2_000_000_000)],
        projectDir(),
      );
      const line = stdout.split(/\r?\n/).reverse().find((value) => value.trim().startsWith("{"));
      const result = line ? JSON.parse(line) as { file?: string } : {};
      const file = basename(result.file || `${source.replace(/\.[^.]+$/, "")}-short.mp4`);
      if (!mediaPath("output", file)) throw new Error("Рендер завершён, но итоговый файл не найден");
      return { file, url: `/api/circle-editor/media/output/${encodeURIComponent(file)}` };
    } finally {
      rendering = false;
    }
  });
}

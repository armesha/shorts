import type { FastifyInstance } from "fastify";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { isSuperAdminUser } from "../auth.ts";
import type { Db } from "../db.ts";
import { loadBaseConfig } from "../config.ts";
import {
  addCreatorCards,
  canEdit,
  createPack,
  deriveRules,
  getPack,
  listCreatorPacks,
  type PackTemplate,
  type StoredCard,
} from "../../src/packs/store.ts";
import {
  TemplateValidationError,
  renderTemplateCard,
  validateDataImageUrl,
  validateTemplateList,
  type TemplateDoc,
} from "../../src/template/render.ts";
import { assembleStillVideo, resolveAudio, type MotionOverlay } from "../../src/video.ts";
import { cardReadable } from "../infra/media.ts";
import {
  RATE_LIMIT_MESSAGE,
  RateLimitError,
  checkRateLimit,
  heavyActiveKey,
  withActiveLimit,
  withGlobalRenderSlot,
} from "../infra/rate-limits.ts";
import { rememberOutputOwner } from "../infra/output-access.ts";
import { edgeTtsVoiceover } from "../services/quote-voiceover.ts";
import {
  COMMERCIAL_CREATOR_FEATURE,
  creatorBackgrounds,
  creatorMotionOverlays,
  creatorMusicTracks,
  creatorPresetById,
  creatorPresets,
} from "../services/creator-assets.ts";
import { writeZipFile } from "../services/zip.ts";

const OUTPUT_DIR = loadBaseConfig().outputDir;
const CREATOR_LIMIT = { limit: 12, windowMs: 10 * 60 * 1000 };
const CREATOR_UPLOAD_BYTES = 3 * 1024 * 1024;
const CREATOR_TEMPLATE_W = 1080;
const CREATOR_TEMPLATE_H = 1920;
const uid = (req: unknown): number => (req as { userId?: number }).userId as number;

function sendRateLimit(
  reply: { header: (k: string, v: string) => unknown; code: (n: number) => { send: (b: unknown) => unknown } },
  hit?: { retryAfterMs?: number },
): unknown {
  const retryAfter = Math.max(1, Math.ceil((hit?.retryAfterMs ?? 1_000) / 1000));
  reply.header("Retry-After", String(retryAfter));
  return reply.code(429).send({ error: RATE_LIMIT_MESSAGE });
}

function templateError(e: unknown): string | null {
  if (e instanceof TemplateValidationError) return e.message;
  if ((e as { statusCode?: number })?.statusCode === 400) return String((e as Error)?.message ?? e);
  return null;
}

function cleanType(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "custom";
}

function outputAbs(rel: string): string {
  return resolve(process.cwd(), OUTPUT_DIR, rel);
}

function stamp(prefix: string, ext: string): string {
  return `creator/${prefix}/${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
}

function audioError(e: unknown): string {
  return e instanceof Error ? e.message : "Музыка недоступна";
}

function fullPackPayload(pack: NonNullable<ReturnType<typeof getPack>>) {
  return {
    ...pack,
    rules: pack.templates[0] ? deriveRules(pack.templates[0]) : [],
    templateType: pack.templateType ?? "custom",
  };
}

function enforceCreatorTemplateAssets(templates: PackTemplate[]): void {
  const userAssetPrefix = `data:image/`;
  for (const [ti, template] of templates.entries()) {
    for (const [ei, el] of (template.elements ?? []).entries()) {
      if (el.type !== "image" || typeof el.src !== "string") continue;
      const src = el.src.trim();
      if (src.startsWith(userAssetPrefix)) continue;
      if (src.startsWith("assets/template-packs/") || src.startsWith("web/public/template-editor/")) continue;
      throw new TemplateValidationError(`templates[${ti}].elements[${ei}].src: creator поддерживает только сервисные assets/template-packs или data:image`);
    }
  }
}

function validCreatorBackground(src: string): string {
  const value = src.trim();
  if (!value) return "";
  if (/^data:image\//i.test(value)) {
    validateDataImageUrl(value, "background");
    return value;
  }
  if (
    value.startsWith("assets/template-packs/") &&
    !value.includes("\\") &&
    !value.split("/").some((part) => !part || part === "." || part === "..") &&
    /\.(png|jpe?g|webp|svg)$/i.test(value)
  ) {
    return value;
  }
  throw new TemplateValidationError("background: разрешены только сервисные assets/template-packs или загруженный data:image");
}

type CreatorTextRole = "heading" | "body";
type CreatorTextBox = { x: number; y: number; w: number; h: number };

function cleanCreatorTextBox(raw: unknown, role: CreatorTextRole): CreatorTextBox | null {
  if (!raw || typeof raw !== "object") return null;
  const src = raw as Record<string, unknown>;
  const minW = role === "heading" ? 280 : 320;
  const minH = role === "heading" ? 92 : 160;
  const x = Number(src.x);
  const y = Number(src.y);
  const w = Number(src.w);
  const h = Number(src.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const safeW = Math.min(CREATOR_TEMPLATE_W, Math.max(minW, Math.round(w)));
  const safeH = Math.min(CREATOR_TEMPLATE_H, Math.max(minH, Math.round(h)));
  return {
    x: Math.min(CREATOR_TEMPLATE_W - safeW, Math.max(0, Math.round(x))),
    y: Math.min(CREATOR_TEMPLATE_H - safeH, Math.max(0, Math.round(y))),
    w: safeW,
    h: safeH,
  };
}

function applyTextLayout(templates: PackTemplate[], layout: unknown): PackTemplate[] {
  if (!layout || typeof layout !== "object") return templates;
  const src = layout as Record<string, unknown>;
  const boxes = {
    heading: cleanCreatorTextBox(src.heading, "heading"),
    body: cleanCreatorTextBox(src.body, "body"),
  };
  if (!boxes.heading && !boxes.body) return templates;
  return templates.map((template) => {
    const copy = JSON.parse(JSON.stringify(template)) as PackTemplate;
    for (const el of copy.elements ?? []) {
      if (el.type !== "killbox") continue;
      const role = String(el.role ?? el.id ?? "");
      const box =
        role === "title" || role === "heading" || role === "hook"
          ? boxes.heading
          : role === "body" || role === "text" || role === "fact" || role === "points" || role === "items"
            ? boxes.body
            : null;
      if (!box) continue;
      el.x = box.x;
      el.y = box.y;
      el.w = box.w;
      el.h = box.h;
      if (box.w < 520) el.align = "center";
      if (box.h < 220) el.valign = "center";
    }
    return copy;
  });
}

function cleanTemplatePackAsset(raw: string): { abs: string; rel: string } | null {
  let rel = raw.replace(/^\/+/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (!rel.startsWith("template-packs/") || rel.includes("\\") || isAbsolute(rel)) return null;
  if (rel.split("/").some((part) => !part || part === "." || part === "..")) return null;
  if (!/\.(png|jpe?g|webp|svg)$/i.test(rel)) return null;
  const root = resolve(process.cwd(), "assets");
  const abs = resolve(root, rel);
  const back = relative(root, abs);
  if (!back || back.startsWith("..") || isAbsolute(back)) return null;
  return { abs, rel };
}

function imageContentType(rel: string): string {
  const ext = extname(rel).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml; charset=utf-8";
  return "application/octet-stream";
}

function applyBackground(templates: PackTemplate[], src?: string): PackTemplate[] {
  if (!src?.trim()) return templates;
  const background = validCreatorBackground(src);
  return templates.map((template) => {
    const copy = JSON.parse(JSON.stringify(template)) as PackTemplate;
    const image = copy.elements.find((el) => el.type === "image" && typeof el.src === "string");
    if (image) {
      image.src = background;
    } else {
      copy.elements.unshift({ id: "creator-background", type: "image", x: 0, y: 0, w: copy.canvas.w, h: copy.canvas.h, rot: 0, src: background, fit: "cover" });
    }
    return copy;
  });
}

async function runHeavyLimited<T>(
  reply: { header: (k: string, v: string) => unknown; code: (n: number) => { send: (b: unknown) => unknown } },
  userId: number,
  isAdmin: boolean,
  route: string,
  fn: () => Promise<T>,
): Promise<T | unknown> {
  try {
    return await withActiveLimit(heavyActiveKey(userId, isAdmin, route), isAdmin ? 2 : 1, () =>
      withGlobalRenderSlot(fn),
    );
  } catch (e) {
    if (e instanceof RateLimitError) return sendRateLimit(reply, e);
    throw e;
  }
}

function motionOverlay(id: string | undefined): MotionOverlay | null {
  if (!id || id === "none") return null;
  const file = basename(id);
  if (!/\.gif$/i.test(file)) return null;
  const dir = resolve(process.cwd(), "assets/motion/jokes");
  const abs = resolve(dir, file);
  const rel = relative(dir, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !existsSync(abs)) return null;
  return { path: abs, width: 166, x: "main_w-overlay_w-56", y: "main_h-overlay_h-58" };
}

function readableFor(pack: NonNullable<ReturnType<typeof getPack>>, card: StoredCard) {
  const readable = cardReadable(card.values, deriveRules(pack.templates[0]));
  return {
    title: readable.title,
    text: readable.text,
    narration: (card.narration || readable.text || readable.title).replace(/\s+/g, " ").trim(),
  };
}

async function renderCreatorImage(pack: NonNullable<ReturnType<typeof getPack>>, index: number): Promise<{ imgRel: string; imgAbs: string }> {
  const card = pack.cards[index];
  if (!card) throw new Error("Нет такой карточки");
  if (!pack.templates.length) throw new Error("У пака нет шаблона");
  const tpl = pack.templates[index % pack.templates.length] as TemplateDoc;
  const imgRel = stamp("preview", "png");
  const imgAbs = outputAbs(imgRel);
  await renderTemplateCard(tpl, card.values, imgAbs);
  return { imgRel, imgAbs };
}

function fileUrl(rel: string): string {
  return `/files/${rel}`;
}

function parseDataImage(dataUrl: string): { ext: string; bytes: Buffer } {
  validateDataImageUrl(dataUrl, "background");
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!m) throw new TemplateValidationError("background: некорректный data:image");
  const mime = m[1].toLowerCase();
  const ext = mime === "jpeg" ? "jpg" : mime;
  const bytes = Buffer.from(m[2].replace(/\s/g, ""), "base64");
  return { ext, bytes };
}

async function listUserBackgrounds(userId: number) {
  const dir = resolve(process.cwd(), "data/creator-assets", String(userId), "backgrounds");
  if (!existsSync(dir)) return [];
  const out: Array<{ id: string; name: string; type: "background"; dataUrl: string }> = [];
  for (const file of readdirSync(dir).sort().slice(-40)) {
    if (!/\.(png|jpe?g|webp)$/i.test(file)) continue;
    const abs = resolve(dir, file);
    if (!statSync(abs).isFile()) continue;
    const bytes = await readFile(abs);
    const ext = extname(file).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    out.push({
      id: file,
      name: file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      type: "background",
      dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
    });
  }
  return out.reverse();
}

export function registerCreatorRoutes(app: FastifyInstance, db: Db) {
  const adminReq = (req: unknown): boolean => db.getUserById(uid(req))?.role === "admin";
  const hasAccess = (req: unknown): boolean => {
    const user = db.getUserById(uid(req));
    return !!user && (user.role === "admin" || db.hasFeature(user.id, COMMERCIAL_CREATOR_FEATURE));
  };
  const requireCreator = (req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown } }): boolean => {
    if (hasAccess(req)) return true;
    reply.code(403).send({ error: "Creator доступ не включён для этого пользователя" });
    return false;
  };

  app.get("/api/creator/summary", async (req) => {
    const userId = uid(req);
    const feature = hasAccess(req);
    if (!feature) {
      return { feature: false, packs: [], gallery: [], backgrounds: [], userBackgrounds: [], presets: [], music: [], motion: [] };
    }
    return {
      feature: true,
      packs: listCreatorPacks(userId, isSuperAdminUser(db.getUserById(userId))),
      gallery: db.listCreatorGalleryItems(userId),
      backgrounds: creatorBackgrounds(),
      userBackgrounds: await listUserBackgrounds(userId),
      presets: creatorPresets().map((preset) => ({
        id: preset.id,
        name: preset.name,
        templateType: preset.templateType,
        lang: preset.lang,
        templates: preset.templates,
        previewSrc: preset.templates
          .flatMap((template) => template.elements ?? [])
          .find((el) => el.type === "image" && typeof el.src === "string")?.src,
        sample: preset.sample,
        rules: preset.templates[0] ? deriveRules(preset.templates[0]) : [],
      })),
      music: creatorMusicTracks(),
      motion: creatorMotionOverlays(),
    };
  });

  app.get("/api/creator/service-assets/*", async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const clean = cleanTemplatePackAsset(String((req.params as Record<string, string>)["*"] ?? ""));
    if (!clean) return reply.code(404).send({ error: "not found" });
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(clean.abs);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
    if (!st.isFile()) return reply.code(404).send({ error: "not found" });
    reply.header("Content-Type", imageContentType(clean.rel));
    reply.header("Cache-Control", "private, max-age=86400");
    reply.header("Content-Length", String(st.size));
    return reply.send(createReadStream(clean.abs));
  });

  app.get("/api/creator/packs/:id", async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const pack = getPack((req.params as { id: string }).id, uid(req), isSuperAdminUser(db.getUserById(uid(req))));
    if (!pack || !pack.creator) return reply.code(404).send({ error: "Пак не найден" });
    return fullPackPayload(pack);
  });

  app.post("/api/creator/packs", { bodyLimit: CREATOR_UPLOAD_BYTES }, async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const body =
      (req.body as { name?: string; lang?: string; templateType?: string; presetId?: string; templates?: PackTemplate[]; background?: string; layout?: unknown }) ?? {};
    if (!body.name?.trim()) return reply.code(400).send({ error: "Нужно имя пака" });
    let templates = Array.isArray(body.templates) ? body.templates : [];
    let lang = body.lang || "ru";
    let templateType = cleanType(body.templateType);
    if (!templates.length && body.presetId) {
      const preset = creatorPresetById(body.presetId);
      if (!preset) return reply.code(404).send({ error: "Шаблон не найден" });
      templates = preset.templates;
      lang = body.lang || preset.lang;
      templateType = cleanType(body.templateType || preset.templateType);
    }
    if (!templates.length) return reply.code(400).send({ error: "Нужен шаблон или presetId" });
    try {
      templates = applyBackground(templates, body.background);
      templates = applyTextLayout(templates, body.layout);
      enforceCreatorTemplateAssets(templates);
      validateTemplateList(templates);
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      throw e;
    }
    const pack = createPack(uid(req), { name: body.name, lang, templates, templateType, creator: true });
    return { pack: fullPackPayload(pack) };
  });

  app.post("/api/creator/packs/:id/cards", async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const id = (req.params as { id: string }).id;
    const body = (req.body as { cards?: unknown }) ?? {};
    const r = addCreatorCards(id, uid(req), isSuperAdminUser(db.getUserById(uid(req))), body.cards ?? []);
    if (!r.ok) {
      if (r.reason === "not_found") return reply.code(404).send({ error: "Пак не найден или нет прав на редактирование" });
      if (r.reason === "no_template") return reply.code(400).send({ error: "У пака нет шаблона" });
      return reply.code(400).send({ error: "Карточки не прошли правила шаблона", errors: r.result?.errors ?? [], parsed: r.result?.parsed ?? 0 });
    }
    return { added: r.added, total: r.total, pack: fullPackPayload(r.pack) };
  });

  app.post("/api/creator/assets/backgrounds", { bodyLimit: CREATOR_UPLOAD_BYTES }, async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const body = (req.body as { name?: string; dataUrl?: string }) ?? {};
    if (!body.dataUrl) return reply.code(400).send({ error: "Нужен dataUrl" });
    let parsed: { ext: string; bytes: Buffer };
    try {
      parsed = parseDataImage(body.dataUrl);
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      throw e;
    }
    const safeName =
      String(body.name || "background")
        .toLowerCase()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-z0-9а-яё_-]+/giu, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 42) || "background";
    const dir = resolve(process.cwd(), "data/creator-assets", String(uid(req)), "backgrounds");
    await mkdir(dir, { recursive: true });
    const file = `${Date.now()}-${safeName}.${parsed.ext}`;
    await writeFile(resolve(dir, file), parsed.bytes);
    return { asset: { id: file, name: safeName, type: "background", dataUrl: body.dataUrl } };
  });

  async function preview(req: unknown, reply: { code: (n: number) => { send: (b: unknown) => unknown }; header: (k: string, v: string) => unknown }) {
    if (!requireCreator(req, reply)) return;
    const userId = uid(req);
    const isAdmin = adminReq(req);
    if (!isAdmin) {
      const hit = checkRateLimit(`user:${userId}:creator-preview`, CREATOR_LIMIT);
      if (!hit.ok) return sendRateLimit(reply, hit);
    }
    const pack = getPack((req as { params: { id: string } }).params.id, userId, isSuperAdminUser(db.getUserById(userId)));
    if (!pack || !pack.creator) return reply.code(404).send({ error: "Пак не найден" });
    const index = Math.max(0, Math.floor(Number(((req as { body?: { index?: number } }).body?.index ?? 0))));
    try {
      const rendered = await runHeavyLimited(reply, userId, isAdmin, "creator-preview", () => renderCreatorImage(pack, index));
      if (!rendered || typeof rendered !== "object" || !("imgRel" in rendered)) return;
      const { imgRel } = rendered as { imgRel: string };
      rememberOutputOwner([imgRel], userId);
      return { url: `${fileUrl(imgRel)}?v=${Date.now()}`, imageUrl: `${fileUrl(imgRel)}?v=${Date.now()}`, index };
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      return reply.code(500).send({ error: "Не удалось отрисовать: " + String(e).slice(0, 140) });
    }
  }
  app.post("/api/creator/packs/:id/preview", preview);

  app.post("/api/creator/packs/:id/export", async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const userId = uid(req);
    const isAdmin = adminReq(req);
    if (!isAdmin) {
      const hit = checkRateLimit(`user:${userId}:creator-export`, CREATOR_LIMIT);
      if (!hit.ok) return sendRateLimit(reply, hit);
    }
    const id = (req.params as { id: string }).id;
    const body =
      (req.body as {
        index?: number;
        format?: "png" | "mp4";
        durationSec?: number;
        voiceover?: boolean;
        addToGallery?: boolean;
        music?: string;
        motion?: string;
      }) ?? {};
    const pack = getPack(id, userId, isSuperAdminUser(db.getUserById(userId)));
    if (!pack || !pack.creator) return reply.code(404).send({ error: "Пак не найден" });
    if (!canEdit(pack, userId, isSuperAdminUser(db.getUserById(userId)))) return reply.code(403).send({ error: "Нет прав на экспорт" });
    if (!canEdit(pack, userId, isSuperAdminUser(db.getUserById(userId)))) return reply.code(403).send({ error: "Нет прав на экспорт" });
    const index = Math.max(0, Math.floor(Number(body.index ?? 0)));
    const card = pack.cards[index];
    if (!card) return reply.code(404).send({ error: "Нет такой карточки" });
    const format = body.format === "png" ? "png" : "mp4";
    try {
      const built = await runHeavyLimited(reply, userId, isAdmin, "creator-export", async () => {
        const { imgRel, imgAbs } = await renderCreatorImage(pack, index);
        if (format === "png") return { imgRel, vidRel: null, music: "none", durationSec: null, narration: null };
        const readable = readableFor(pack, card);
        let audioPath: string | null = null;
        let music = "none";
        let durationSec = Math.max(3, Math.min(60, Number(body.durationSec) || 6));
        let narration: string | null = null;
        if (body.voiceover) {
          narration = readable.narration;
          const voice = await edgeTtsVoiceover({ text: narration, lang: pack.lang, namespace: `creator-${pack.id}` });
          audioPath = voice.audioPath;
          music = voice.music;
          durationSec = Math.max(durationSec, voice.durationSec);
        } else {
          const resolved = resolveAudio(body.music, { audioProfile: cleanType(pack.templateType) === "jokes" ? "jokes" : cleanType(pack.templateType) === "motivation" ? "motivation" : undefined }, { packId: pack.id });
          audioPath = resolved.audioPath;
          music = resolved.music;
        }
        const vidRel = stamp("exports", "mp4");
        await assembleStillVideo(imgAbs, outputAbs(vidRel), {
          durationSec,
          audioPath,
          motionOverlay: motionOverlay(body.motion),
          audioVolume: body.voiceover ? 1 : 0.45,
        });
        return { imgRel, vidRel, music, durationSec, narration };
      });
      if (!built || typeof built !== "object" || !("imgRel" in built)) return;
      const out = built as { imgRel: string; vidRel: string | null; music: string; durationSec: number | null; narration: string | null };
      rememberOutputOwner([out.imgRel, out.vidRel].filter((x): x is string => !!x), userId);
      let item = null;
      if (body.addToGallery !== false) {
        const readable = readableFor(pack, card);
        item = db.createCreatorGalleryItem({
          userId,
          packId: pack.id,
          packName: pack.name,
          templateType: cleanType(pack.templateType),
          cardIndex: index,
          title: readable.title,
          text: readable.text,
          narration: out.narration,
          format,
          imageRel: out.imgRel,
          videoRel: out.vidRel,
          music: out.music,
          durationSec: out.durationSec,
        });
      }
      const rel = format === "png" ? out.imgRel : out.vidRel!;
      return { item, url: fileUrl(rel), imageUrl: fileUrl(out.imgRel), videoUrl: out.vidRel ? fileUrl(out.vidRel) : undefined };
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      if (String((e as Error)?.message ?? e).includes("Audio")) return reply.code(400).send({ error: audioError(e) });
      return reply.code(500).send({ error: "Экспорт не удался: " + String(e).slice(0, 160) });
    }
  });

  app.post("/api/creator/packs/:id/export-zip", async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const userId = uid(req);
    const isAdmin = adminReq(req);
    if (!isAdmin) {
      const hit = checkRateLimit(`user:${userId}:creator-zip`, { limit: 2, windowMs: 10 * 60 * 1000 });
      if (!hit.ok) return sendRateLimit(reply, hit);
    }
    const id = (req.params as { id: string }).id;
    const body = (req.body as { limit?: number; durationSec?: number; voiceover?: boolean; format?: "png" | "mp4"; music?: string; motion?: string }) ?? {};
    const pack = getPack(id, userId, isSuperAdminUser(db.getUserById(userId)));
    if (!pack || !pack.creator) return reply.code(404).send({ error: "Пак не найден" });
    const limit = Math.max(1, Math.min(50, Math.floor(Number(body.limit) || Math.min(pack.cards.length, 12))));
    const format = body.format === "png" ? "png" : "mp4";
    try {
      const built = await runHeavyLimited(reply, userId, isAdmin, "creator-zip", async () => {
        const entries: Array<{ name: string; path?: string; data?: string | Buffer }> = [];
        const manifest: Array<Record<string, unknown>> = [];
        for (let index = 0; index < Math.min(limit, pack.cards.length); index += 1) {
          const card = pack.cards[index];
          const readable = readableFor(pack, card);
          const { imgRel, imgAbs } = await renderCreatorImage(pack, index);
          if (format === "png") {
            entries.push({ name: `card-${String(index + 1).padStart(3, "0")}.png`, path: imgAbs });
            manifest.push({ index, title: readable.title, text: readable.text, image: imgRel });
            continue;
          }
          let audioPath: string | null = null;
          let music = "none";
          let durationSec = Math.max(3, Math.min(60, Number(body.durationSec) || 6));
          if (body.voiceover) {
            const voice = await edgeTtsVoiceover({ text: readable.narration, lang: pack.lang, namespace: `creator-${pack.id}` });
            audioPath = voice.audioPath;
            music = voice.music;
            durationSec = Math.max(durationSec, voice.durationSec);
          } else {
            const resolved = resolveAudio(body.music, { audioProfile: cleanType(pack.templateType) === "jokes" ? "jokes" : undefined }, { packId: pack.id });
            audioPath = resolved.audioPath;
            music = resolved.music;
          }
          const vidRel = stamp("exports", "mp4");
          await assembleStillVideo(imgAbs, outputAbs(vidRel), {
            durationSec,
            audioPath,
            motionOverlay: motionOverlay(body.motion),
            audioVolume: body.voiceover ? 1 : 0.45,
          });
          entries.push({ name: `card-${String(index + 1).padStart(3, "0")}.mp4`, path: outputAbs(vidRel) });
          manifest.push({ index, title: readable.title, text: readable.text, image: imgRel, video: vidRel, music, durationSec });
          rememberOutputOwner([imgRel, vidRel], userId);
        }
        entries.push({ name: "manifest.json", data: JSON.stringify({ packId: pack.id, packName: pack.name, templateType: pack.templateType ?? "custom", format, items: manifest }, null, 2) });
        const zipRel = stamp("zips", "zip");
        await writeZipFile(outputAbs(zipRel), entries);
        return { zipRel, count: manifest.length };
      });
      if (!built || typeof built !== "object" || !("zipRel" in built)) return;
      const out = built as { zipRel: string; count: number };
      rememberOutputOwner([out.zipRel], userId);
      const item = db.createCreatorGalleryItem({
        userId,
        packId: pack.id,
        packName: pack.name,
        templateType: cleanType(pack.templateType),
        cardIndex: 0,
        title: `${pack.name} ZIP`,
        text: `${out.count} files`,
        format: "zip",
        zipRel: out.zipRel,
        music: body.voiceover ? "edge-tts" : body.music || "mixed",
      });
      return { item, url: fileUrl(out.zipRel), count: out.count };
    } catch (e) {
      const msg = templateError(e);
      if (msg) return reply.code(400).send({ error: msg });
      if (String((e as Error)?.message ?? e).includes("Audio")) return reply.code(400).send({ error: audioError(e) });
      return reply.code(500).send({ error: "ZIP не собран: " + String(e).slice(0, 160) });
    }
  });

  app.post("/api/creator/tts/preview", async (req, reply) => {
    if (!requireCreator(req, reply)) return;
    const body = (req.body as { text?: string; lang?: string }) ?? {};
    const text = String(body.text || "").trim();
    if (!text) return reply.code(400).send({ error: "Нужен текст для озвучки" });
    try {
      const voice = await edgeTtsVoiceover({ text, lang: body.lang || "ru", namespace: `creator-preview-${uid(req)}` });
      const rel = stamp("tts", "mp3");
      await mkdir(dirname(outputAbs(rel)), { recursive: true });
      await copyFile(voice.audioPath, outputAbs(rel));
      rememberOutputOwner([rel], uid(req));
      return { url: fileUrl(rel), durationSec: voice.durationSec, voice: voice.voice };
    } catch (e) {
      return reply.code(400).send({ error: String((e as Error)?.message ?? e).slice(0, 160) });
    }
  });
}

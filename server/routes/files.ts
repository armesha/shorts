// Output-file streamer: GET /files/* behind an authz gate (output files are user data — never expose
// data/output directly). The path/range/content-type helpers live here (they are only used by this
// route). Handlers + helpers moved VERBATIM from index.ts.
import type { FastifyInstance } from "fastify";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import type { Db } from "../db.ts";
import { isAdminLikeUser } from "../auth.ts";
import { getPack } from "../../src/packs/store.ts";
import { getCookie, SESSION_COOKIE } from "../infra/auth-session.ts";
import { rememberedOutputOwner } from "../infra/output-access.ts";
import type { RouteDeps } from "./deps.ts";

export function registerFilesRoutes(app: FastifyInstance, db: Db, deps: RouteDeps) {
  const { validSessionUser } = deps.auth;
  const OUTPUT_ROOT = resolve(process.cwd(), deps.outputDir);

  // clip-demos gallery: map a clip file id -> its pack (deck) id, so non-admins can stream only the
  // clips whose pack they may access. Built from admin-demos/manifest.json, refreshed on mtime change.
  const ADMIN_MANIFEST = resolve(OUTPUT_ROOT, "admin-demos/manifest.json");
  let cdMap = new Map<string, string>();
  let cdMtime = -1;
  function clipDemoPackOf(itemId: string): string | null {
    try {
      const m = statSync(ADMIN_MANIFEST).mtimeMs;
      if (m !== cdMtime) {
        cdMtime = m;
        const next = new Map<string, string>();
        const packs = JSON.parse(readFileSync(ADMIN_MANIFEST, "utf8")).packs ?? [];
        for (const p of packs) for (const it of p.items ?? []) if (it?.id) next.set(String(it.id), String(p.id));
        cdMap = next;
      }
    } catch {
      return null;
    }
    return cdMap.get(itemId) ?? null;
  }

  function cleanOutputRel(raw: string): string | null {
    let rel = raw.replace(/^\/+/, "");
    try {
      rel = decodeURIComponent(rel);
    } catch {
      return null;
    }
    if (!rel || isAbsolute(rel) || rel.includes("\\")) return null;
    const parts = rel.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) return null;
    const abs = resolve(OUTPUT_ROOT, rel);
    const back = relative(OUTPUT_ROOT, abs);
    if (!back || back.startsWith("..") || isAbsolute(back)) return null;
    return rel;
  }

  function outputContentType(rel: string): string {
    const ext = extname(rel).toLowerCase();
    if (ext === ".mp4") return "video/mp4";
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".webp") return "image/webp";
    if (ext === ".mp3") return "audio/mpeg";
    if (ext === ".zip") return "application/zip";
    if (ext === ".json") return "application/json; charset=utf-8";
    return "application/octet-stream";
  }

  function parseRangeHeader(raw: string, size: number): { start: number; end: number } | null {
    const m = /^bytes=(\d*)-(\d*)$/.exec(raw.trim());
    if (!m) return null;
    if (!m[1] && !m[2]) return null;
    if (!m[1]) {
      const suffix = Number(m[2]);
      if (!Number.isFinite(suffix) || suffix <= 0) return null;
      return { start: Math.max(0, size - suffix), end: size - 1 };
    }
    const start = Number(m[1]);
    const end = m[2] ? Number(m[2]) : size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
    return { start, end: Math.min(end, size - 1) };
  }

  function canReadOutputFile(rel: string, user: { id: number; role: string }): boolean {
    if (isAdminLikeUser(user)) return true;
    const rememberedOwner = rememberedOutputOwner(rel);
    if (rememberedOwner != null) return rememberedOwner === user.id;
    if (rel.startsWith("preview/")) return true;
    if (rel.startsWith("avatars/")) return true;
    if (rel.startsWith("admin-demos/")) {
      // Non-admins may read a clip's mp4/poster only if they can access its pack (deck); manifest.json
      // and any other admin-demos file stay admin-only.
      const m = /^admin-demos\/([^/]+)\.(?:mp4|jpe?g|png)$/i.exec(rel);
      if (!m) return false;
      const packId = clipDemoPackOf(m[1]);
      return !!packId && deps.deckAccess.deckAllowedForUser(user.id, packId);
    }
    const packPreview = /^packs\/(.+)-\d+\.png$/i.exec(rel);
    if (packPreview) return getPack(packPreview[1], user.id, false) !== null;
    if (rel.startsWith("library/")) return db.findOutputFileOwner(rel)?.userId === user.id;
    if (rel.startsWith("creator/")) return db.findCreatorOutputFileOwner(rel)?.userId === user.id;
    return false;
  }

  // Output files are user data. Serve them through an authz gate instead of exposing data/output.
  app.get("/files/*", async (req, reply) => {
    const user = validSessionUser(getCookie(req, SESSION_COOKIE));
    if (!user) return reply.code(401).send({ error: "Не авторизован" });
    const rel = cleanOutputRel(String((req.params as Record<string, string>)["*"] ?? ""));
    if (!rel || !canReadOutputFile(rel, user)) return reply.code(404).send({ error: "not found" });
    const abs = resolve(OUTPUT_ROOT, rel);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(abs);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }
    if (!st.isFile()) return reply.code(404).send({ error: "not found" });

    const contentType = outputContentType(rel);
    const etag = `W/"${st.size}-${Math.floor(st.mtimeMs)}"`;
    const lastModified = st.mtime.toUTCString();
    reply.header("Content-Type", contentType);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Cache-Control", "private, max-age=86400");
    reply.header("ETag", etag);
    reply.header("Last-Modified", lastModified);
    const rangeRaw = req.headers.range;
    if (!rangeRaw) {
      const ifNoneMatch = req.headers["if-none-match"];
      if (typeof ifNoneMatch === "string" && (ifNoneMatch === "*" || ifNoneMatch.split(",").map((v) => v.trim()).includes(etag))) {
        return reply.code(304).send();
      }
      const ifModifiedSince = req.headers["if-modified-since"];
      if (typeof ifModifiedSince === "string") {
        const since = Date.parse(ifModifiedSince);
        if (Number.isFinite(since) && Math.floor(st.mtimeMs / 1000) <= Math.floor(since / 1000)) {
          return reply.code(304).send();
        }
      }
    }
    const range = typeof rangeRaw === "string" ? parseRangeHeader(rangeRaw, st.size) : null;
    if (rangeRaw && !range) {
      reply.header("Content-Range", `bytes */${st.size}`);
      return reply.code(416).send();
    }
    if (range) {
      reply.header("Content-Range", `bytes ${range.start}-${range.end}/${st.size}`);
      reply.header("Content-Length", String(range.end - range.start + 1));
      return reply.code(206).send(createReadStream(abs, { start: range.start, end: range.end }));
    }
    reply.header("Content-Length", String(st.size));
    return reply.send(createReadStream(abs));
  });
}

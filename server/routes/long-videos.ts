import type { FastifyInstance } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { DECKS, deckLang } from "../../src/anecdotes/decks.ts";
import type { Db } from "../db.ts";
import type { RouteDeps } from "./deps.ts";

type LongVideoManifestItem = {
  file?: unknown;
  title?: unknown;
  text?: unknown;
  durationSec?: unknown;
  plannedDurationSec?: unknown;
  sceneCount?: unknown;
  music?: unknown;
  source?: unknown;
  builtAt?: unknown;
};

type LongVideoItem = {
  id: string;
  deckId: string;
  deckName: string;
  title: string;
  text: string;
  videoUrl: string;
  file: string;
  durationSec: number | null;
  plannedDurationSec: number | null;
  sceneCount: number | null;
  music: string | null;
  source: string | null;
  builtAt: string | null;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s || null;
};

const asNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return !!rel && !rel.startsWith("..") && !isAbsolute(rel);
}

function publicFactVideoUrl(file: string): string {
  return `/fact-videos/${file.split("/").map(encodeURIComponent).join("/")}`;
}

export function registerLongVideosRoutes(app: FastifyInstance, _db: Db, deps: RouteDeps) {
  const { deckAllowed } = deps.deckAccess;
  const factRoot = resolve(process.cwd(), "assets/fact-videos");

  app.get("/api/long-videos", async (req) => {
    const packs = [];

    for (const deck of DECKS) {
      if (!deck.longVideo || !deck.preFact || !deckAllowed(req, deck.id)) continue;

      const manifestPath = resolve(process.cwd(), deck.dir, "videos.json");
      if (!existsSync(manifestPath)) continue;

      let rawItems: LongVideoManifestItem[] = [];
      try {
        const parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
        rawItems = Array.isArray(parsed) ? parsed : [];
      } catch {
        rawItems = [];
      }

      const items: LongVideoItem[] = rawItems.flatMap((raw) => {
        const file = asString(raw.file);
        if (!file || file.startsWith("/") || file.includes("\0")) return [];

        const videoPath = resolve(factRoot, file);
        if (!isInside(factRoot, videoPath) || !existsSync(videoPath)) return [];

        const title = asString(raw.title) ?? deck.name;
        return [
          {
            id: `${deck.id}:${file}`,
            deckId: deck.id,
            deckName: deck.name,
            title,
            text: asString(raw.text) ?? "",
            videoUrl: publicFactVideoUrl(file),
            file,
            durationSec: asNumber(raw.durationSec),
            plannedDurationSec: asNumber(raw.plannedDurationSec),
            sceneCount: asNumber(raw.sceneCount),
            music: asString(raw.music),
            source: asString(raw.source),
            builtAt: asString(raw.builtAt),
          },
        ];
      });

      if (!items.length) continue;
      packs.push({
        id: deck.id,
        title: deck.name,
        lang: deckLang(deck.id) || null,
        count: items.length,
        items,
      });
    }

    return {
      packs,
      total: packs.reduce((sum, pack) => sum + pack.items.length, 0),
    };
  });
}

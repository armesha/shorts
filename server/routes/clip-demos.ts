// Clip-demos gallery API. The page is open to ALL logged-in users, but each user only sees the packs
// they may access: pack id === deck id, so visibility follows the same deck-access rules as channel
// sources (admin → all; others → granted preFact decks). The raw admin-demos manifest stays admin-only
// (served via /files) — this endpoint returns the already-filtered list so non-admins never see the
// titles of packs they can't access.
import type { FastifyInstance } from "fastify";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Db } from "../db.ts";
import type { RouteDeps } from "./deps.ts";

type ManifestPack = { id: string; title: string; lang?: string; items: unknown[] };

export function registerClipDemosRoutes(app: FastifyInstance, _db: Db, deps: RouteDeps) {
  const { deckAllowed } = deps.deckAccess;
  const MANIFEST = resolve(process.cwd(), deps.outputDir, "admin-demos/manifest.json");

  app.get("/api/clip-demos/packs", async (req) => {
    if (!existsSync(MANIFEST)) return { packs: [] };
    let packs: ManifestPack[] = [];
    try {
      packs = (JSON.parse(readFileSync(MANIFEST, "utf8")).packs as ManifestPack[]) ?? [];
    } catch {
      return { packs: [] };
    }
    const visible = packs.filter(
      (p) => Array.isArray(p.items) && p.items.length > 0 && deckAllowed(req, p.id),
    );
    return { packs: visible };
  });
}

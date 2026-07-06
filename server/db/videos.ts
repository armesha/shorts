// Library video data-access methods (the rendered-but-not-yet-posted queue + post-claim atomics).
// Method shorthand so createVideo→this.getVideo and nextUnpostedVideoForDecks→this.nextUnpostedVideo
// resolve on the merged store.
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { rowToVideo, type Row } from "./mappers.ts";
import type { Video } from "./types.ts";
import { invalidateReadCache } from "../services/read-cache.ts";

export type LibraryReservation =
  | { ok: true; token: string; reserved: number }
  | { ok: false; cap: number; current: number; reserved: number; queued: number; available: number };

export type VideoPageSort = "date" | "title" | "posts";
export type VideoDeckFilter = { includeDecks?: string[]; excludeDecks?: string[]; postCountGt?: number };

function normalizeDecks(ids: string[] | undefined): string[] {
  return [...new Set((ids ?? []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function deckFilterSql(filter: VideoDeckFilter | undefined, args: SQLInputValue[]): string {
  const includeDecks = normalizeDecks(filter?.includeDecks);
  const excludeDecks = normalizeDecks(filter?.excludeDecks);
  const parts: string[] = [];
  if (includeDecks.length) {
    parts.push(`deck IN (${includeDecks.map(() => "?").join(",")})`);
    args.push(...includeDecks);
  }
  if (excludeDecks.length) {
    parts.push(`deck NOT IN (${excludeDecks.map(() => "?").join(",")})`);
    args.push(...excludeDecks);
  }
  if (filter?.postCountGt != null) {
    parts.push("post_count > ?");
    args.push(filter.postCountGt);
  }
  return parts.length ? ` AND ${parts.join(" AND ")}` : "";
}

function videoOrder(sort: VideoPageSort | undefined): string {
  if (sort === "title") return "title COLLATE NOCASE ASC, id DESC";
  if (sort === "posts") return "post_count ASC, id DESC";
  return "id DESC";
}

function stableHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pickSeededVideo(rows: Row[], seed?: string): Row | undefined {
  if (!rows.length) return undefined;
  if (!seed) return rows[0];
  const oldestPostedAt = String(rows[0].last_posted_at ?? "");
  const cohort = rows.filter((row) => String(row.last_posted_at ?? "") === oldestPostedAt);
  let best = cohort[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const row of cohort) {
    const score = stableHash(`${seed}|${row.account_id}|${row.deck ?? ""}|${row.id}|${row.created_at ?? ""}`);
    if (score < bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

export function videoMethods(db: DatabaseSync) {
  return {
    createVideo(v: {
      accountId: number;
      title: string;
      text: string;
      bg: string;
      music: string;
      deck: string;
      videoRel: string;
      imageRel: string | null;
    }): Video {
      const info = db
        .prepare(
          "INSERT INTO videos (account_id,title,text,bg,music,deck,video_rel,image_rel) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(v.accountId, v.title, v.text, v.bg, v.music, v.deck, v.videoRel, v.imageRel);
      invalidateReadCache();
      return this.getVideo(Number(info.lastInsertRowid))!;
    },
    getVideo(id: number): Video | null {
      const r = db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as Row | undefined;
      return r ? rowToVideo(r) : null;
    },
    listVideos(accountId: number): Video[] {
      return (
        db.prepare("SELECT * FROM videos WHERE account_id = ? ORDER BY id DESC").all(accountId) as Row[]
      ).map(rowToVideo);
    },
    listVideosPage(input: {
      accountId: number;
      limit: number;
      offset: number;
      sort?: VideoPageSort;
      filter?: VideoDeckFilter;
    }): Video[] {
      const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit) || 1)));
      const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
      const args: SQLInputValue[] = [input.accountId];
      const filterSql = deckFilterSql(input.filter, args);
      const rows = db
        .prepare(
          `SELECT * FROM videos
            WHERE account_id = ?${filterSql}
            ORDER BY ${videoOrder(input.sort)}
            LIMIT ? OFFSET ?`,
        )
        .all(...args, limit, offset) as Row[];
      return rows.map(rowToVideo);
    },
    countVideosByAccount(accountId: number): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM videos WHERE account_id = ?").get(accountId) as Row;
      return Number(r.n) || 0;
    },
    countVideosByAccountFiltered(accountId: number, filter?: VideoDeckFilter): number {
      const args: SQLInputValue[] = [accountId];
      const filterSql = deckFilterSql(filter, args);
      const r = db.prepare(`SELECT COUNT(*) AS n FROM videos WHERE account_id = ?${filterSql}`).get(...args) as Row;
      return Number(r.n) || 0;
    },
    videoDeckCountsForAccount(accountId: number): Record<string, number> {
      const rows = db
        .prepare("SELECT deck, COUNT(*) AS n FROM videos WHERE account_id = ? GROUP BY deck")
        .all(accountId) as Row[];
      return Object.fromEntries(rows.map((row) => [String(row.deck ?? ""), Number(row.n) || 0]));
    },
    libraryReservationsForAccount(accountId: number): number {
      db.prepare("DELETE FROM library_reservations WHERE created_at < datetime('now','-6 hours')").run();
      const r = db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM library_reservations WHERE account_id = ?").get(accountId) as Row;
      return Number(r.n) || 0;
    },
    reserveLibrarySlots(
      accountId: number,
      cap: number,
      count = 1,
      opts: { excludeGenerationJobId?: string } = {},
    ): LibraryReservation {
      const requested = Math.max(1, Math.floor(Number(count) || 1));
      const token = randomUUID();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("DELETE FROM library_reservations WHERE created_at < datetime('now','-6 hours')").run();
        const currentRow = db.prepare("SELECT COUNT(*) AS n FROM videos WHERE account_id = ?").get(accountId) as Row;
        const reservedRow = db
          .prepare("SELECT COALESCE(SUM(count), 0) AS n FROM library_reservations WHERE account_id = ?")
          .get(accountId) as Row;
        const queuedRow = db
          .prepare(
            `SELECT COALESCE(SUM(MAX(total - done, 0)), 0) AS n
               FROM generation_jobs
              WHERE account_id = ?
                AND state IN ('queued','running')
                AND (? IS NULL OR id != ?)`,
          )
          .get(accountId, opts.excludeGenerationJobId ?? null, opts.excludeGenerationJobId ?? null) as Row;
        const current = Number(currentRow.n) || 0;
        const reserved = Number(reservedRow.n) || 0;
        const queued = Number(queuedRow.n) || 0;
        const available = Math.max(0, cap - current - reserved - queued);
        if (requested > available) {
          db.exec("ROLLBACK");
          return { ok: false, cap, current, reserved, queued, available };
        }
        db.prepare("INSERT INTO library_reservations (token, account_id, count) VALUES (?,?,?)").run(
          token,
          accountId,
          requested,
        );
        db.exec("COMMIT");
        return { ok: true, token, reserved: requested };
      } catch (e) {
        try {
          db.exec("ROLLBACK");
        } catch {
          /* already closed */
        }
        throw e;
      }
    },
    releaseLibraryReservation(token: string): void {
      db.prepare("DELETE FROM library_reservations WHERE token = ?").run(token);
    },
    videoCountsByAccount(accountIds?: number[]): { accountId: number; deck: string; count: number }[] {
      const ids = Array.isArray(accountIds)
        ? [...new Set(accountIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
        : [];
      if (Array.isArray(accountIds) && ids.length === 0) return [];
      const where = ids.length ? `WHERE account_id IN (${ids.map(() => "?").join(",")})` : "";
      const rows = db
        .prepare(
          `SELECT account_id, deck, COUNT(*) AS n
             FROM videos
             ${where}
            GROUP BY account_id, deck
            ORDER BY account_id, deck`,
        )
        .all(...ids) as Row[];
      return rows.map((row) => ({
        accountId: Number(row.account_id),
        deck: String(row.deck ?? ""),
        count: Number(row.n) || 0,
      }));
    },
    findOutputFileOwner(rel: string): { accountId: number; userId: number | null } | null {
      const r = db
        .prepare(
          `SELECT v.account_id, a.user_id
             FROM videos v JOIN accounts a ON a.id = v.account_id
            WHERE v.video_rel = ? OR v.image_rel = ?
           UNION ALL
           SELECT h.account_id, a.user_id
             FROM history h JOIN accounts a ON a.id = h.account_id
            WHERE h.video_path = ? OR h.image_path = ?
            LIMIT 1`,
        )
        .get(rel, rel, rel, rel) as Row | undefined;
      return r ? { accountId: r.account_id, userId: r.user_id ?? null } : null;
    },
    deleteVideo(id: number): void {
      db.prepare("DELETE FROM videos WHERE id = ?").run(id);
      invalidateReadCache();
    },
    updateVideoMeta(id: number, meta: { title: string; text: string; tags: string[] }): Video | null {
      db.prepare("UPDATE videos SET title = ?, text = ?, tags = ? WHERE id = ?").run(
        meta.title,
        meta.text,
        meta.tags.join(","),
        id,
      );
      invalidateReadCache();
      return this.getVideo(id);
    },
    // «Бесконечный пак» (infinite-packs): вместо удаления после успешной выкладки возвращаем ролик в
    // очередь (post_count→0), СОХРАНЯЯ файлы и last_posted_at (время этой выкладки). next-unposted
    // сортировка ставит уже выложенные в конец круга (NULL last_posted_at — впереди) → реальные ~50
    // роликов канала крутятся бесконечно, не исчерпываясь. Для обычных юзеров не вызывается.
    recycleVideoForRepost(id: number): void {
      db.prepare("UPDATE videos SET post_count = 0 WHERE id = ?").run(id);
    },
    // Total rendered videos waiting in the library across all channels (server-health "очередь").
    totalVideoCount(): number {
      const r = db.prepare("SELECT COUNT(*) AS n FROM videos").get() as Row;
      return Number(r.n) || 0;
    },
    incrementPost(id: number): void {
      db.prepare("UPDATE videos SET post_count = post_count + 1, last_posted_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        id,
      );
    },
    // Atomic post-claim: flip an UNPOSTED video (post_count 0) to in-flight in ONE statement and
    // report whether WE won (changes===1). Guarantees at-most-once upload across post-now (incl.
    // double-clicks) and the scheduler. On upload failure → releaseVideoPost so it can be retried.
    claimVideoForPost(id: number): boolean {
      const info = db
        .prepare(
          "UPDATE videos SET post_count = post_count + 1, last_posted_at = ? WHERE id = ? AND post_count = 0",
        )
        .run(new Date().toISOString(), id);
      return Number(info.changes) === 1;
    },
    releaseVideoPost(id: number): void {
      db.prepare(
        "UPDATE videos SET post_count = post_count - 1, last_posted_at = NULL WHERE id = ? AND post_count > 0",
      ).run(id);
    },
    leastPostedVideo(accountId: number): Video | null {
      const r = db
        .prepare("SELECT * FROM videos WHERE account_id = ? ORDER BY post_count ASC, id ASC LIMIT 1")
        .get(accountId) as Row | undefined;
      return r ? rowToVideo(r) : null;
    },
    // Next claimable video (post_count 0) for the post-once queue, optionally restricted to a deck.
    // last_posted_at still defines the age cohort (infinite-pack rotation stays oldest-first). Inside
    // that cohort the optional seed spreads otherwise-identical queues across channels/slots/days.
    nextUnpostedVideo(accountId: number, deck?: string, seed?: string): Video | null {
      const rows = (
        deck
          ? db
              .prepare(
                "SELECT * FROM videos WHERE account_id = ? AND post_count = 0 AND deck = ? ORDER BY last_posted_at ASC, id ASC",
              )
              .all(accountId, deck)
          : db
              .prepare(
                "SELECT * FROM videos WHERE account_id = ? AND post_count = 0 ORDER BY last_posted_at ASC, id ASC",
              )
              .all(accountId)
      ) as Row[];
      const r = pickSeededVideo(rows, seed);
      return r ? rowToVideo(r) : null;
    },
    // Next never-posted video from any allowed deck/source. The scheduler uses this for
    // multi-pack channels; it still only uploads videos already present in the library.
    nextUnpostedVideoForDecks(accountId: number, decks: string[], seed?: string): Video | null {
      const ids = [...new Set(decks.map((d) => String(d || "").trim()).filter(Boolean))];
      if (ids.length === 0) return this.nextUnpostedVideo(accountId, undefined, seed);
      if (ids.length === 1) return this.nextUnpostedVideo(accountId, ids[0], seed);
      const placeholders = ids.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT * FROM videos
           WHERE account_id = ? AND post_count = 0 AND deck IN (${placeholders})
           ORDER BY post_count ASC, last_posted_at ASC, id ASC
          `,
        )
        .all(accountId, ...ids) as Row[];
      const r = pickSeededVideo(rows, seed);
      return r ? rowToVideo(r) : null;
    },
    // Total library videos (queued, not yet posted) across a user's channels.
    countVideosByUser(userId: number): number {
      const r = db
        .prepare("SELECT COUNT(*) AS n FROM videos v JOIN accounts a ON a.id = v.account_id WHERE a.user_id = ?")
        .get(userId) as { n: number };
      return r.n;
    },
  };
}

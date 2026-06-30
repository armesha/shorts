// Library video data-access methods (the rendered-but-not-yet-posted queue + post-claim atomics).
// Method shorthand so createVideo→this.getVideo and nextUnpostedVideoForDecks→this.nextUnpostedVideo
// resolve on the merged store.
import type { DatabaseSync } from "node:sqlite";
import { rowToVideo, type Row } from "./mappers.ts";
import type { Video } from "./types.ts";

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

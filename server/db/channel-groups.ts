import type { DatabaseSync } from "node:sqlite";
import type { ChannelGroup } from "./types.ts";
import { invalidateReadCache } from "../services/read-cache.ts";

type GroupRow = {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
  channel_count?: number;
};
const mapGroup = (row: GroupRow): ChannelGroup => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  createdAt: row.created_at,
  channelCount: Number(row.channel_count || 0),
});
export function channelGroupMethods(db: DatabaseSync) {
  return {
    listChannelGroups(userId: number): ChannelGroup[] {
      return (
        db
          .prepare(
            "SELECT g.*,count(a.id) AS channel_count FROM channel_groups g LEFT JOIN accounts a ON a.group_id=g.id AND a.user_id=g.user_id WHERE g.user_id=? GROUP BY g.id ORDER BY g.id",
          )
          .all(userId) as GroupRow[]
      ).map(mapGroup);
    },
    getChannelGroup(id: number): ChannelGroup | null {
      const row = db
        .prepare(
          "SELECT g.*,(SELECT count(*) FROM accounts a WHERE a.group_id=g.id AND a.user_id=g.user_id) AS channel_count FROM channel_groups g WHERE g.id=?",
        )
        .get(id) as GroupRow | undefined;
      return row ? mapGroup(row) : null;
    },
    createChannelGroup(userId: number, name: string): ChannelGroup {
      const info = db
        .prepare("INSERT INTO channel_groups(user_id,name) VALUES(?,?)")
        .run(userId, name);
      invalidateReadCache();
      return this.getChannelGroup(Number(info.lastInsertRowid))!;
    },
    renameChannelGroup(id: number, name: string): ChannelGroup | null {
      db.prepare("UPDATE channel_groups SET name=? WHERE id=?").run(name, id);
      invalidateReadCache();
      return this.getChannelGroup(id);
    },
    deleteChannelGroup(id: number): void {
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE accounts SET group_id=NULL WHERE group_id=?").run(
          id,
        );
        db.prepare("DELETE FROM channel_groups WHERE id=?").run(id);
        db.exec("COMMIT");
        invalidateReadCache();
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

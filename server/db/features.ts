// Per-user feature flags (generic): each row in user_feature_access = (user_id, feature) means that
// user has that opt-in capability turned on by an admin. Currently used by "infinite-packs"
// (see server/services/infinite-packs.ts). No ON CONFLICT here — the table predates this code and may
// lack a PRIMARY KEY on older installs, so setFeature is a plain delete-then-insert (idempotent).
import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./mappers.ts";

export function featureMethods(db: DatabaseSync) {
  return {
    hasFeature(userId: number, feature: string): boolean {
      return !!db
        .prepare("SELECT 1 FROM user_feature_access WHERE user_id = ? AND feature = ? LIMIT 1")
        .get(userId, feature);
    },
    setFeature(userId: number, feature: string, on: boolean): void {
      db.prepare("DELETE FROM user_feature_access WHERE user_id = ? AND feature = ?").run(userId, feature);
      if (on)
        db.prepare("INSERT INTO user_feature_access (user_id, feature) VALUES (?, ?)").run(userId, feature);
    },
    usersWithFeature(feature: string): number[] {
      return (
        db.prepare("SELECT DISTINCT user_id FROM user_feature_access WHERE feature = ?").all(feature) as Row[]
      ).map((r) => r.user_id as number);
    },
  };
}

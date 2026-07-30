import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./mappers.ts";
import type { SzzStudyStateRow } from "./types.ts";

function rowToSzzStudyState(row?: Row): SzzStudyStateRow | null {
  if (!row) return null;
  try {
    return {
      userId: Number(row.user_id),
      state: JSON.parse(String(row.state_json)),
      stateUpdatedAt: Number(row.state_updated_at) || 0,
      updatedAt: String(row.updated_at),
    };
  } catch {
    return null;
  }
}

export function szzStudyMethods(db: DatabaseSync) {
  const get = (userId: number): SzzStudyStateRow | null =>
    rowToSzzStudyState(
      db
        .prepare(
          "SELECT user_id, state_json, state_updated_at, updated_at " +
            "FROM user_szz_study_state WHERE user_id = ?",
        )
        .get(userId) as Row | undefined,
    );

  return {
    getSzzStudyState(userId: number): SzzStudyStateRow | null {
      return get(userId);
    },
    saveSzzStudyState(
      userId: number,
      stateJson: string,
      stateUpdatedAt: number,
    ): { saved: boolean; row: SzzStudyStateRow | null } {
      const result = db
        .prepare(
          `INSERT INTO user_szz_study_state
             (user_id, state_json, state_updated_at, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id) DO UPDATE SET
             state_json = excluded.state_json,
             state_updated_at = excluded.state_updated_at,
             updated_at = datetime('now')
           WHERE excluded.state_updated_at >= user_szz_study_state.state_updated_at`,
        )
        .run(userId, stateJson, stateUpdatedAt);
      return { saved: Number(result.changes) > 0, row: get(userId) };
    },
  };
}

import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./mappers.ts";
import type { SzzFlashcardStateRow } from "./types.ts";

function rowToSzzFlashcardState(row?: Row): SzzFlashcardStateRow | null {
  if (!row) return null;
  try {
    return {
      userId: Number(row.user_id),
      revision: Number(row.revision),
      state: JSON.parse(String(row.state_json)),
      stateUpdatedAt: Number(row.state_updated_at),
      updatedAt: String(row.updated_at),
    };
  } catch {
    return null;
  }
}

export function szzFlashcardMethods(db: DatabaseSync) {
  const get = (userId: number): SzzFlashcardStateRow | null =>
    rowToSzzFlashcardState(
      db
        .prepare(
          "SELECT user_id, revision, state_json, state_updated_at, updated_at " +
            "FROM user_szz_flashcard_state WHERE user_id = ?",
        )
        .get(userId) as Row | undefined,
    );

  return {
    getSzzFlashcardState(userId: number): SzzFlashcardStateRow | null {
      return get(userId);
    },
    saveSzzFlashcardState(
      userId: number,
      stateJson: string,
      stateUpdatedAt: number,
      expectedRevision: number,
    ): { saved: boolean; row: SzzFlashcardStateRow | null } {
      const result = expectedRevision === 0
        ? db
            .prepare(
              `INSERT INTO user_szz_flashcard_state
                 (user_id, revision, state_json, state_updated_at, updated_at)
               VALUES (?, 1, ?, ?, datetime('now'))
               ON CONFLICT(user_id) DO NOTHING`,
            )
            .run(userId, stateJson, stateUpdatedAt)
        : db
            .prepare(
              `UPDATE user_szz_flashcard_state
               SET revision = revision + 1,
                   state_json = ?,
                   state_updated_at = ?,
                   updated_at = datetime('now')
               WHERE user_id = ? AND revision = ?`,
            )
            .run(stateJson, stateUpdatedAt, userId, expectedRevision);
      return { saved: Number(result.changes) > 0, row: get(userId) };
    },
  };
}

// Thin barrel over the per-domain DB modules in ./db/. PUBLIC SURFACE is byte-identical to the old
// god-object: callers still `import { openDb, parseCredMeta, MAX_OAUTH_CLIENTS_PER_USER, type Account,
// type OAuthClientRow, type Db, … } from "./db.ts" / "../db.ts"`. openDb opens the handle, runs the
// same PRAGMAs/chmod, applies the full ordered schema, then spread-merges every domain factory into ONE
// `store` object — so each factory's object-literal method shorthand keeps `this` pointing at the merged
// store (createAccount→this.getAccount, addOAuthClient→this.countOAuthClients, etc.). The raw `db`
// handle stays on the returned object (index.ts calls `db.db.close()`).
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";

import { applySchema } from "./db/schema.ts";
import { accountMethods } from "./db/accounts.ts";
import { videoMethods } from "./db/videos.ts";
import { historyMethods } from "./db/history.ts";
import { userMethods } from "./db/users.ts";
import { deckMethods } from "./db/decks.ts";
import { featureMethods } from "./db/features.ts";
import { oauthMethods } from "./db/oauth-clients.ts";
import { statsMethods } from "./db/stats.ts";
import { notifMethods } from "./db/notifications.ts";
import { creatorMethods } from "./db/creator.ts";
import { szzStudyMethods } from "./db/szz-study.ts";

// Re-export everything callers import from this module (types + the two public constants live in
// ./db/types.ts; parseCredMeta/defaultClientLabel live in ./db/mappers.ts).
export * from "./db/types.ts";
export { parseCredMeta, defaultClientLabel } from "./db/mappers.ts";

export function openDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // Concurrency hardening: WAL lets readers and a writer coexist; busy_timeout makes brief lock
  // contention (scheduler + live user + short-lived side connections) wait-and-retry instead of
  // throwing SQLITE_BUSY immediately. synchronous=NORMAL is the safe WAL companion. Best-effort
  // (e.g. in-memory ":memory:" ignores journal pragmas — fine for tests).
  try {
    db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;");
  } catch {
    /* pragmas best-effort */
  }
  // The DB file holds YouTube refresh tokens + per-user Google client secrets — keep it owner-only.
  // chmod is a no-op on Windows and harmless if it fails.
  if (path !== ":memory:") {
    try {
      chmodSync(path, 0o600);
    } catch {
      /* best-effort */
    }
  }

  applySchema(db);

  const store = {
    db,
    ...accountMethods(db),
    ...videoMethods(db),
    ...historyMethods(db),
    ...userMethods(db),
    ...deckMethods(db),
    ...featureMethods(db),
    ...oauthMethods(db),
    ...statsMethods(db),
    ...notifMethods(db),
    ...creatorMethods(db),
    ...szzStudyMethods(db),
  };
  return store;
}

export type Db = ReturnType<typeof openDb>;

import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const DB_PATH = resolve(ROOT, "data/app.db");
const OUTPUT_DIR = resolve(ROOT, "data/output");
const OUTPUT_PREFIX = `${OUTPUT_DIR}/`;
const BACKUP_DIR = resolve(ROOT, "tmp/cleanup-backups");
const USERNAME = "armen";
const MGS_DECKS = new Set(["pack:психология-mgs-mqe2kfjv", "pack:психология-mgs-mqp9hqle", "pack:mgs-psychologie-eigen"]);
const apply = process.argv.includes("--apply");

const db = new DatabaseSync(DB_PATH);
db.prepare("PRAGMA busy_timeout = 5000").run();

const rows = db
  .prepare(
    `SELECT v.id, v.account_id, a.channel_name, v.deck, v.title, v.text, v.video_rel, v.image_rel
       FROM videos v
       JOIN accounts a ON a.id = v.account_id
       JOIN users u ON u.id = a.user_id
      WHERE u.username = ?
        AND v.deck IN (${Array.from(MGS_DECKS).map(() => "?").join(",")})
      ORDER BY a.id, v.id`,
  )
  .all(USERNAME, ...MGS_DECKS);

const byAccount = new Map();
for (const row of rows) {
  const key = `${row.account_id} ${row.channel_name}`;
  byAccount.set(key, (byAccount.get(key) ?? 0) + 1);
}

console.log(`armen MGS queued videos: ${rows.length}`);
for (const [account, count] of byAccount) console.log(`- ${account}: ${count}`);

if (!apply) {
  console.log("dry-run only; pass --apply to delete DB rows and rendered files");
  db.close();
  process.exit(0);
}

if (!rows.length) {
  db.close();
  process.exit(0);
}

mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const backupPath = resolve(BACKUP_DIR, `armen-mgs-queued-videos-${stamp}.json`);
mkdirSync(dirname(backupPath), { recursive: true });
writeFileSync(backupPath, JSON.stringify(rows, null, 2));

const del = db.prepare("DELETE FROM videos WHERE id = ?");
db.exec("BEGIN");
try {
  for (const row of rows) del.run(row.id);
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  db.close();
  throw error;
}

let filesDeleted = 0;
let filesMissing = 0;
for (const row of rows) {
  for (const rel of [row.video_rel, row.image_rel]) {
    if (!rel) continue;
    const path = resolve(OUTPUT_DIR, rel);
    if (path !== OUTPUT_DIR && !path.startsWith(OUTPUT_PREFIX)) {
      console.warn(`skip unsafe output path ${path}`);
      continue;
    }
    try {
      if (existsSync(path)) {
        unlinkSync(path);
        filesDeleted++;
      } else {
        filesMissing++;
      }
    } catch (error) {
      console.warn(`failed to delete ${path}: ${error?.message || error}`);
    }
  }
}

console.log(`backup: ${backupPath}`);
console.log(`deleted rows: ${rows.length}`);
console.log(`deleted files: ${filesDeleted}; missing files: ${filesMissing}`);
db.close();

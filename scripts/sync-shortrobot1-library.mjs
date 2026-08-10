import { copyFileSync, existsSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const ROOT = resolve(import.meta.dirname, "..");
const DB_PATH = resolve(ROOT, "data/app.db");
const OUTPUT_DIR = resolve(ROOT, "data/output");
const ASSET_DIR = resolve(ROOT, "assets/fact-videos/shortrobot1");
const ACCOUNT_ID = 106;
const DECK_ID = "shortrobot1";

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const account = db
  .prepare("SELECT id, user_id, source_decks FROM accounts WHERE id = ?")
  .get(ACCOUNT_ID);
if (!account || Number(account.user_id) !== 1) throw new Error("Unexpected owner for account 106");
if (!JSON.parse(String(account.source_decks || "[]")).includes(DECK_ID)) {
  throw new Error("Account 106 is not linked to shortrobot1");
}

const rows = db
  .prepare(
    `SELECT id, title, video_rel, image_rel
       FROM videos
      WHERE account_id = ? AND deck = ?
      ORDER BY id`,
  )
  .all(ACCOUNT_ID, DECK_ID);
db.close();
if (!rows.length) throw new Error("No shortrobot1 library videos found for account 106");

let synced = 0;
for (const row of rows) {
  const match = String(row.title).match(/выпуск\s+(\d{3})$/u);
  if (!match) throw new Error(`Cannot map library row ${row.id}: ${row.title}`);
  const source = resolve(ASSET_DIR, `${DECK_ID}-${match[1]}.mp4`);
  if (!existsSync(source)) throw new Error(`Missing pack asset: ${source}`);

  const videoTarget = resolve(OUTPUT_DIR, String(row.video_rel));
  const videoTemp = resolve(dirname(videoTarget), `.${basename(videoTarget)}.shortrobot-v2-${process.pid}`);
  copyFileSync(source, videoTemp);

  let imageTarget = null;
  let imageTemp = null;
  if (row.image_rel) {
    imageTarget = resolve(OUTPUT_DIR, String(row.image_rel));
    imageTemp = resolve(
      dirname(imageTarget),
      `.${basename(imageTarget)}.shortrobot-v2-${process.pid}${extname(imageTarget) || ".png"}`,
    );
    const poster = spawnSync(
      "ffmpeg",
      ["-y", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", source, "-frames:v", "1", imageTemp],
      { encoding: "utf8" },
    );
    if (poster.status !== 0) {
      rmSync(videoTemp, { force: true });
      rmSync(imageTemp, { force: true });
      throw new Error(`Poster generation failed for row ${row.id}: ${poster.stderr.trim()}`);
    }
  }
  renameSync(videoTemp, videoTarget);
  if (imageTemp && imageTarget) renameSync(imageTemp, imageTarget);
  synced += 1;
}

console.log(JSON.stringify({ accountId: ACCOUNT_ID, deck: DECK_ID, libraryVideos: rows.length, synced }));

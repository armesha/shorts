import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const DB_PATH = resolve(process.cwd(), "data/app.db");
const FROM = "pack:психология-mgs-mqe2kfjv";
const TO = "pack:psychology-de-superadmin";
const DRY_RUN = process.argv.includes("--dry-run");

function replaceDeckList(raw) {
  let changed = false;
  const list = JSON.parse(raw || "[]");
  const next = list.map((deck) => {
    if (deck === FROM) {
      changed = true;
      return TO;
    }
    return deck;
  });
  return { changed, value: JSON.stringify([...new Set(next)]) };
}

function replaceSlotDecks(raw) {
  let changed = false;
  const slots = JSON.parse(raw || "{}");
  for (const [time, deck] of Object.entries(slots)) {
    if (deck === FROM) {
      slots[time] = TO;
      changed = true;
    }
  }
  return { changed, value: JSON.stringify(slots) };
}

const db = new DatabaseSync(DB_PATH);
try {
  const user = db.prepare("SELECT id FROM users WHERE username=?").get("armen");
  if (!user) throw new Error("armen user not found");

  const rows = db
    .prepare("SELECT id, channel_name, source_decks, slot_decks FROM accounts WHERE user_id=?")
    .all(user.id);
  const updates = [];
  for (const row of rows) {
    const source = replaceDeckList(row.source_decks);
    const slots = replaceSlotDecks(row.slot_decks);
    if (!source.changed && !slots.changed) continue;
    updates.push({
      id: row.id,
      channel: row.channel_name,
      source_decks: source.changed ? source.value : row.source_decks,
      slot_decks: slots.changed ? slots.value : row.slot_decks,
      sourceChanged: source.changed,
      slotsChanged: slots.changed,
    });
  }

  if (!DRY_RUN && updates.length) {
    const update = db.prepare("UPDATE accounts SET source_decks=?, slot_decks=? WHERE id=?");
    db.exec("BEGIN");
    try {
      for (const row of updates) update.run(row.source_decks, row.slot_decks, row.id);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, from: FROM, to: TO, updates }, null, 2));
} finally {
  db.close();
}

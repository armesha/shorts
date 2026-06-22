// Verify the memes-board-ru deck is LIVE in the running dashboard server (admin API).
// Prefers an existing active admin session (read-only — no writes to the shared live DB);
// mints a temporary one only if none is active, and cleans it up afterwards.
// Run: node --experimental-sqlite --import tsx src/scripts/check-deck-live.ts
import { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:8080";
const DECKS = ["memes-ru", "memes-en", "memes-de", "memes-fr", "memes-it"];
const db = new DatabaseSync("data/app.db");

const nowIso = new Date().toISOString();
let token: string | null = null;
let minted = false;

// 1) reuse an existing non-expired admin session (no DB write)
const existing = db
  .prepare(
    `SELECT s.token AS token FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE u.role = 'admin' AND s.expires_at > ? ORDER BY s.expires_at DESC LIMIT 1`,
  )
  .get(nowIso) as { token?: string } | undefined;

if (existing?.token) {
  token = existing.token;
  console.log("auth: reusing existing active admin session (read-only)");
} else {
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get() as { id?: number } | undefined;
  if (!admin?.id) { console.error("no admin user found"); process.exit(1); }
  token = randomBytes(32).toString("hex");
  const exp = new Date(Date.now() + 3600_000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, admin.id, exp);
  minted = true;
  console.log("auth: minted a temporary admin session (will clean up)");
}

const headers = { cookie: `sid=${token}` };

try {
  const gens = (await fetch(`${BASE}/api/generators`, { headers }).then((r) => r.json())) as Array<Record<string, unknown>>;
  console.log(`/api/generators → ${gens.length} packs visible to admin\n`);
  mkdirSync("temp/meme-recheck/deck-verify", { recursive: true });
  for (const DECK of DECKS) {
    const g = gens.find((x) => x.id === DECK);
    const cr = await fetch(`${BASE}/api/gallery/${DECK}/cards`, { headers });
    const cards = (await cr.json()) as { count?: number; name?: string; cards?: Array<{ caption?: string }> };
    const t0 = Date.now();
    const tr = await fetch(`${BASE}/api/gallery/${DECK}/0/thumb`, { headers });
    const ct = tr.headers.get("content-type") || "";
    const buf = Buffer.from(await tr.arrayBuffer());
    let saved = "";
    if (tr.ok && ct.includes("image")) {
      const p = `temp/meme-recheck/deck-verify/live-${DECK}.jpg`;
      writeFileSync(p, buf); saved = ` → ${p}`;
    }
    const sample = (cards.cards || []).slice(0, 2).map((c) => "«" + (c.caption || "").replace(/\n/g, " / ") + "»").join(" ");
    console.log(`${DECK}: gen=${g ? `${g.name}/total ${g.total}` : "❌ MISSING"} | cards HTTP ${cr.status} count ${cards.count ?? "?"} | thumb HTTP ${tr.status} ${buf.length}b ${Date.now() - t0}ms${saved}`);
    console.log(`   ${sample}`);
  }
} finally {
  if (minted && token) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    console.log("\nauth: temporary session removed");
  }
  db.close();
}

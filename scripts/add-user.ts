// Create a non-admin user directly in the DB (idempotent — won't overwrite an existing one).
// Use this to add a user to the LIVE DB without restarting the server (the .env SEED_USERS
// only runs on boot). Usage:
//   node --import tsx --experimental-sqlite scripts/add-user.ts <username> <password> [role] [dbPath]
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../server/auth.ts";

const [, , username, password, roleArg, dbArg] = process.argv;
if (!username || !password) {
  console.error("usage: add-user <username> <password> [role=user] [dbPath]");
  process.exit(1);
}
const role = roleArg === "admin" ? "admin" : "user";
const dbPath = dbArg ?? process.env.DATABASE_PATH ?? "data/app.db";
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000"); // wait out the running server's write lock if any

const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
if (exists) {
  console.log(`Пользователь «${username}» уже существует — пропускаю (пароль не трогаю).`);
} else {
  db.prepare("INSERT INTO users (username, pass_hash, role) VALUES (?,?,?)").run(
    username,
    hashPassword(password),
    role,
  );
  console.log(`OK: создан пользователь «${username}» (роль: ${role}).`);
}
db.close();

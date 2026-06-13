// Reset a user's password directly in the DB (admin CLI; there's no self-serve change-password UI yet).
// Usage: node --import tsx --experimental-sqlite scripts/set-password.ts <username> <password> [dbPath]
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../server/auth.ts";

const [, , username, password, dbArg] = process.argv;
if (!username || !password) {
  console.error("usage: set-password <username> <password> [dbPath]");
  process.exit(1);
}
const dbPath = dbArg ?? process.env.DATABASE_PATH ?? "data/app.db";
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000"); // wait out the running server's write lock if any

const res = db
  .prepare("UPDATE users SET pass_hash = ?, failed_attempts = 0, locked_until = NULL WHERE username = ?")
  .run(hashPassword(password), username);

console.log(
  res.changes
    ? `OK: пароль для «${username}» обновлён, блокировка сброшена.`
    : `Пользователь «${username}» не найден в ${dbPath}.`,
);
db.close();

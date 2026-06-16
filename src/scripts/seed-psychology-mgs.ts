// Сид: заливает пак «психология mgs» (10 шаблонов + 10 карточек из assets/template-packs/) в стор
// как живой пользовательский пак, владелец — администратор. Идемпотентно (повторно не дублирует).
// Запуск: node --import tsx --experimental-sqlite src/scripts/seed-psychology-mgs.ts
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createPack, addCards, listPacks, type PackTemplate } from "../packs/store.ts";

const PACK_NAME = "психология mgs";
const PACK_DIR = resolve(process.cwd(), "assets/template-packs/psychology-mgs");
const DB = resolve(process.cwd(), "data/app.db");

// найти владельца: администратор (или первый пользователь)
const db = new DatabaseSync(DB);
const users = db.prepare("SELECT id, username, role FROM users ORDER BY id").all() as Array<{ id: number; username: string; role: string }>;
db.close();
const owner = users.find((u) => u.role === "admin") ?? users[0];
if (!owner) {
  console.error("Нет пользователей в БД — сначала запусти сервер (он сидит админа из .env).");
  process.exit(1);
}
console.log(`владелец пака: #${owner.id} ${owner.username} (${owner.role})`);

// уже есть такой пак у владельца?
if (listPacks(owner.id).some((p) => p.name === PACK_NAME)) {
  console.log(`Пак «${PACK_NAME}» уже существует у этого пользователя — пропускаю.`);
  process.exit(0);
}

// шаблоны (10 цветов) + карточки
const templates: PackTemplate[] = readdirSync(resolve(PACK_DIR, "templates"))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(resolve(PACK_DIR, "templates", f), "utf8")) as PackTemplate);
const cards = JSON.parse(readFileSync(resolve(PACK_DIR, "cards.json"), "utf8")) as Array<{ title: string; text: string[] }>;

const pack = createPack(owner.id, { name: PACK_NAME, lang: "de", templates });
const r = addCards(pack.id, owner.id, true, cards);
console.log(`создан пак ${pack.id}: шаблонов ${templates.length}`);
console.log(r.ok ? `карточек добавлено: ${r.added} (всего ${r.total})` : `карточки НЕ добавлены: ${JSON.stringify(r)}`);

// Сид: заливает пак «тёмная психология (английский)» (The Mind Edge) в стор как живой
// пользовательский пак, владелец — администратор. 6 шаблонов (по фону) из buildTemplates(),
// карточки из assets/template-packs/the-mind-edge/cards.json. Идемпотентно (повторно не дублирует).
// Запуск: node --import tsx --experimental-sqlite src/scripts/seed-mind-edge.ts
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPack, addCards, listPacks } from "../packs/store.ts";
import { buildTemplates } from "./mind-edge-templates.ts";

const PACK_NAME = "Тёмная психология"; // язык показывает тег «· EN» (новая система имя+тег)
const CARDS_FILE = resolve(process.cwd(), "assets/template-packs/the-mind-edge/cards.json");
const DB = resolve(process.cwd(), "data/app.db");

// владелец: администратор (или первый пользователь)
const db = new DatabaseSync(DB);
const users = db
  .prepare("SELECT id, username, role FROM users ORDER BY id")
  .all() as Array<{ id: number; username: string; role: string }>;
db.close();
const owner = users.find((u) => u.role === "admin") ?? users[0];
if (!owner) {
  console.error("Нет пользователей в БД — сначала запусти сервер (он сидит админа из .env).");
  process.exit(1);
}
console.log(`владелец пака: #${owner.id} ${owner.username} (${owner.role})`);

if (listPacks(owner.id, true).some((p) => p.name === PACK_NAME)) {
  console.log(`Пак «${PACK_NAME}» уже существует — пропускаю (удали вручную для пересоздания).`);
  process.exit(0);
}

const templates = buildTemplates();
const cards = JSON.parse(readFileSync(CARDS_FILE, "utf8")) as Array<{ title: string; text: string }>;
console.log(`шаблонов: ${templates.length}, карточек в файле: ${cards.length}`);

const pack = createPack(owner.id, { name: PACK_NAME, lang: "en", templates });
const r = addCards(pack.id, owner.id, true, cards);
console.log(`создан пак ${pack.id}`);
if (r.ok) {
  console.log(`карточек добавлено: ${r.added} (всего ${r.total})`);
} else {
  console.error(`карточки НЕ добавлены (${r.reason}).`);
  if (r.result?.errors?.length) {
    console.error(`первые ошибки:`, JSON.stringify(r.result.errors.slice(0, 5), null, 2));
  }
  process.exit(1);
}

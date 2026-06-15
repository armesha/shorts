// Обновляет ТОЛЬКО шаблоны (геометрия/шрифт) в уже созданном паке «Тёмная психология» свежим
// buildTemplates(). Карточки/имя/язык/гранты не трогает. Сервер подхватит с диска без рестарта.
// Запуск: node --import tsx src/scripts/mind-edge-update-templates.ts
import { resolve } from "node:path";
import { readdirSync, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { buildTemplates } from "./mind-edge-templates.ts";

const PACKS = resolve(process.cwd(), "data/packs");
const file = readdirSync(PACKS)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"))
  .map((f) => resolve(PACKS, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  .find((f) => (JSON.parse(readFileSync(f, "utf8")).name || "").includes("Тёмная психология"));
if (!file) { console.error("пак «Тёмная психология» не найден"); process.exit(1); }

const pack = JSON.parse(readFileSync(file, "utf8")) as { name: string; templates: unknown[]; cards: unknown[] };
const before = pack.templates.length;
pack.templates = buildTemplates();
const tmp = `${file}.tmp`;
writeFileSync(tmp, JSON.stringify(pack, null, 2));
renameSync(tmp, file);
console.log(`пак: ${pack.name}`);
console.log(`шаблоны обновлены: было ${before} → стало ${pack.templates.length}; карточек ${pack.cards.length} (не тронуты)`);
console.log(`файл: ${file}`);

// Проставляет/верифицирует поле lang у кастомных паков по ТЕКСТУ карточек (file-only, БД не трогает).
// Кириллица→ru, арабица→ar, нем. умляуты→de, фр. акценты→fr, иначе латиница→en.
//   node --import tsx src/scripts/pack-detect-lang.ts          (показать)
//   node --import tsx src/scripts/pack-detect-lang.ts --write  (записать)
import { readFileSync, writeFileSync, renameSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(process.cwd(), "data/packs");
const WRITE = process.argv.includes("--write");

function cardText(pack: { cards?: { values?: Record<string, unknown> }[] }): string {
  const parts: string[] = [];
  for (const c of pack.cards ?? []) {
    for (const v of Object.values(c.values ?? {})) {
      if (Array.isArray(v)) parts.push(v.map(String).join(" "));
      else if (typeof v === "string") parts.push(v);
    }
  }
  return parts.join(" ");
}

function detect(text: string): string {
  const ar = (text.match(/[؀-ۿ]/g) || []).length;
  const cyr = (text.match(/[Ѐ-ӿ]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  if (ar > 5 && ar >= cyr) return "ar";
  if (cyr > lat) return "ru";
  // латиница: различаем de/fr/en по диакритике
  if (/[äöüßÄÖÜ]/.test(text)) return "de";
  if (/[àâæçéèêëîïôœùûÿ]/i.test(text)) return "fr";
  return lat > 0 ? "en" : "ru";
}

if (!existsSync(DIR)) { console.log("нет data/packs"); process.exit(0); }
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json") && !x.endsWith(".tmp") && !x.endsWith(".bak"))) {
  const file = resolve(DIR, f);
  let pack: { id?: string; name?: string; lang?: string; cards?: unknown[] };
  try { pack = JSON.parse(readFileSync(file, "utf8")); } catch { console.log(`skip (bad json): ${f}`); continue; }
  const text = cardText(pack as Parameters<typeof cardText>[0]);
  if (!text.trim()) { console.log(`${pack.name ?? f}: нет текста — оставляю lang=${pack.lang ?? "?"}`); continue; }
  const det = detect(text);
  const same = det === pack.lang;
  console.log(`${pack.name ?? f}: lang ${pack.lang ?? "—"} → ${det}${same ? " (без изменений)" : "  *ИЗМЕНЕНО*"}`);
  if (WRITE && !same) {
    pack.lang = det;
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(pack, null, 2));
    renameSync(tmp, file);
  }
}
console.log(WRITE ? "=== записано ===" : "=== просмотр (для записи добавь --write) ===");

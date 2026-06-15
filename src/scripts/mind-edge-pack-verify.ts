// Финальная проверка СОЗДАННОГО пака: читает свежий data/packs/*.json (The Mind Edge), рендерит
// несколько карточек их «боевыми» шаблонами (card i → templates[i % N], как buildPackLibraryVideo) →
// data/output/mind-edge-pack/. Запуск: node --import tsx src/scripts/mind-edge-pack-verify.ts
import { resolve } from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { renderTemplateCard } from "../template/render.ts";

const PACKS = resolve(process.cwd(), "data/packs");
const OUT = resolve(process.cwd(), "data/output/mind-edge-pack");

// последний по времени пак с именем "Тёмная психология"
const file = readdirSync(PACKS)
  .filter((f) => f.endsWith(".json") && !f.endsWith(".tmp"))
  .map((f) => resolve(PACKS, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  .find((f) => (JSON.parse(readFileSync(f, "utf8")).name || "").includes("Тёмная психология"));
if (!file) { console.error("пак не найден"); process.exit(1); }

const pack = JSON.parse(readFileSync(file, "utf8")) as {
  name: string; lang: string; templates: unknown[]; cards: { values: Record<string, string> }[];
};
console.log(`пак: ${pack.name} | lang=${pack.lang} | шаблонов=${pack.templates.length} | карточек=${pack.cards.length}`);

const idxs = [0, 250, 500, 999].filter((i) => i < pack.cards.length);
const main = async () => {
  for (const i of idxs) {
    const c = pack.cards[i].values;
    const tpl = pack.templates[i % pack.templates.length] as Parameters<typeof renderTemplateCard>[0];
    const out = resolve(OUT, `pack-${String(i).padStart(4, "0")}.png`);
    await renderTemplateCard(tpl, c, out);
    console.log(`#${i} (title ${String(c.title).length} / body ${String(c.text).length}) → ${out}`);
  }
  console.log("done");
};
main().catch((e) => { console.error(e); process.exit(1); });

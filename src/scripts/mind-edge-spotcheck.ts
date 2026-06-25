// Спот-чек раскладки на РЕАЛЬНЫХ сгенерированных карточках (из local-assets/corpora/mind-edge-gen/w1-*.json).
// Берёт самые «тяжёлые» (макс. длина тела и заголовка) + случайные, рендерит по одной на каждый из
// 6 фонов → PNG в data/output/mind-edge-spotcheck/. Проверяем, что текст не выходит за зоны.
// Запуск: node --import tsx src/scripts/mind-edge-spotcheck.ts
import { resolve } from "node:path";
import { readdirSync, readFileSync } from "node:fs";
import { renderTemplateCard } from "../template/render.ts";
import { buildTemplates } from "./mind-edge-templates.ts";

const GEN = resolve(process.cwd(), "local-assets/corpora/mind-edge-gen");
const OUT = resolve(process.cwd(), "data/output/mind-edge-spotcheck");
const collapse = (s: string) => String(s ?? "").replace(/\s+/g, " ").trim();

type Card = { title: string; text: string };
const all: Card[] = [];
for (const f of readdirSync(GEN).filter((f) => /^w1-.*\.json$/.test(f))) {
  let arr: unknown;
  try { arr = JSON.parse(readFileSync(resolve(GEN, f), "utf8")); } catch { continue; }
  if (!Array.isArray(arr)) continue;
  for (const c of arr as Card[]) {
    if (!c || typeof c.title !== "string" || typeof c.text !== "string") continue;
    const title = collapse(c.title).replace(/\.$/, ""), text = collapse(c.text);
    if (title.length < 16 || title.length > 80) continue;
    if (text.length < 350 || text.length > 450) continue;
    all.push({ title, text });
  }
}

const byBody = [...all].sort((a, b) => b.text.length - a.text.length);
const byTitle = [...all].sort((a, b) => b.title.length - a.title.length);
const rnd = () => all[Math.floor(Math.random() * all.length)];
// 6 карточек-стресс: 2 самых длинных тела, самый длинный заголовок, 3 случайных
const sample: Card[] = [byBody[0], byBody[1], byTitle[0], rnd(), rnd(), rnd()];

const tpls = buildTemplates();
const main = async () => {
  console.log(`в диапазоне всего: ${all.length}`);
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i];
    const tpl = tpls[i % tpls.length];
    const out = resolve(OUT, `spot-${String(i + 1).padStart(2, "0")}.png`);
    await renderTemplateCard(tpl, { title: c.title, text: c.text }, out);
    console.log(`#${i + 1} ${tpl.name} | title ${c.title.length} / body ${c.text.length} → ${out}`);
  }
  console.log("done");
};
main().catch((e) => { console.error(e); process.exit(1); });

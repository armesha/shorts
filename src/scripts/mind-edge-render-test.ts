// Рендер-тест пака «The Mind Edge»: рисует пробные карточки каждым фоном → PNG в data/output/mind-edge-test/.
// Запуск: node --import tsx src/scripts/mind-edge-render-test.ts
import { resolve } from "node:path";
import { renderTemplateCard } from "../template/render.ts";
import { buildTemplates, SAMPLE_CARDS } from "./mind-edge-templates.ts";

const OUT = resolve(process.cwd(), "data/output/mind-edge-test");
const tpls = buildTemplates();

const main = async () => {
  for (let i = 0; i < SAMPLE_CARDS.length; i++) {
    const c = SAMPLE_CARDS[i];
    const tpl = tpls[i % tpls.length];
    const out = resolve(OUT, `card-${String(i + 1).padStart(2, "0")}.png`);
    await renderTemplateCard(tpl, { title: c.title, text: c.text }, out);
    console.log(`#${i + 1} (${tpl.name}, title ${c.title.length} / body ${c.text.length}) → ${out}`);
  }
  console.log("done");
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

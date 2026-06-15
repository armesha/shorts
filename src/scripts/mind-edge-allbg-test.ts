// Стресс-проверка: одна и та же «тяжёлая» карточка (заголовок ~50 симв. в 2–3 строки + тело 449 симв.)
// на ВСЕХ 6 фонах — убеждаемся, что текст нигде не наезжает на графику/лого и не обрезается.
// Запуск: node --import tsx src/scripts/mind-edge-allbg-test.ts
import { resolve } from "node:path";
import { renderTemplateCard } from "../template/render.ts";
import { buildTemplates } from "./mind-edge-templates.ts";

const OUT = resolve(process.cwd(), "data/output/mind-edge-allbg");
const tpls = buildTemplates();

const TITLE = "The quiet trick that makes you say yes"; // 38 — 2 строки
const BODY =
  "When someone wants a yes, they rarely ask for the big thing first. They ask for something " +
  "so small that refusing feels absurd, then let your own need to stay consistent do the rest. " +
  "Each tiny agreement rewrites how you see yourself, until the large request feels like simply " +
  "matching who you already are. Watch the first small ask — that is where the real deal is made."; // ~449

const main = async () => {
  console.log(`title ${TITLE.length} / body ${BODY.length}`);
  for (const tpl of tpls) {
    const out = resolve(OUT, `${tpl.name}.png`);
    await renderTemplateCard(tpl, { title: TITLE, text: BODY }, out);
    console.log(`${tpl.name} → ${out}`);
  }
  console.log("done");
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

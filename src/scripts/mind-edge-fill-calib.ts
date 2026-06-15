// Калибровка ЗАПОЛНЕНИЯ: длинная (~455) и короткая (~350) карточка на КАЖДОМ фоне новой геометрией.
// Смотрим: тело заполняет низ (нет провала), шрифт крупнее, текст не наезжает на графику/лого.
// Запуск: node --import tsx src/scripts/mind-edge-fill-calib.ts
import { resolve } from "node:path";
import { renderTemplateCard } from "../template/render.ts";
import { buildTemplates } from "./mind-edge-templates.ts";

const OUT = resolve(process.cwd(), "data/output/mind-edge-fill");
const tpls = buildTemplates();

const TITLE = "How to buy time without seeming weak"; // 36 — как на скрине
const CORPUS =
  "Asking for time is not hedging; it signals seriousness, and the people who hold real power do it " +
  "constantly without a flicker of apology. When you say you want to give a decision the consideration " +
  "it deserves, you reframe the pause as respect for the proposal rather than a rejection of the person " +
  "in front of you. It becomes hard to argue against someone who simply wants to think carefully, so the " +
  "line quietly absorbs pushback before it forms and buys you room without ever looking weak or evasive.";
const clip = (n: number) => {
  let s = CORPUS.slice(0, n);
  const sp = s.lastIndexOf(" ");
  if (sp > n - 14) s = s.slice(0, sp);
  return s.replace(/[\s,;:]+$/, "") + ".";
};
const LONG = clip(455), SHORT = clip(350);

const main = async () => {
  console.log(`long ${LONG.length} / short ${SHORT.length}`);
  for (const tpl of tpls) {
    await renderTemplateCard(tpl, { title: TITLE, text: LONG }, resolve(OUT, `${tpl.name}-long.png`));
    await renderTemplateCard(tpl, { title: TITLE, text: SHORT }, resolve(OUT, `${tpl.name}-short.png`));
    console.log(`${tpl.name} ✓`);
  }
  console.log("done");
};
main().catch((e) => { console.error(e); process.exit(1); });

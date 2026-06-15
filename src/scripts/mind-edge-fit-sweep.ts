// Калибровка влезаемости тела карточки The Mind Edge: рендерит тело ровно заданной длины
// (350/400/450/480/510 симв.) на «тесных» по декору фонах + длинный заголовок. Смотрим глазами,
// при какой длине шрифт ещё крупный и текст не давит на графику/лого.
// Запуск: node --import tsx src/scripts/mind-edge-fit-sweep.ts
import { resolve } from "node:path";
import { renderTemplateCard } from "../template/render.ts";
import { buildTemplates } from "./mind-edge-templates.ts";

const OUT = resolve(process.cwd(), "data/output/mind-edge-sweep");
const tpls = buildTemplates();
const byName = (s: string) => tpls.find((t) => t.name.includes(s))!;

// Длинный связный абзац «тёмной психологии» — режем по границе слова до нужной длины.
const CORPUS =
  "People rarely tell you what they want; they show you by what they keep testing. " +
  "When someone repeats a small demand, they are measuring how far your boundary bends, " +
  "not asking a question. The trick is to notice the pattern instead of the words, because " +
  "the words are chosen to sound reasonable while the pattern reveals the real intent. Once " +
  "you see it, you stop arguing with the sentence and start responding to the move behind it, " +
  "and that single shift quietly takes back the control they assumed you would hand over.";

function clampTo(target: number): string {
  if (CORPUS.length <= target) return CORPUS;
  let s = CORPUS.slice(0, target);
  const sp = s.lastIndexOf(" ");
  if (sp > target - 12) s = s.slice(0, sp);
  return s.replace(/[\s,;:]+$/, "") + ".";
}

const LONG_TITLE = "Why the people who seem calm are usually the ones in control"; // ~59

const main = async () => {
  for (const len of [350, 400, 450, 480, 510]) {
    const text = clampTo(len);
    const out = resolve(OUT, `eye-body-${len}.png`);
    await renderTemplateCard(byName("01-eye"), { title: "How quiet demands test you", text }, out);
    console.log(`eye body target ${len} → real ${text.length} → ${out}`);
  }
  // длинный заголовок + средний body на «созвездии»
  await renderTemplateCard(
    byName("02-constellation"),
    { title: LONG_TITLE, text: clampTo(400) },
    resolve(OUT, `constellation-longtitle.png`),
  );
  console.log(`long title ${LONG_TITLE.length} → ${resolve(OUT, "constellation-longtitle.png")}`);
  console.log("done");
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

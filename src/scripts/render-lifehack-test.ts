// Smoke-test the lifehack template across profession backgrounds.
// Run: node --import tsx src/scripts/render-lifehack-test.ts
import { resolve } from "node:path";
import { renderAnecdote } from "../anecdotes/render.ts";

const SAMPLE =
  "Чтобы котлеты получались сочными, добавьте в фарш немного холодной воды или кубик льда и хорошо его вымесите. Холод не даёт жиру вытопиться раньше времени, и при жарке сок остаётся внутри. Формуйте котлеты влажными руками, чтобы фарш не прилипал, и обжаривайте на хорошо разогретой сковороде по паре минут с каждой стороны, а потом доводите под крышкой.";

// A tip with a couple of LONG words — checks the narrow bottom-left column never clips.
const LONGWORD =
  "Не злоупотребляйте электроприборами при укладке: фен, утюжок и плойка пересушивают волосы. Перед использованием обязательно наносите термозащиту, сушите на средней температуре и держите фен на расстоянии ладони. Раз в неделю устраивайте волосам разгрузочный день без горячих укладок и делайте питательную восстанавливающую маску.";

const SHORT =
  "Храните бытовую химию и лекарства отдельно и подальше от детей. Подпишите ёмкости, не переливайте средства в бутылки из-под напитков и закрывайте крышки до щелчка.";

const cases: Array<{ prof: string; title: string; text: string }> = [
  { prof: "chef", title: "Сочные котлеты", text: SAMPLE },
  { prof: "builder", title: "Ровная полка с первого раза", text: SAMPLE },
  { prof: "hairdresser", title: "Меньше фена", text: LONGWORD },
  { prof: "police", title: "Звонок из «банка»", text: SAMPLE },
  { prof: "programmer", title: "Пароли под контролем", text: LONGWORD },
  { prof: "firefighter", title: "Химия подальше", text: SHORT },
];

const outDir = resolve(process.cwd(), "data/output/test");
for (const c of cases) {
  const out = resolve(outDir, `lh-${c.prof}.png`);
  const r = await renderAnecdote(
    { title: c.title, text: c.text, channel: "Народные лайфхаки", deck: "tips", profession: c.prof },
    out,
  );
  console.log(`${c.prof}: font ${r.fontPx}px, bg ${r.bg} → ${out}`);
}
console.log("done");

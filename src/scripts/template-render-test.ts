// Smoke-тест моста «шаблон редактора → PNG». Запуск: node --import tsx src/scripts/template-render-test.ts
// Рендерит 2 карточки в data/output/: A — обычная (авто-подгон + web-шрифты + кириллица),
// B — переполненная (маленький maxChars → обрезка «…», шрифт не ниже fitMin).
import { renderTemplateCard, type TemplateDoc, type TemplateContent } from "../template/render.ts";

function baseTemplate(bodyMaxChars: number): TemplateDoc {
  return {
    version: 1,
    name: "smoke",
    canvas: { w: 1080, h: 1920, bg: "#FFFDF5" },
    elements: [
      {
        id: "k_title", type: "killbox", x: 65, y: 90, w: 950, h: 250, rot: 0,
        role: "title", padX: 16, padY: 0, align: "center", valign: "center",
        font: { family: "Playfair Display", size: 104, weight: 700, color: "#1a1a1a", lineHeight: 1.08 },
        fitMin: 44, fitMax: 130, maxChars: 0, placeholder: "Заголовок",
      },
      {
        id: "k_body", type: "killbox", x: 80, y: 380, w: 920, h: 1240, rot: 0,
        role: "text", padX: 10, padY: 0, align: "left", valign: "top",
        font: { family: "Lora", size: 62, weight: 400, color: "#222222", lineHeight: 1.36 },
        fitMin: 34, fitMax: 84, maxChars: bodyMaxChars, placeholder: "Текст",
      },
      {
        id: "t_wm", type: "text", x: 540, y: 1790, w: 480, h: 100, rot: -3,
        text: "@psy.shorts", align: "right",
        font: { family: "Pacifico", size: 58, weight: 400, color: "#9a8f73", lineHeight: 1 },
      },
    ],
  };
}

const cards: Array<{ out: string; tpl: TemplateDoc; content: TemplateContent }> = [
  {
    out: "data/output/template-card-A.png",
    tpl: baseTemplate(0), // 0 = авто-лимит
    content: {
      title: "5 фактов о сне",
      text:
        "Мозг во сне закрепляет воспоминания и буквально промывает себя от токсинов. " +
        "Недосып бьёт по вниманию сильнее, чем лёгкое опьянение. " +
        "Привычный режим засыпания важнее общего числа часов в кровати.",
    },
  },
  {
    out: "data/output/template-card-B.png",
    tpl: baseTemplate(120), // жёсткий лимит 120 символов
    content: {
      title: "Лимит символов",
      text:
        "Этот текст специально слишком длинный, чтобы проверить обрезку по лимиту. " +
        "Он не должен мельчать ниже fitMin и не должен вылезать из блока — лишнее срежется многоточием. " +
        "Бла-бла-бла, ещё немного воды для верности, и ещё, и ещё.",
    },
  },
];

for (const c of cards) {
  const t0 = Date.now();
  await renderTemplateCard(c.tpl, c.content, c.out);
  console.log(`rendered ${c.out} (${Date.now() - t0} ms)`);
}
console.log("done");

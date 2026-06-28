import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT_PACK = resolve(ROOT, "data/packs/psychology-ru-superadmin.json");
const PACK_ID = "psychology-ru-superadmin";
const CREATED_AT = "2026-06-26T12:00:00.000Z";
const BG_DIR = resolve(ROOT, "assets/template-packs/psychology-ru/backgrounds");
const BG_REL = "assets/template-packs/psychology-ru/backgrounds";

const topics = [
  "самокритика",
  "тревожные мысли",
  "личные границы",
  "усталость от общения",
  "страх отказа",
  "привычка угождать",
  "откладывание дел",
  "вспышка раздражения",
  "сравнение себя",
  "чувство вины",
  "перфекционизм",
  "обида",
  "неопределенность",
  "сложный разговор",
  "утренняя усталость",
  "потеря фокуса",
  "внутреннее напряжение",
  "спешка",
  "страх ошибки",
  "эмоциональная закрытость",
  "навязчивые мысли",
  "перегруз задачами",
  "чужое мнение",
  "пауза перед ответом",
  "выгорание",
  "раздражение на близких",
  "невысказанная просьба",
  "завышенные ожидания",
  "потребность в одобрении",
  "сложность отдыхать",
  "конфликт после молчания",
  "самообесценивание",
  "план без сил",
  "доверие к себе",
  "эмоциональный откат",
];

const starts = [
  "Когда появляется",
  "Если возвращается",
  "Когда мешает",
  "Если давит",
  "Когда усиливается",
  "Если тянется",
  "Когда заметна",
];

const LABELS = [
  "ЗАМЕТКА",
  "ПРОВЕРКА",
  "НА КАЖДЫЙ ДЕНЬ",
  "РЕФЛЕКСИЯ",
  "ПАУЗА",
  "ГРАНИЦЫ",
  "ВОПРОС К СЕБЕ",
  "ПАУЗА ДЛЯ МЫСЛИ",
  "САМОПРОВЕРКА",
  "ЧЕСТНО?",
  "ДНЕВНИК",
  "ВНУТРЕННИЙ ВЗГЛЯД",
  "МИФ / ФАКТ",
  "ПЕРЕОСМЫСЛИТЬ",
  "НОВЫЙ ВЗГЛЯД",
  "НОВАЯ РАМКА",
  "ВМЕСТО / ЛУЧШЕ",
  "ЯСНЕЕ МЫСЛИТЬ",
  "МИКРО-ПРИВЫЧКА",
  "3 МИНУТЫ",
  "МАЛЕНЬКИЙ ШАГ",
  "СБРОС",
  "СЕГОДНЯ",
  "МИНИ-ИНСТРУМЕНТ",
  "В ГОЛОВЕ",
  "ЭМОЦИЯ",
  "ПСИХОЛОГИЯ",
  "ШАБЛОН МЫСЛИ",
  "ТИХИЙ ВЫБОР",
  "ОПОРА",
];

const PALETTES = [
  { ink: "#10241d", accent: "#2f8f72", panel: "rgba(255,255,248,.84)", label: "rgba(255,255,255,.58)", border: "rgba(47,143,114,.26)" },
  { ink: "#28121a", accent: "#b8466d", panel: "rgba(255,248,250,.86)", label: "rgba(255,241,246,.66)", border: "rgba(184,70,109,.24)" },
  { ink: "#231805", accent: "#b98517", panel: "rgba(255,250,236,.86)", label: "rgba(255,248,225,.70)", border: "rgba(185,133,23,.24)" },
  { ink: "#162033", accent: "#3f66c7", panel: "rgba(247,250,255,.86)", label: "rgba(239,246,255,.70)", border: "rgba(63,102,199,.22)" },
  { ink: "#101827", accent: "#2f7ca7", panel: "rgba(245,251,255,.84)", label: "rgba(235,247,252,.66)", border: "rgba(47,124,167,.24)" },
  { ink: "#241529", accent: "#8050aa", panel: "rgba(252,247,255,.86)", label: "rgba(248,239,255,.68)", border: "rgba(128,80,170,.22)" },
  { ink: "#201710", accent: "#b15f34", panel: "rgba(255,249,242,.85)", label: "rgba(255,241,228,.66)", border: "rgba(177,95,52,.23)" },
  { ink: "#102322", accent: "#188b84", panel: "rgba(244,253,251,.86)", label: "rgba(233,250,247,.68)", border: "rgba(24,139,132,.22)" },
];

const LAYOUTS = [
  { key: "calm-panel", title: [92, 248, 896, 330], body: [112, 650, 856, 820], panel: [64, 96, 952, 1488], label: [104, 142, 760, 58] },
  { key: "wide-note", title: [82, 220, 916, 300], body: [94, 620, 892, 910], panel: [54, 78, 972, 1540], label: [94, 126, 800, 58] },
  { key: "lower-focus", title: [92, 308, 896, 280], body: [112, 690, 856, 770], panel: [70, 150, 940, 1370], label: [110, 198, 720, 58] },
  { key: "compact-card", title: [116, 260, 848, 310], body: [132, 650, 816, 760], panel: [84, 126, 912, 1320], label: [126, 178, 690, 58] },
  { key: "journal-sheet", title: [84, 250, 912, 330], body: [112, 684, 856, 800], panel: [74, 102, 932, 1450], label: [116, 154, 720, 58] },
  { key: "soft-poster", title: [110, 228, 860, 335], body: [126, 656, 828, 800], panel: [78, 92, 924, 1440], label: [124, 142, 710, 58] },
];

function sentence(topic, seed) {
  const rows = [
    "назови это как состояние, а не как свой характер",
    "проверь, чего сейчас просит тело: паузы, воды, тишины или ясного плана",
    "сократи задачу до первого действия на две минуты",
    "отдели факт от догадки: что реально произошло, а что ты достроил",
    "спроси себя, нужна ли реакция прямо сейчас",
    "выбери одну мягкую границу вместо длинного объяснения",
    "заметь тон внутреннего диалога и сделай его спокойнее",
    "не требуй от себя идеальной версии в момент усталости",
    "запиши одну фразу, которую можно сказать проще",
    "разреши себе ответить позже, если внутри шумно",
    "проверь, не пытаешься ли ты заслужить спокойствие",
    "сделай маленький шаг, который не требует настроения",
  ];
  return rows[(seed + topic.length) % rows.length];
}

function cardVariants(topic, index) {
  const lead = starts[index % starts.length];
  return [
    {
      title: `${lead} ${topic}`,
      text: [
        sentence(topic, 0),
        "поставь паузу между мыслью и действием",
        "сравнивай себя с собой вчера, а не с чужой картинкой",
        "оставь один простой следующий шаг",
        "если эмоция сильная, сначала снизь темп, потом решай",
      ],
    },
    {
      title: `Проверка на тему: ${topic}`,
      text: [
        "что я точно знаю, а что только предполагаю",
        "какая потребность сейчас не названа вслух",
        "где я беру лишнюю ответственность",
        "какой ответ был бы честным и спокойным",
        "что можно отложить без ущерба",
      ],
    },
    {
      title: "Вместо борьбы с собой",
      text: [
        `заметь ${topic} без ярлыка «со мной что-то не так»`,
        "говори с собой короче и мягче",
        "убери одно лишнее «надо» из плана",
        "попроси конкретику вместо угадывания",
        "заканчивай день не оценкой, а фактом: что было сделано",
      ],
    },
    {
      title: "Маленький шаг сегодня",
      text: [
        "одна заметка на бумаге разгружает голову",
        "один честный отказ лучше десяти раздраженных согласий",
        "одна пауза перед сообщением меняет тон разговора",
        "одна короткая прогулка помогает телу выйти из зажима",
        `одна фраза про ${topic} уже делает состояние понятнее`,
      ],
    },
    {
      title: "Миф и факт",
      text: [
        "миф: спокойствие появляется только после полного контроля",
        "факт: контроль часто растет из маленькой ясности",
        "миф: сильные люди не сомневаются",
        "факт: сомнение можно проверять, а не слушаться автоматически",
        `миф: ${topic} нужно победить силой`,
      ],
    },
    {
      title: "Вопросы к себе",
      text: [
        "что я сейчас пытаюсь доказать",
        "кому я мысленно отвечаю",
        "какую просьбу я заменил раздражением",
        "что будет достаточно хорошо, а не идеально",
        "какой выбор сохранит мне больше сил завтра",
      ],
    },
    {
      title: "Что помогает при напряжении",
      text: [
        "говорить медленнее, чем хочется",
        "сначала описывать факт, потом чувство",
        "не спорить с каждой мыслью подряд",
        "оставлять место для отдыха в расписании",
        "убирать из дня один источник лишнего шума",
        `замечать ${topic} раньше, чем оно станет громким`,
      ],
    },
    {
      title: "Спокойное напоминание",
      text: [
        "ты не обязан решать все состояние за один вечер",
        "пауза не делает тебя слабым",
        "граница не требует идеального объяснения",
        "честность звучит лучше, когда в ней меньше защиты",
        "маленькая ясность ценнее большого внутреннего суда",
      ],
    },
  ];
}

function rect(id, [x, y, w, h], extra = {}) {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    text: "",
    font: { family: "Inter", size: 12, weight: 400, color: "rgba(0,0,0,0)", lineHeight: 1 },
    ...extra,
  };
}

function text(id, value, [x, y, w, h], palette, extra = {}) {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    text: value,
    align: "left",
    font: { family: "Inter", size: 31, weight: 900, color: palette.accent, lineHeight: 1.1 },
    ...extra,
  };
}

function killbox(id, role, [x, y, w, h], font, extra = {}) {
  return {
    id,
    type: "killbox",
    role,
    x,
    y,
    w,
    h,
    padX: role === "text" ? 34 : 18,
    padY: role === "text" ? 34 : 18,
    fitMin: role === "text" ? 31 : 42,
    fitMax: role === "text" ? 47 : 76,
    font,
    ...extra,
  };
}

function image(id, src) {
  return { id, type: "image", x: 0, y: 0, w: 1080, h: 1920, src, fit: "cover" };
}

function availableBackgrounds() {
  if (!existsSync(BG_DIR)) throw new Error(`Missing psychology backgrounds: ${BG_DIR}`);
  const files = readdirSync(BG_DIR)
    .filter((file) => /^psychology-ru-bg-\d+\.jpe?g$/i.test(file))
    .sort();
  if (files.length < 4) throw new Error(`Expected at least 4 psychology backgrounds in ${BG_DIR}`);
  return files.map((file) => `${BG_REL}/${file}`);
}

function buildTemplates() {
  const backgrounds = availableBackgrounds();
  const templates = [];
  for (let i = 0; i < 30; i += 1) {
    const palette = PALETTES[i % PALETTES.length];
    const layout = LAYOUTS[i % LAYOUTS.length];
    const bg = backgrounds[i % backgrounds.length];
    const panelOpacity = i % 5 === 0 ? ".90" : i % 5 === 1 ? ".84" : ".78";
    const panelBg = palette.panel.replace(/\.\d+\)$/, `${panelOpacity})`);
    templates.push({
      version: 1,
      name: `psychology-ru-${String(i + 1).padStart(2, "0")}-${layout.key}`,
      canvas: { w: 1080, h: 1920, bg: "#f5f0e8" },
      elements: [
        image("bg-image", bg),
        rect("soft-scrim", [0, 0, 1080, 1920], {
          bg: i % 4 === 0 ? "linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.20))" : "rgba(255,255,255,.06)",
        }),
        rect("panel", layout.panel, {
          bg: panelBg,
          radius: i % 3 === 0 ? 48 : 30,
          border: `3px solid ${palette.border}`,
          shadow: "0 28px 86px rgba(20,18,16,.26)",
        }),
        text("label", LABELS[i % LABELS.length], layout.label, palette, {
          bg: palette.label,
          radius: 18,
          border: `2px solid ${palette.border}`,
        }),
        text("rule", "━━━━", [layout.label[0], layout.label[1] + 62, 330, 38], palette, {
          font: { family: "Inter", size: 26, weight: 900, color: palette.accent, lineHeight: 1.1 },
        }),
        killbox(
          "title",
          "title",
          layout.title,
          { family: "Inter", size: 74, weight: 900, color: palette.ink, lineHeight: 1.1 },
          { align: i % 4 === 0 ? "center" : "left" },
        ),
        killbox(
          "body",
          "text",
          layout.body,
          { family: "Inter", size: 45, weight: 650, color: palette.ink, lineHeight: 1.42 },
          {
            bg: i % 2 === 0 ? "rgba(255,255,255,.48)" : "rgba(255,255,255,.24)",
            radius: 28,
            bullet: true,
            maxChars: 760,
          },
        ),
      ],
    });
  }
  return templates;
}

function buildCards() {
  const cards = [];
  for (const [topicIndex, topic] of topics.entries()) {
    for (const variant of cardVariants(topic, topicIndex)) {
      cards.push({
        values: {
          title: variant.title,
          text: variant.text,
        },
        addedAt: CREATED_AT,
      });
    }
  }
  return cards;
}

const pack = {
  id: PACK_ID,
  owners: [1],
  createdBy: 1,
  name: "Психология каждый день",
  lang: "ru",
  templates: buildTemplates(),
  cards: buildCards(),
  createdAt: CREATED_AT,
  grants: [],
};

mkdirSync(resolve(ROOT, "data/packs"), { recursive: true });
writeFileSync(OUT_PACK, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`wrote ${OUT_PACK}: templates=${pack.templates.length}, cards=${pack.cards.length}`);

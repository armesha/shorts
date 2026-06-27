import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "data/packs");
const NOW = "2026-06-26T00:00:00.000Z";
const BACKGROUNDS = [
  "assets/template-packs/static-facts/backgrounds/facts-observatory.png",
  "assets/template-packs/static-facts/backgrounds/facts-studio.png",
  "assets/template-packs/static-facts/backgrounds/facts-desk.jpg",
];

const PACKS = [
  {
    id: "static-facts-en-superadmin",
    name: "Static Facts",
    lang: "en",
    src: "data/fact-videos/videos.json",
    label: "FACT",
  },
  {
    id: "static-facts-es-superadmin",
    name: "Datos estaticos",
    lang: "es",
    src: "data/fact-videos-es/videos.json",
    label: "DATO",
  },
  {
    id: "static-facts-ru-superadmin",
    name: "Статичные факты",
    lang: "ru",
    src: "data/fact-videos-ru/videos.json",
    label: "ФАКТ",
  },
  {
    id: "static-facts-de-superadmin",
    name: "Statische Fakten",
    lang: "de",
    src: "data/fact-videos-de/videos.json",
    label: "FAKT",
  },
];

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

function shortTitle(title, text) {
  const source = cleanText(title || text);
  if (source.length <= 92) return source;
  const cut = source.slice(0, 92);
  const boundary = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf(","));
  return `${cut.slice(0, boundary > 48 ? boundary : 92).trim()}...`;
}

function splitLeadingSentence(value) {
  const text = cleanText(value);
  const match = text.match(/^(.+?[.!?])\s+(.+)$/);
  if (!match) return { title: "", body: text };
  return {
    title: cleanText(match[1].replace(/[.!?]+$/, "")),
    body: cleanText(match[2]),
  };
}

function cardText(text, title) {
  const value = cleanText(text);
  const heading = cleanText(title);
  const withoutRepeatedTitle =
    heading && value.toLowerCase().startsWith(heading.toLowerCase())
      ? value.slice(heading.length).replace(/^[\s.:-]+/, "").trim()
      : value;
  const finalText = withoutRepeatedTitle || value;
  return finalText.length > 560 ? `${finalText.slice(0, 557).trim()}...` : finalText;
}

function textElement(id, x, y, w, h, text, color, size, weight = 800, align = "left") {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    rot: 0,
    text,
    align,
    font: { family: "Inter", size, weight, color, lineHeight: 1.08 },
  };
}

function killbox(id, role, x, y, w, h, opts = {}) {
  return {
    id,
    type: "killbox",
    x,
    y,
    w,
    h,
    rot: 0,
    role,
    padX: opts.padX ?? 0,
    padY: opts.padY ?? 0,
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    font: {
      family: "Inter",
      size: opts.size ?? 58,
      weight: opts.weight ?? 750,
      color: opts.color ?? "#101827",
      lineHeight: opts.lineHeight ?? 1.22,
    },
    fitMin: opts.fitMin ?? 30,
    fitMax: opts.fitMax ?? opts.size ?? 58,
    maxChars: opts.maxChars ?? 760,
    bullet: false,
    placeholder: role,
    ...(opts.bg ? { bg: opts.bg } : {}),
    ...(opts.border ? { border: opts.border } : {}),
    ...(opts.radius ? { radius: opts.radius } : {}),
    ...(opts.shadow ? { shadow: opts.shadow } : {}),
  };
}

function panel(id, x, y, w, h, bg, border, radius, shadow) {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    rot: 0,
    text: "",
    align: "left",
    bg,
    border,
    radius,
    shadow,
    font: { family: "Inter", size: 1, weight: 400, color: "#00000000", lineHeight: 1 },
  };
}

function image(id, src, opacity = 1) {
  return { id, type: "image", x: 0, y: 0, w: 1080, h: 1920, rot: 0, src, fit: "cover", opacity };
}

function template(name, bg, variant, label) {
  const dark = bg.includes("observatory");
  const ink = dark ? "#f8fbff" : "#101827";
  const accent = dark ? "#f6b85d" : variant % 2 ? "#e14f7b" : "#0f9d8a";
  const panelBg = dark ? "rgba(7,18,36,.74)" : "rgba(255,255,255,.82)";
  const panelBorder = dark ? "2px solid rgba(246,184,93,.48)" : "2px solid rgba(15,24,39,.12)";
  const shadow = dark ? "0 28px 90px rgba(0,0,0,.42)" : "0 28px 80px rgba(20,24,34,.16)";

  if (variant % 2 === 0) {
    return {
      version: 1,
      name,
      canvas: { w: 1080, h: 1920, bg: dark ? "#091222" : "#f8fafc" },
      elements: [
        image("bg", bg),
        panel("scrim", 74, 108, 932, 1660, panelBg, panelBorder, 42, shadow),
        textElement("label", 118, 158, 240, 58, label, accent, 32, 850),
        textElement("rule", 118, 210, 330, 36, "━━━━", accent, 26, 850),
        killbox("title", "title", 112, 304, 856, 330, {
          size: 76,
          fitMin: 44,
          fitMax: 84,
          maxChars: 110,
          color: ink,
          weight: 850,
          lineHeight: 1.08,
        }),
        killbox("text", "text", 128, 724, 824, 760, {
          size: 47,
          fitMin: 28,
          fitMax: 52,
          maxChars: 820,
          color: ink,
          weight: 650,
          lineHeight: 1.34,
          bg: dark ? "rgba(2,8,20,.36)" : "rgba(255,255,255,.58)",
          border: dark ? "1px solid rgba(255,255,255,.16)" : "1px solid rgba(15,24,39,.08)",
          radius: 28,
          shadow: dark ? "0 18px 54px rgba(0,0,0,.25)" : "0 18px 54px rgba(20,24,34,.10)",
          padX: 42,
          padY: 42,
        }),
      ],
    };
  }

  return {
    version: 1,
    name,
    canvas: { w: 1080, h: 1920, bg: dark ? "#091222" : "#f8fafc" },
    elements: [
      image("bg", bg),
      panel("scrim", 58, 132, 964, 1574, panelBg, panelBorder, 54, shadow),
      textElement("label", 134, 190, 260, 58, label, accent, 30, 850),
      killbox("title", "title", 134, 300, 812, 258, {
        size: 70,
        fitMin: 42,
        fitMax: 78,
        maxChars: 100,
        color: ink,
        weight: 850,
        lineHeight: 1.08,
      }),
      panel(
        "body-panel",
        116,
        650,
        848,
        720,
        dark ? "rgba(4,12,28,.46)" : "rgba(255,255,255,.66)",
        dark ? "1px solid rgba(255,255,255,.18)" : "1px solid rgba(15,24,39,.10)",
        36,
        dark ? "0 18px 60px rgba(0,0,0,.32)" : "0 18px 60px rgba(20,24,34,.12)",
      ),
      killbox("text", "text", 152, 704, 776, 590, {
        size: 50,
        fitMin: 29,
        fitMax: 54,
        maxChars: 760,
        color: ink,
        weight: 650,
        lineHeight: 1.3,
      }),
      textElement("rule", 152, 1414, 776, 44, "━━━━━━━━━━━━", accent, 28, 850, "center"),
    ],
  };
}

function buildPack(def) {
  const raw = JSON.parse(readFileSync(resolve(ROOT, def.src), "utf8"));
  const templates = BACKGROUNDS.flatMap((bg, index) => [
    template(`static-facts-${def.lang}-${index + 1}-classic`, bg, index * 2, def.label),
    template(`static-facts-${def.lang}-${index + 1}-panel`, bg, index * 2 + 1, def.label),
  ]);
  const cards = raw
    .map((item) => {
      const leading = splitLeadingSentence(item.text);
      const fullTitle = leading.title || cleanText(item.title);
      return {
        values: {
          title: shortTitle(fullTitle, item.text),
          text: cardText(leading.body || item.text, fullTitle),
        },
        addedAt: NOW,
      };
    })
    .filter((card) => card.values.title && card.values.text);

  return {
    id: def.id,
    owners: [1],
    createdBy: 1,
    name: def.name,
    lang: def.lang,
    templates,
    cards,
    createdAt: NOW,
    grants: [],
    rightsLedger: {
      status: "project_owned_text_with_fact_check_required",
      addedAt: "2026-06-27T07:55:00.000Z",
      note:
        def.lang === "es"
          ? "Spanish static fact card prose and templates are local/project-generated; factual claims need spot-checking before large expansions."
          : def.lang === "ru"
            ? "Russian static fact cards are localized from the existing Interesting Facts corpus; factual claims need spot-checking before large expansions."
            : def.lang === "de"
              ? "German static fact cards are localized from the existing Interesting Facts corpus; factual claims need spot-checking before large expansions."
          : "Static fact card prose and templates are local/project-generated; factual claims need spot-checking before large expansions.",
      templateAssets: "assets/template-packs/static-facts/backgrounds/* local project assets",
      rules: [
        "No AP/news imagery or unlicensed photos.",
        "Facts should be source-backed before large publication batches.",
        "Avoid medical/legal/financial instructions and unsafe experiments.",
      ],
    },
  };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const def of PACKS) {
  const pack = buildPack(def);
  const file = resolve(OUT_DIR, `${pack.id}.json`);
  writeFileSync(file, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`${pack.id}: templates=${pack.templates.length} cards=${pack.cards.length} -> ${file}`);
}

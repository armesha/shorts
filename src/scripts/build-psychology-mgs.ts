// Build the manual German pack "psychology mgs": 40 visual templates plus the current cards catalog.
// The script preserves an expanded cards.json instead of overwriting it with seed content.
// Run: node --import tsx src/scripts/build-psychology-mgs.ts
import puppeteer from "puppeteer-core";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromePath } from "../render.ts";
import { renderTemplateCard, type TemplateDoc, type TemplateElement } from "../template/render.ts";

const PACK_DIR = resolve("assets/template-packs/psychology-mgs");
const TEMPLATE_DIR = resolve(PACK_DIR, "templates");
const OUT_DIR = resolve("data/output/psychology-mgs");

type PackCard = { id?: number; theme?: string; template?: string; kind?: string; title: string; text: string[] };
type ColorSet = { key: string; hl: string; bg: string; ink: string; muted?: string };

// Visual guardrails for this pack:
// - title highlights are OK on the classic templates;
// - body/list text must stay calm and readable, never rendered as heavy color stripes.
// These checks intentionally make the build fail before bad templates reach Studio.
const MIN_HIGHLIGHT_CONTRAST = 4.5;

const CLASSIC: ColorSet[] = [
  { key: "lime", hl: "#aaff00", bg: "#fefff5", ink: "#141414" },
  { key: "yellow", hl: "#ffe000", bg: "#fffdf0", ink: "#16140a" },
  { key: "pink", hl: "#ff8fc4", bg: "#fff5fa", ink: "#2a0f1d" },
  { key: "cyan", hl: "#5fe6f0", bg: "#eefdff", ink: "#06303a" },
  { key: "orange", hl: "#ffa63d", bg: "#fff8f0", ink: "#2a1500" },
  { key: "violet", hl: "#c3a0ff", bg: "#f8f5ff", ink: "#1e0d3a" },
  { key: "mint", hl: "#7bffb0", bg: "#f1fff7", ink: "#06301c" },
  { key: "sky", hl: "#85bcff", bg: "#f3f9ff", ink: "#07204a" },
  { key: "coral", hl: "#ff7d6e", bg: "#fff6f4", ink: "#2a0a06" },
  { key: "dark", hl: "#c6ff00", bg: "#16171b", ink: "#f1f1ec" },
];

const EXTRA: Array<ColorSet & { family: "note" | "question" | "myth" | "micro" | "dark" | "ai"; label: string; bgImage?: string }> = [
  { key: "note-sage", family: "note", label: "MERKLISTE", hl: "#2f8f72", bg: "#eef7ef", ink: "#10241d", muted: "#6c8178" },
  { key: "note-rose", family: "note", label: "CHECK-IN", hl: "#d4547a", bg: "#fff1f5", ink: "#28121a", muted: "#8d6571" },
  { key: "note-amber", family: "note", label: "ALLTAG", hl: "#e2a020", bg: "#fff8e6", ink: "#271b05", muted: "#856b2a" },
  { key: "note-lilac", family: "note", label: "REFLEXION", hl: "#8b68d8", bg: "#f5f0ff", ink: "#1e1732", muted: "#766a90" },
  { key: "note-ice", family: "note", label: "RUHE", hl: "#2b9eb3", bg: "#ecfbff", ink: "#08252c", muted: "#5d7c83" },
  { key: "note-clay", family: "note", label: "GRENZEN", hl: "#c46639", bg: "#fff2ea", ink: "#2a1309", muted: "#8b6857" },
  { key: "question-black", family: "question", label: "FRAGE AN DICH", hl: "#ffffff", bg: "#111318", ink: "#f7f4ed", muted: "#aeb5c1" },
  { key: "question-blue", family: "question", label: "DENKPAUSE", hl: "#0e48ff", bg: "#f5f7ff", ink: "#08102b", muted: "#6b728c" },
  { key: "question-green", family: "question", label: "SELBSTCHECK", hl: "#0f7b57", bg: "#effaf4", ink: "#081f17", muted: "#617d70" },
  { key: "question-red", family: "question", label: "EHRLICH?", hl: "#d62c2c", bg: "#fff4ef", ink: "#2b0907", muted: "#9a6a62" },
  { key: "question-paper", family: "question", label: "JOURNAL", hl: "#111111", bg: "#fbf7ec", ink: "#17140f", muted: "#8a7e66" },
  { key: "question-plum", family: "question", label: "INNENBLICK", hl: "#6f2bbd", bg: "#f7f0fb", ink: "#24112f", muted: "#7d628b" },
  { key: "myth-yellow", family: "myth", label: "MYTHOS / FAKT", hl: "#ffe357", bg: "#171713", ink: "#f9f4dc", muted: "#c7bd83" },
  { key: "myth-mint", family: "myth", label: "UMDENKEN", hl: "#5de6a8", bg: "#10251d", ink: "#effff7", muted: "#99bea9" },
  { key: "myth-pink", family: "myth", label: "NEUER BLICK", hl: "#ff8ab8", bg: "#2a111d", ink: "#fff4f8", muted: "#d7a8ba" },
  { key: "myth-sky", family: "myth", label: "REFRAME", hl: "#7bc7ff", bg: "#0d1b2a", ink: "#edf7ff", muted: "#9bb7c9" },
  { key: "myth-orange", family: "myth", label: "STATT / LIEBER", hl: "#ff9f43", bg: "#23170d", ink: "#fff6ed", muted: "#d1a678" },
  { key: "myth-white", family: "myth", label: "KLARER DENKEN", hl: "#111111", bg: "#f7f7f2", ink: "#101010", muted: "#77776d" },
  { key: "micro-cobalt", family: "micro", label: "MIKRO-GEWOHNHEIT", hl: "#1746ff", bg: "#f0f4ff", ink: "#071133", muted: "#5c6686" },
  { key: "micro-grape", family: "micro", label: "3 MINUTEN", hl: "#7f35ff", bg: "#f7f1ff", ink: "#211133", muted: "#7d6798" },
  { key: "micro-sun", family: "micro", label: "KLEINER SCHRITT", hl: "#f7bd1e", bg: "#fff9e8", ink: "#261b04", muted: "#806d36" },
  { key: "micro-teal", family: "micro", label: "RESET", hl: "#1aa6a6", bg: "#edfbf9", ink: "#082a2a", muted: "#5e8584" },
  { key: "micro-rust", family: "micro", label: "HEUTE", hl: "#c24d2c", bg: "#fff1e9", ink: "#2d1208", muted: "#8b6452" },
  { key: "micro-ink", family: "micro", label: "MINI-TOOL", hl: "#f5f0df", bg: "#141414", ink: "#fbf8ed", muted: "#bdb6a0" },
  { key: "dark-grid", family: "dark", label: "KOPFSACHE", hl: "#b7ff35", bg: "#101216", ink: "#f4f7ee", muted: "#aab1a6" },
  { key: "dark-calm", family: "dark", label: "EMOTION", hl: "#76e4ff", bg: "#0b1b22", ink: "#effaff", muted: "#9bc4cf" },
  { key: "ai-collage", family: "ai", label: "CHECK-IN", hl: "#f16f6f", bg: "#ffffff", ink: "#172019", muted: "#5e6a63", bgImage: "ai-bg-01.jpg" },
  { key: "ai-map", family: "ai", label: "DENKMUSTER", hl: "#ffd166", bg: "#0c1020", ink: "#f9f3df", muted: "#c5c0aa", bgImage: "ai-bg-02.jpg" },
  { key: "ai-journal", family: "ai", label: "JOURNAL", hl: "#126a62", bg: "#fff9ef", ink: "#1d1911", muted: "#796c58", bgImage: "ai-bg-03.jpg" },
  { key: "ai-poster", family: "ai", label: "PSYCHOLOGIE", hl: "#1b45ff", bg: "#fbfbf5", ink: "#0d0f16", muted: "#565b67", bgImage: "ai-bg-04.jpg" },
];

const TEMPLATE_SPECS = [
  ...CLASSIC.map((c) => ({ ...c, family: "classic" as const, label: "PSYCHOLOGIE" })),
  ...EXTRA,
];

const SEED_CARDS: PackCard[] = [
  { title: "Anzeichen versteckter Erschöpfung", text: ["Ständige Gereiztheit", "Kleinigkeiten überfordern dich", "Schlaf erholt dich nicht mehr", "Freude fühlt sich gedämpft an", "Du sagst Treffen immer öfter ab", "Konzentration fällt dir schwer", "Du vergisst alltägliche Dinge", "Dein Körper fühlt sich schwer an", "Du funktionierst nur noch", "Eine innere Leere bleibt", "Lärm überfordert dich schnell", "Selbst Hobbys strengen dich an"] },
  { title: "Stille Zeichen von innerem Stress", text: ["Verspannte Schultern und Kiefer", "Flache, schnelle Atmung", "Du grübelst nachts stundenlang", "Ständiges Gefühl von Eile", "Dein Appetit verändert sich", "Du kannst schlecht abschalten", "Kleine Geräusche nerven dich", "Dir fehlt die innere Ruhe", "Du vergisst zu essen und trinken", "Aufschieben trotz Zeitdruck", "Häufige Kopfschmerzen", "Entspannung fühlt sich falsch an"] },
  { title: "Gewohnheiten, die Angst verstärken", text: ["Ständig Nachrichten checken", "Zu wenig Schlaf", "Alles im Kopf durchspielen", "Koffein am späten Nachmittag", "Gefühle ständig unterdrücken", "Sich mit anderen vergleichen", "Perfektionismus bei allem", "Hilfe nie annehmen", "Pausen als Faulheit sehen", "Probleme nur allein lösen", "Negatives immer wiederholen", "Bewegung komplett meiden"] },
];

const textEl = (id: string, text: string, x: number, y: number, w: number, h: number, size: number, color: string, weight = 800, align: "left" | "center" | "right" = "left", extra: Record<string, unknown> = {}): TemplateElement => ({
  id,
  type: "text",
  x,
  y,
  w,
  h,
  rot: 0,
  text,
  align,
  font: { family: "Inter", size, weight, color, lineHeight: 1.1 },
  ...extra,
});

const killbox = (id: string, role: string, x: number, y: number, w: number, h: number, font: TemplateElement["font"], extra: Record<string, unknown> = {}): TemplateElement => ({
  id,
  type: "killbox",
  x,
  y,
  w,
  h,
  rot: 0,
  role,
  padX: 0,
  padY: 0,
  align: "left",
  valign: "top",
  font,
  fitMin: 28,
  fitMax: font?.size ?? 58,
  maxChars: role === "title" ? 68 : 760,
  bullet: role === "text",
  placeholder: role === "title" ? "Titel" : "Text",
  ...extra,
});

const bgImage = (file: string): TemplateElement => ({
  id: "bg-image",
  type: "image",
  x: 0,
  y: 0,
  w: 1080,
  h: 1920,
  rot: 0,
  src: `assets/template-packs/psychology-mgs/backgrounds/${file}`,
  fit: "cover",
});

function parseHexColor(color: unknown): [number, number, number] | null {
  if (typeof color !== "string") return null;
  const raw = color.trim();
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!match) return null;
  const hex = match[1].length === 3
    ? match[1].split("").map((ch) => ch + ch).join("")
    : match[1];
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function validateTemplateSafety(tpl: TemplateDoc) {
  for (const el of tpl.elements) {
    if (el.type !== "killbox") continue;
    if (el.role !== "title" && el.highlight) {
      throw new Error(`${tpl.name}/${el.id}: body highlights are blocked; use a calm panel or plain text instead`);
    }
    const textColor = parseHexColor(el.font?.color);
    const highlight = parseHexColor(el.highlight);
    if (textColor && highlight && contrastRatio(textColor, highlight) < MIN_HIGHLIGHT_CONTRAST) {
      throw new Error(`${tpl.name}/${el.id}: insufficient text/highlight contrast`);
    }
  }
}

function makeClassicTemplate(c: ColorSet): TemplateDoc {
  return {
    version: 1,
    name: `psychology-mgs-${c.key}`,
    canvas: { w: 1080, h: 1920, bg: c.bg },
    elements: [
      textEl("pin", "📌", 70, 140, 130, 130, 104, c.ink, 400),
      killbox("title", "title", 70, 290, 940, 340, { family: "Inter", size: 96, weight: 800, color: "#141414", lineHeight: 1.5 }, {
        padX: 4,
        fitMin: 54,
        fitMax: 108,
        maxChars: 68,
        highlight: c.hl,
        underline: true,
      }),
      killbox("body", "text", 84, 690, 912, 1150, { family: "Inter", size: 52, weight: 500, color: c.ink, lineHeight: 1.5 }, {
        padX: 6,
        fitMin: 30,
        fitMax: 60,
        maxChars: 760,
        bullet: true,
      }),
    ],
  };
}

function makeTemplate(spec: (typeof TEMPLATE_SPECS)[number]): TemplateDoc {
  if (spec.family === "classic") return makeClassicTemplate(spec);
  if (spec.family === "note") {
    return {
      version: 1,
      name: `psychology-mgs-${spec.key}`,
      canvas: { w: 1080, h: 1920, bg: spec.bg },
      elements: [
        textEl("label", spec.label, 74, 104, 520, 64, 32, spec.hl, 800),
        textEl("rule", "━━━━", 74, 170, 360, 38, 28, spec.hl, 800),
        killbox("title", "title", 74, 238, 910, 330, { family: "Montserrat", size: 82, weight: 800, color: spec.ink, lineHeight: 1.12 }, {
          fitMin: 44,
          fitMax: 88,
          bullet: false,
          maxChars: 68,
        }),
        killbox("body", "text", 92, 650, 880, 1010, { family: "Inter", size: 45, weight: 600, color: spec.ink, lineHeight: 1.5 }, {
          padX: 34,
          padY: 36,
          fitMin: 28,
          fitMax: 52,
          maxChars: 760,
          bullet: true,
          bg: "#ffffffb8",
          border: `2px solid ${spec.hl}55`,
          radius: 28,
          shadow: "0 24px 60px rgba(0,0,0,.10)",
        }),
      ],
    };
  }
  if (spec.family === "question") {
    return {
      version: 1,
      name: `psychology-mgs-${spec.key}`,
      canvas: { w: 1080, h: 1920, bg: spec.bg },
      elements: [
        textEl("label", spec.label, 82, 130, 916, 56, 30, spec.muted ?? spec.ink, 800, "center"),
        killbox("title", "title", 104, 245, 872, 405, { family: "Playfair Display", size: 94, weight: 800, color: spec.ink, lineHeight: 1.1 }, {
          fitMin: 48,
          fitMax: 100,
          align: "center",
          maxChars: 68,
          bullet: false,
        }),
        textEl("mark", "?", 405, 632, 270, 240, 206, spec.hl, 800, "center", { opacity: 0.18 }),
        killbox("body", "text", 128, 790, 824, 830, { family: "Inter", size: 48, weight: 600, color: spec.ink, lineHeight: 1.55 }, {
          fitMin: 30,
          fitMax: 56,
          maxChars: 760,
          bullet: false,
          align: "center",
        }),
      ],
    };
  }
  if (spec.family === "myth") {
    return {
      version: 1,
      name: `psychology-mgs-${spec.key}`,
      canvas: { w: 1080, h: 1920, bg: spec.bg },
      elements: [
        textEl("label", spec.label, 76, 104, 540, 60, 30, spec.hl, 900),
        killbox("title", "title", 76, 218, 928, 300, { family: "Inter", size: 82, weight: 800, color: spec.ink, lineHeight: 1.12 }, {
          fitMin: 44,
          fitMax: 88,
          maxChars: 68,
          bullet: false,
        }),
        killbox("body", "text", 86, 610, 908, 990, { family: "Inter", size: 42, weight: 650, color: spec.ink, lineHeight: 1.36 }, {
          padX: 32,
          padY: 30,
          fitMin: 24,
          fitMax: 44,
          maxChars: 690,
          bullet: false,
          bg: spec.bg === "#f7f7f2" ? "rgba(255,255,255,.50)" : "rgba(255,255,255,.07)",
          border: `1px solid ${spec.hl}55`,
          radius: 24,
        }),
      ],
    };
  }
  if (spec.family === "micro") {
    return {
      version: 1,
      name: `psychology-mgs-${spec.key}`,
      canvas: { w: 1080, h: 1920, bg: spec.bg },
      elements: [
        textEl("top", spec.label, 72, 105, 460, 54, 28, spec.muted ?? spec.ink, 800),
        textEl("number", "01", 760, 92, 240, 140, 116, spec.hl, 900, "right", { opacity: 0.88 }),
        killbox("title", "title", 70, 250, 940, 330, { family: "Montserrat", size: 82, weight: 800, color: spec.ink, lineHeight: 1.08 }, {
          fitMin: 42,
          fitMax: 88,
          maxChars: 68,
          bullet: false,
        }),
        killbox("body", "text", 88, 675, 904, 920, { family: "Inter", size: 47, weight: 700, color: spec.ink, lineHeight: 1.5 }, {
          fitMin: 29,
          fitMax: 54,
          maxChars: 760,
          bullet: true,
          bg: "#ffffff00",
        }),
        textEl("bar", "━━━━━━━━━━━━━━━━━━━━", 88, 1640, 904, 44, 28, spec.hl, 900, "center"),
      ],
    };
  }
  if (spec.family === "dark") {
    return {
      version: 1,
      name: `psychology-mgs-${spec.key}`,
      canvas: { w: 1080, h: 1920, bg: spec.bg },
      elements: [
        textEl("label", spec.label, 74, 108, 500, 58, 30, spec.hl, 900),
        textEl("grid", "╱╲╱╲╱╲", 640, 110, 360, 80, 54, spec.hl, 600, "right", { opacity: 0.25 }),
        killbox("title", "title", 74, 250, 930, 320, { family: "Inter", size: 90, weight: 800, color: spec.ink, lineHeight: 1.04 }, {
          fitMin: 46,
          fitMax: 96,
          maxChars: 68,
          bullet: false,
        }),
        killbox("body", "text", 86, 650, 908, 920, { family: "Inter", size: 47, weight: 600, color: spec.ink, lineHeight: 1.48 }, {
          padX: 34,
          padY: 34,
          fitMin: 29,
          fitMax: 54,
          maxChars: 760,
          bullet: true,
          bg: "rgba(255,255,255,.08)",
          border: `1px solid ${spec.hl}66`,
          radius: 24,
        }),
      ],
    };
  }

  return {
    version: 1,
    name: `psychology-mgs-${spec.key}`,
    canvas: { w: 1080, h: 1920, bg: spec.bg },
    elements: [
      ...(spec.bgImage ? [bgImage(spec.bgImage)] : []),
      { id: "wash", type: "text", x: 64, y: 94, w: 952, h: 1540, rot: 0, text: "", align: "left", bg: spec.bg === "#0c1020" ? "rgba(8,10,18,.62)" : "rgba(255,255,255,.76)", radius: 34, shadow: "0 28px 80px rgba(0,0,0,.18)", font: { family: "Inter", size: 1, weight: 400, color: spec.ink, lineHeight: 1 } },
      textEl("label", spec.label, 108, 140, 780, 56, 29, spec.hl, 900),
      killbox("title", "title", 108, 230, 840, 340, { family: "Inter", size: 84, weight: 800, color: spec.ink, lineHeight: 1.1 }, {
        fitMin: 44,
        fitMax: 90,
        maxChars: 68,
        bullet: false,
      }),
      killbox("body", "text", 118, 650, 820, 875, { family: "Inter", size: 46, weight: 650, color: spec.ink, lineHeight: 1.48 }, {
        fitMin: 28,
        fitMax: 54,
        maxChars: 760,
        bullet: spec.key !== "ai-journal",
      }),
    ],
  };
}

async function loadCards(): Promise<PackCard[]> {
  try {
    const cards = JSON.parse(await readFile(resolve(PACK_DIR, "cards.json"), "utf8")) as PackCard[];
    if (Array.isArray(cards) && cards.length) return cards;
  } catch {
    // First run: fall back to the built-in seed cards above.
  }
  return SEED_CARDS.map((c, i) => ({ id: i + 1, theme: TEMPLATE_SPECS[i % TEMPLATE_SPECS.length].key, template: TEMPLATE_SPECS[i % TEMPLATE_SPECS.length].key, title: c.title, text: c.text }));
}

async function clearTemplates() {
  await mkdir(TEMPLATE_DIR, { recursive: true });
  for (const f of await readdir(TEMPLATE_DIR)) {
    if (f.endsWith(".json")) await unlink(resolve(TEMPLATE_DIR, f));
  }
}

async function main() {
  await mkdir(TEMPLATE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  await clearTemplates();

  const templates = TEMPLATE_SPECS.map(makeTemplate);
  templates.forEach(validateTemplateSafety);
  const cards = (await loadCards()).map((c, i) => ({
    id: i + 1,
    theme: c.theme || c.template || TEMPLATE_SPECS[i % TEMPLATE_SPECS.length].key,
    template: c.template || TEMPLATE_SPECS[i % TEMPLATE_SPECS.length].key,
    kind: c.kind,
    title: c.title,
    text: c.text,
  }));
  await writeFile(resolve(PACK_DIR, "cards.json"), JSON.stringify(cards, null, 2) + "\n");

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  try {
    for (let i = 0; i < templates.length; i++) {
      const spec = TEMPLATE_SPECS[i];
      const tpl = templates[i];
      const card = cards.find((c) => c.template === spec.key) ?? cards[i] ?? cards[0];
      const nn = String(i + 1).padStart(2, "0");
      await writeFile(resolve(TEMPLATE_DIR, `${nn}-${spec.key}.json`), JSON.stringify(tpl, null, 2) + "\n");
      const out = resolve(OUT_DIR, `${nn}-${spec.key}.png`);
      const t0 = Date.now();
      await renderTemplateCard(tpl, { title: card.title, text: card.text }, out, browser);
      console.log(`${nn} ${spec.key.padEnd(18)} ${String(card.kind ?? "").padEnd(12)} ${card.title.slice(0, 34).padEnd(34)} ${Date.now() - t0}ms`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\nшаблоны: ${templates.length} -> ${TEMPLATE_DIR}/`);
  console.log(`карточки: ${cards.length} -> ${resolve(PACK_DIR, "cards.json")}`);
  console.log(`превью -> ${OUT_DIR}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

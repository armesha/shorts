// Single source of truth for the German-psychology card format (the "standard").
// Used by BOTH the upload validator (src/psych/cards-store.ts) and the UI instruction panel
// (served verbatim at GET /api/psych/cards/schema → web/src/pages/Cards.tsx). Keep the limits
// in sync with templates/psych.html auto-fit so anything that validates also renders cleanly.

export interface PatternFieldSpec {
  /** Key in the item object, e.g. "lead". */
  key: string;
  /** Human label (RU) for the instruction panel. */
  label: string;
  /** Max characters (hard validation cap). */
  max: number;
  /** Whether the field must be present & non-empty. */
  required: boolean;
}

export interface PatternSpec {
  /** Pattern id stored in card.pattern. */
  id: string;
  /** Human label (RU) for the UI. */
  label: string;
  /** When to use it (RU, one line). */
  desc: string;
  /** Item fields and their caps. */
  itemFields: PatternFieldSpec[];
  /** A short ready example item (the shape the LLM should emit). */
  exampleItem: Record<string, string>;
}

/** The 8 supported layouts (must match itemsHtml() in src/psych/render.ts). */
export const PSYCH_PATTERNS: PatternSpec[] = [
  {
    id: "numbered",
    label: "Нумерованный (lead + текст)",
    desc: "Список «N. Жирный термин — пояснение». Признаки, шаги, типы.",
    itemFields: [
      { key: "lead", label: "Термин (жирный)", max: 48, required: true },
      { key: "text", label: "Пояснение", max: 170, required: true },
    ],
    exampleItem: { lead: "Love-Bombing", text: "Intensive Aufmerksamkeit am Anfang, dann abrupt weg." },
  },
  {
    id: "numbered_tight",
    label: "Нумерованный плотный",
    desc: "То же, но компактнее — когда пунктов много (6–10).",
    itemFields: [
      { key: "lead", label: "Термин (жирный)", max: 48, required: true },
      { key: "text", label: "Пояснение", max: 170, required: true },
    ],
    exampleItem: { lead: "Der Glaube:", text: "Fehler machen dich unwürdig" },
  },
  {
    id: "bullet",
    label: "Маркированный (только текст)",
    desc: "Список «• фраза». Тезисы, наблюдения одной строкой.",
    itemFields: [{ key: "text", label: "Текст пункта", max: 170, required: true }],
    exampleItem: { text: "Perfektionismus ist Depression, die hart arbeitet" },
  },
  {
    id: "premium",
    label: "Премиум (крупные тезисы)",
    desc: "Как маркированный, но крупнее; обычно с финальной строкой outro.",
    itemFields: [{ key: "text", label: "Текст пункта", max: 170, required: true }],
    exampleItem: { text: "Angst will nicht weg — sie will gehört werden." },
  },
  {
    id: "bullet_color",
    label: "Цветной lead + текст",
    desc: "«Цветной термин – пояснение». Контраст важной части и расшифровки.",
    itemFields: [
      { key: "lead", label: "Термин (цветной)", max: 48, required: true },
      { key: "text", label: "Пояснение", max: 170, required: true },
    ],
    exampleItem: { lead: "Ständige Anspannung", text: "dein Nervensystem glaubt, du bist in Gefahr" },
  },
  {
    id: "term",
    label: "Термин — значение",
    desc: "«Термин — значение». Понятия и их короткие определения.",
    itemFields: [
      { key: "term", label: "Термин", max: 52, required: true },
      { key: "val", label: "Значение", max: 170, required: true },
    ],
    exampleItem: { term: "Primärer Überlebenscode", val: "Ablehnung = früher sozial = tot." },
  },
  {
    id: "myth",
    label: "Миф / Правда",
    desc: "Пара «Mythos — … / Wahrheit — …». Развенчание заблуждений.",
    itemFields: [
      { key: "myth", label: "Миф", max: 150, required: true },
      { key: "real", label: "Правда", max: 150, required: true },
    ],
    exampleItem: {
      myth: "Je älter du wirst, desto weniger verletzlich.",
      real: "Zurückweisung tut genauso weh wie mit 8 Jahren.",
    },
  },
  {
    id: "quote",
    label: "Цитаты",
    desc: "«N. «цитата» — автор». Подборка цитат по теме.",
    itemFields: [
      { key: "quote", label: "Цитата", max: 170, required: true },
      { key: "author", label: "Автор", max: 48, required: true },
    ],
    exampleItem: { quote: "Mut bedeutet, sich trotz Angst zu bewegen.", author: "Alfred Adler" },
  },
];

export const PSYCH_PATTERN_IDS: ReadonlySet<string> = new Set(PSYCH_PATTERNS.map((p) => p.id));

/** Global structural limits (mirror templates/psych.html auto-fit + the existing 1012-card style). */
export const PSYCH_LIMITS = {
  /** Heading: EXACTLY 2 short lines (the red brush is sized for two), each ≤ maxLineChars. */
  titleLines: { min: 2, max: 2, maxLineChars: 48 },
  /** Items per card: 3–10 (existing deck is 7–10; auto-fit shrinks body to ≥22px). */
  items: { min: 3, max: 10 },
  /** Optional closing call-to-action under a divider. */
  outroMax: 150,
} as const;

/** Compact machine description of the format (returned by the schema route for the UI panel). */
export interface PsychSchema {
  patterns: PatternSpec[];
  limits: typeof PSYCH_LIMITS;
}

export function psychSchema(): PsychSchema {
  return { patterns: PSYCH_PATTERNS, limits: PSYCH_LIMITS };
}

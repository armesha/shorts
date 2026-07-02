// Разбор «человеческих» файлов с карточками (текст/JSON) + проверка лимитов шаблона.
// Формат текста: карточки разделяются пустой строкой или строкой "---";
// первая строка карточки — заголовок, остальные строки — текст.
import type { CreatorRecord } from "./types";

export type ImportedCard = {
  title: string;
  text: string;
  narration?: string;
};

export type CardLimits = {
  titleMin: number;
  titleMax: number;
  textMin: number;
  textMax: number;
};

export type CardIssue = { key: string; vars?: Record<string, string | number> };

export type ParsedEntry = {
  card: ImportedCard;
  issues: CardIssue[];
};

export type ParsedImport = {
  entries: ParsedEntry[];
  format: "json" | "text" | "empty" | "invalid-json";
};

export const DEFAULT_LIMITS: CardLimits = { titleMin: 1, titleMax: 72, textMin: 1, textMax: 420 };

type RoleRuleLike = { role?: unknown; min?: unknown; max?: unknown };
type TemplateElementLike = {
  type?: unknown;
  role?: unknown;
  w?: unknown;
  h?: unknown;
  padX?: unknown;
  padY?: unknown;
  fitMin?: unknown;
  maxChars?: unknown;
  minChars?: unknown;
  bullet?: unknown;
  font?: { lineHeight?: unknown };
};

const TITLE_ROLES = new Set(["title", "heading", "hook"]);
const TEXT_ROLES = new Set(["text", "body", "fact", "points", "items"]);
const META_ROLES = new Set(["source", "cta", "badge"]);

/** Лимиты для формы/импорта из правил шаблона (роли source/cta/badge сервер заполняет сам). */
export function limitsFromRules(rules: unknown): CardLimits {
  const out = { ...DEFAULT_LIMITS };
  if (!Array.isArray(rules)) return out;
  for (const raw of rules as RoleRuleLike[]) {
    const role = String(raw?.role ?? "").toLowerCase();
    if (META_ROLES.has(role)) continue;
    const min = Math.max(0, Math.round(Number(raw?.min) || 0));
    const max = Math.round(Number(raw?.max) || 0);
    if (TITLE_ROLES.has(role)) {
      out.titleMin = Math.max(1, min);
      if (max > 0) out.titleMax = max;
    } else if (TEXT_ROLES.has(role)) {
      out.textMin = Math.max(1, min);
      if (max > 0) out.textMax = max;
    }
  }
  return out;
}

function estimateCapacity(el: TemplateElementLike): number {
  const fitMin = Math.max(8, Number(el.fitMin) || 24);
  const lineHeight = Number(el.font?.lineHeight) || 1.2;
  const padX = Number(el.padX) || 0;
  const padY = Number(el.padY) || 0;
  const width = Math.max(0, (Number(el.w) || 0) - 2 * padX);
  const height = Math.max(0, (Number(el.h) || 0) - 2 * padY);
  const lines = Math.max(1, Math.floor(height / (fitMin * lineHeight)));
  const charsPerLine = Math.max(1, Math.floor(width / (0.52 * fitMin)));
  return Math.max(1, Math.floor(lines * charsPerLine * 0.9));
}

export function limitsFromTemplate(template: unknown): CardLimits {
  const elements = Array.isArray((template as { elements?: unknown })?.elements)
    ? ((template as { elements: TemplateElementLike[] }).elements)
    : [];
  const rules = elements
    .filter((el) => String(el.type ?? "") === "killbox" && String(el.role ?? "").trim())
    .map((el) => ({
      role: String(el.role ?? ""),
      min: Math.max(0, Math.round(Number(el.minChars) || 0)),
      max: Number(el.maxChars) && Number(el.maxChars) > 0 ? Math.round(Number(el.maxChars)) : estimateCapacity(el),
    }));
  return limitsFromRules(rules);
}

export function validateImportedCard(card: ImportedCard, limits: CardLimits): CardIssue[] {
  const issues: CardIssue[] = [];
  const title = card.title.trim();
  const text = card.text.trim();
  if (!title) issues.push({ key: "creator.importErrNoTitle" });
  else if (title.length < limits.titleMin) issues.push({ key: "creator.importErrTitleShort", vars: { len: title.length, min: limits.titleMin } });
  else if (title.length > limits.titleMax) issues.push({ key: "creator.importErrTitleLong", vars: { len: title.length, max: limits.titleMax } });
  if (!text) issues.push({ key: "creator.importErrNoText" });
  else if (text.length < limits.textMin) issues.push({ key: "creator.importErrTextShort", vars: { len: text.length, min: limits.textMin } });
  else if (text.length > limits.textMax) issues.push({ key: "creator.importErrTextLong", vars: { len: text.length, max: limits.textMax } });
  return issues;
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n");
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function cardFromJsonEntry(raw: unknown): ImportedCard {
  if (typeof raw === "string") {
    return splitTextBlock(raw);
  }
  const src = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as CreatorRecord;
  const values = (src.values && typeof src.values === "object" && !Array.isArray(src.values) ? src.values : src) as CreatorRecord;
  const title = asText(values.title ?? values.heading ?? values.hook).trim();
  const text = asText(values.text ?? values.body ?? values.fact ?? values.points ?? values.items).trim();
  const narration = asText(src.narration ?? values.narration).trim();
  return { title, text, ...(narration ? { narration } : {}) };
}

function splitTextBlock(block: string): ImportedCard {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = (lines[0] ?? "").replace(/^\d+[.)]\s*/, "").trim();
  const text = lines.slice(1).join("\n").trim();
  return { title, text };
}

/** Разобрать вставленный текст или файл: сначала пробуем JSON, иначе текстовые блоки. */
export function parseImport(raw: string, limits: CardLimits): ParsedImport {
  const source = raw.replace(/^﻿/, "").trim();
  if (!source) return { entries: [], format: "empty" };

  if (/^[[{]/.test(source)) {
    try {
      const parsed = JSON.parse(source) as unknown;
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const entries = list.map((item) => {
        const card = cardFromJsonEntry(item);
        return { card, issues: validateImportedCard(card, limits) };
      });
      return { entries, format: "json" };
    } catch {
      return { entries: [], format: "invalid-json" };
    }
  }

  const blocks = source
    .split(/\r?\n\s*(?:---+\s*)?\r?\n|\r?\n---+\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const entries = blocks.map((block) => {
    const card = splitTextBlock(block);
    return { card, issues: validateImportedCard(card, limits) };
  });
  return { entries, format: "text" };
}

/** Payload для POST /creator/packs/:id/cards. */
export function toCardPayload(card: ImportedCard, templateIndex?: number): CreatorRecord {
  return {
    values: { title: card.title.trim(), text: card.text.trim() },
    ...(card.narration?.trim() ? { narration: card.narration.trim() } : {}),
    ...(Number.isInteger(templateIndex) ? { templateIndex } : {}),
  };
}

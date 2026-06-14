// Validate + append + browse for user-uploaded German-psychology cards.
// Cards live in data/psych/cards.json (git-tracked, pretty-printed 2-space). Uploads are stamped
// with theme/addedAt/source and appended atomically, then the library cache is busted so the new
// cards go live WITHOUT a server restart. Validation enforces src/psych/schema.ts so anything that
// passes also renders cleanly via templates/psych.html.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resetDeckCache } from "../anecdotes/library.ts";
import { PSYCH_PATTERNS, PSYCH_PATTERN_IDS, PSYCH_LIMITS } from "./schema.ts";

const CARDS_FILE = resolve(process.cwd(), "data/psych/cards.json");

export interface PsychCardInput {
  pattern: string;
  title_lines: string[];
  items: Record<string, string>[];
  outro?: string;
}

export interface StoredPsychCard extends PsychCardInput {
  /** Topic tag (from the upload form or the card itself). */
  theme?: string;
  /** ISO timestamp set on upload (absent on the original seed cards). */
  addedAt?: string;
  /** "upload" for user-added cards; absent on the seed cards. */
  source?: string;
}

export interface CardError {
  index: number; // position in the submitted batch (0-based)
  messages: string[];
}

export interface ValidationResult {
  cards: StoredPsychCard[]; // clean, ready-to-store cards (only the valid ones)
  errors: CardError[];
  parsed: number; // how many entries were found in the input
}

const isStr = (v: unknown): v is string => typeof v === "string";
const fieldSpec = (pattern: string) => PSYCH_PATTERNS.find((p) => p.id === pattern);

/** Read the whole deck (seed + uploaded). Returns [] if the file is missing/corrupt. */
export function readAllCards(file: string = CARDS_FILE): StoredPsychCard[] {
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(data) ? (data as StoredPsychCard[]) : [];
  } catch {
    return [];
  }
}

/** Validate one entry against the standard; return a CLEAN card (only known fields) or messages. */
function validateOne(raw: unknown, index: number): { card?: StoredPsychCard; messages: string[] } {
  const m: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { messages: [`#${index + 1}: карточка должна быть JSON-объектом`] };
  }
  const c = raw as Record<string, unknown>;

  // pattern
  const pattern = c.pattern;
  if (!isStr(pattern) || !PSYCH_PATTERN_IDS.has(pattern)) {
    m.push(
      `#${index + 1}: pattern «${String(pattern)}» неизвестен (допустимо: ${[...PSYCH_PATTERN_IDS].join(", ")})`,
    );
  }

  // title_lines — exactly 2 short non-empty lines
  const tl = c.title_lines;
  const { min: tMin, max: tMax, maxLineChars } = PSYCH_LIMITS.titleLines;
  if (!Array.isArray(tl) || tl.length < tMin || tl.length > tMax) {
    m.push(`#${index + 1}: title_lines должен быть массивом из ${tMin === tMax ? tMin : `${tMin}–${tMax}`} строк`);
  } else {
    tl.forEach((line, i) => {
      if (!isStr(line) || !line.trim()) m.push(`#${index + 1}: title_lines[${i}] пустой`);
      else if (line.length > maxLineChars)
        m.push(`#${index + 1}: title_lines[${i}] длиннее ${maxLineChars} символов (${line.length})`);
    });
  }

  // items — count + per-field shape for the pattern
  const items = c.items;
  const spec = isStr(pattern) ? fieldSpec(pattern) : undefined;
  const cleanItems: Record<string, string>[] = [];
  const { min: iMin, max: iMax } = PSYCH_LIMITS.items;
  if (!Array.isArray(items) || items.length < iMin || items.length > iMax) {
    m.push(`#${index + 1}: items должен быть массивом из ${iMin}–${iMax} пунктов (сейчас ${Array.isArray(items) ? items.length : "не массив"})`);
  } else if (spec) {
    items.forEach((it, i) => {
      if (typeof it !== "object" || it === null) {
        m.push(`#${index + 1}: пункт ${i + 1} не объект`);
        return;
      }
      const obj = it as Record<string, unknown>;
      const clean: Record<string, string> = {};
      for (const f of spec.itemFields) {
        const val = obj[f.key];
        if (f.required && (!isStr(val) || !val.trim())) {
          m.push(`#${index + 1}: пункт ${i + 1} — нет поля «${f.key}» (${f.label})`);
        } else if (isStr(val)) {
          if (val.length > f.max)
            m.push(`#${index + 1}: пункт ${i + 1} — поле «${f.key}» длиннее ${f.max} (${val.length})`);
          clean[f.key] = val;
        }
      }
      cleanItems.push(clean);
    });
  }

  // outro — optional
  let outro = "";
  if (c.outro !== undefined && c.outro !== null && c.outro !== "") {
    if (!isStr(c.outro)) m.push(`#${index + 1}: outro должен быть строкой`);
    else if (c.outro.length > PSYCH_LIMITS.outroMax)
      m.push(`#${index + 1}: outro длиннее ${PSYCH_LIMITS.outroMax} символов`);
    else outro = c.outro;
  }

  // theme — optional, carried from the card if present (form theme is applied later)
  let theme: string | undefined;
  if (isStr(c.theme) && c.theme.trim()) {
    theme = c.theme.trim().slice(0, PSYCH_LIMITS.themeMax);
  }

  if (m.length) return { messages: m };
  const card: StoredPsychCard = {
    pattern: pattern as string,
    title_lines: (tl as string[]).map((s) => s),
    items: cleanItems,
  };
  if (outro) card.outro = outro;
  if (theme) card.theme = theme;
  return { card, messages: [] };
}

/** Normalize the submitted payload (array | single object | JSON string) into an array of entries. */
function toEntries(input: unknown): unknown[] {
  if (typeof input === "string") {
    const parsed = JSON.parse(input); // caller catches SyntaxError
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") return [input];
  return [];
}

/** Validate a batch. Throws SyntaxError if `input` is an unparseable string. */
export function validateBatch(input: unknown): ValidationResult {
  const entries = toEntries(input);
  const cards: StoredPsychCard[] = [];
  const errors: CardError[] = [];
  entries.forEach((e, i) => {
    const { card, messages } = validateOne(e, i);
    if (card) cards.push(card);
    else errors.push({ index: i, messages });
  });
  return { cards, errors, parsed: entries.length };
}

/** Append validated cards (stamped with theme/addedAt/source) atomically; bust the library cache. */
export function appendCards(
  cards: StoredPsychCard[],
  theme: string | undefined,
  file: string = CARDS_FILE,
  now: string = new Date().toISOString(),
): { added: number; total: number } {
  const all = readAllCards(file);
  const t = theme?.trim().slice(0, PSYCH_LIMITS.themeMax) || undefined;
  const stamped = cards.map((c) => {
    const card: StoredPsychCard = { ...c, addedAt: now, source: "upload" };
    const th = c.theme || t;
    if (th) card.theme = th;
    return card;
  });
  all.push(...stamped);
  // Atomic write: temp + rename so a crash can't truncate the tracked deck file.
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(all, null, 2));
  renameSync(tmp, file);
  resetDeckCache("psych"); // new cards become pickable without a server restart
  return { added: stamped.length, total: all.length };
}

export interface ListResult {
  items: { index: number; card: StoredPsychCard }[];
  total: number; // total cards matching the filter
  page: number;
  pageSize: number;
}

/**
 * Browse cards newest-first. `onlyUploaded` (default) shows just user-added cards (source==="upload"),
 * sorted by addedAt desc; otherwise shows the whole deck with uploaded cards on top.
 */
export function listCards(
  opts: { page?: number; pageSize?: number; onlyUploaded?: boolean; theme?: string },
  file: string = CARDS_FILE,
): ListResult {
  const all = readAllCards(file);
  const onlyUploaded = opts.onlyUploaded !== false;
  const themeFilter = opts.theme?.trim().toLowerCase();
  // Keep the original index so the UI can render/preview the exact card.
  let rows = all.map((card, index) => ({ index, card }));
  if (onlyUploaded) rows = rows.filter((r) => r.card.source === "upload");
  if (themeFilter) rows = rows.filter((r) => (r.card.theme ?? "").toLowerCase().includes(themeFilter));
  // Newest first: by addedAt desc (undated seed cards last), tie-break by index desc.
  rows.sort((a, b) => {
    const ta = a.card.addedAt ?? "";
    const tb = b.card.addedAt ?? "";
    if (ta !== tb) return ta < tb ? 1 : -1;
    return b.index - a.index;
  });
  const total = rows.length;
  const pageSize = Math.min(50, Math.max(1, Math.floor(opts.pageSize || 12)));
  const page = Math.max(1, Math.floor(opts.page || 1));
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total, page, pageSize };
}

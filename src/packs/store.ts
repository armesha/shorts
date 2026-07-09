// ============== Хранилище кастомных («ручных») паков ==============
//
// Пак = {имя, язык, шаблон(ы) из редактора, карточки[]}. Каждый пак — отдельный JSON-файл в
// data/packs/<id>.json (data/ gitignored — это пользовательский контент, как app.db). Изоляция
// по владельцу (userId): список/чтение/правки видят только свои паки.
//
// «Правила» добавления карточек НЕ хардкодятся (как у psych), а ВЫВОДЯТСЯ из шаблона: роли килбоксов
// + min/max символов (minChars / maxChars; при maxChars=0 — авто-ёмкость по геометрии и fitMin) +
// признак списка (bullet). Карточка = {role → значение} — ровно то, что ест renderTemplateCard.
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { resolve } from "node:path";

const PACKS_DIR = resolve(process.cwd(), "data/packs");

/** Шаблон в формате редактора (web/public/template-editor). Нас интересуют canvas + elements. */
export interface PackTemplate {
  version?: number;
  name?: string;
  canvas: { w: number; h: number; bg?: string };
  elements: Array<{
    type: string;
    role?: string;
    w?: number;
    h?: number;
    padX?: number;
    padY?: number;
    fitMin?: number;
    maxChars?: number;
    minChars?: number;
    bullet?: boolean;
    font?: { family?: string; size?: number; weight?: number; color?: string; lineHeight?: number };
    [k: string]: unknown;
  }>;
}
/** Значение карточки по роли: строка (обычный килбокс) или массив строк (список-буллеты). */
export type CardValues = Record<string, string | string[]>;
export interface StoredCard {
  values: CardValues;
  addedAt: string;
  /** Which pack template this creator card should render with. Older cards omit it and keep round-robin fallback. */
  templateIndex?: number;
  /** Optional text to synthesize with TTS for creator exports. Falls back to readable card text. */
  narration?: string;
}
export interface Pack {
  id: string;
  /** Владельцы пака (могут редактировать). Пусто = владельца нет. Каноника. */
  owners: number[];
  /** @deprecated одиночный владелец из старых файлов — нормализуется в owners при чтении. */
  userId?: number;
  /** Кто создал пак. Для старых файлов выводится из legacy userId или первого владельца. */
  createdBy?: number | null;
  name: string;
  lang: string;
  /** Simple grouping label for the commercial creator gallery, e.g. jokes, memes, quotes. */
  templateType?: string;
  /** True for packs created from the commercial creator hub. Keeps the old /cards flow separate. */
  creator?: boolean;
  /** Creator editor state used to restore layout/colors/media when reopening a template. */
  creatorDesignState?: unknown;
  templates: PackTemplate[];
  cards: StoredCard[];
  createdAt: string;
  /** userId'ы, которым админ выдал доступ (opt-in). По умолчанию []: видят только владельцы/админ. */
  grants?: number[];
  /**
   * Special content policy for curated one-off packs.
   * `least_posted_per_account` means the pack is not depleted by user_used_anecdotes; generation
   * keeps picking the card that has been rendered least often for the current channel.
   */
  repeatMode?: "least_posted_per_account";
  /**
   * Finite curated source that expires independently per channel. Cards are claimed with an
   * account-scoped key, and when a channel exhausts the pack the source can be removed from that
   * channel's source_decks/slot_decks without affecting other channels.
   */
  autoExpireMode?: "per_account";
}
export interface PackSummary {
  id: string;
  owners: number[]; // владельцы (может быть пусто)
  createdBy: number | null;
  name: string;
  lang: string;
  templateType?: string;
  creator?: boolean;
  templates: number;
  cards: number;
  createdAt: string;
  grants: number[];
  /** Сервисный фон первого шаблона (assets/template-packs/...) — для плиток creator-проектов. */
  previewSrc?: string;
}
export type PackVisibilitySummary = Pick<PackSummary, "id" | "name" | "templateType">;
/** Правило для одной роли, выведенное из шаблона. */
export interface RoleRule {
  role: string;
  list: boolean; // килбокс с bullet → значение должно быть массивом
  min: number;
  max: number;
}
export interface CardError {
  index: number;
  messages: string[];
}
export interface ValidationResult {
  cards: CardValues[];
  errors: CardError[];
  parsed: number;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, "-").replace(/^-|-$/g, "").slice(0, 40) || "pack";
const isStr = (v: unknown): v is string => typeof v === "string";

// Авто-ёмкость килбокса в символах при fitMin — тот же расчёт, что в редакторе/рендерере.
function estimateCapacity(el: PackTemplate["elements"][number]): number {
  const f = Math.max(8, el.fitMin || 24);
  const lh = el.font?.lineHeight || 1.2;
  const padX = el.padX || 0, padY = el.padY || 0;
  const w = Math.max(0, (el.w || 0) - 2 * padX);
  const h = Math.max(0, (el.h || 0) - 2 * padY);
  const lines = Math.max(1, Math.floor(h / (f * lh)));
  const charsPerLine = Math.max(1, Math.floor(w / (0.52 * f)));
  return Math.max(1, Math.floor(lines * charsPerLine * 0.9));
}

/** Вывести правила добавления карточек из шаблона (по килбоксам с role). */
export function deriveRules(tpl: PackTemplate): RoleRule[] {
  const rules: RoleRule[] = [];
  for (const el of tpl?.elements || []) {
    if (el.type !== "killbox" || !el.role) continue;
    rules.push({
      role: el.role,
      list: !!el.bullet,
      min: Math.max(0, Math.round(el.minChars || 0)),
      max: el.maxChars && el.maxChars > 0 ? Math.round(el.maxChars) : estimateCapacity(el),
    });
  }
  return rules;
}

// длина значения в символах: для списка — сумма длин пунктов (как считает лимит в рендерере)
function valueLen(v: unknown): number {
  if (Array.isArray(v)) return v.reduce((n, x) => n + String(x).length, 0);
  return isStr(v) ? v.length : 0;
}

/** Проверить одну карточку против правил шаблона. Возвращает чистые значения или сообщения. */
function validateOne(raw: unknown, index: number, rules: RoleRule[]): { values?: CardValues; messages: string[] } {
  const m: string[] = [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { messages: [`#${index + 1}: карточка должна быть JSON-объектом`] };
  }
  const c = raw as Record<string, unknown>;
  const values: CardValues = {};
  for (const r of rules) {
    const v = c[r.role];
    const empty = v == null || (isStr(v) && !v.trim()) || (Array.isArray(v) && v.length === 0);
    if (empty) {
      m.push(`#${index + 1}: нет поля «${r.role}»`);
      continue;
    }
    if (r.list && !Array.isArray(v)) m.push(`#${index + 1}: «${r.role}» должно быть массивом строк (список)`);
    if (!r.list && Array.isArray(v)) m.push(`#${index + 1}: «${r.role}» должно быть строкой`);
    const len = valueLen(v);
    if (len < r.min) m.push(`#${index + 1}: «${r.role}» слишком коротко (${len} < ${r.min})`);
    if (len > r.max) m.push(`#${index + 1}: «${r.role}» слишком длинно (${len} > ${r.max})`);
    if (Array.isArray(v)) values[r.role] = v.map((x) => String(x));
    else if (isStr(v)) values[r.role] = v;
  }
  return m.length ? { messages: m } : { values, messages: [] };
}

function toEntries(input: unknown): unknown[] {
  if (typeof input === "string") {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  if (Array.isArray(input)) return input;
  if (input && typeof input === "object") return [input];
  return [];
}

/** Проверить батч карточек против правил шаблона. Бросает SyntaxError если input — кривая строка. */
export function validateBatch(input: unknown, rules: RoleRule[]): ValidationResult {
  const entries = toEntries(input);
  const cards: CardValues[] = [];
  const errors: CardError[] = [];
  entries.forEach((e, i) => {
    const { values, messages } = validateOne(e, i, rules);
    if (values) cards.push(values);
    else errors.push({ index: i, messages });
  });
  return { cards, errors, parsed: entries.length };
}

// ---------- файловое хранилище ----------
function packFile(id: string): string {
  return resolve(PACKS_DIR, `${id}.json`);
}
function writeAtomic(file: string, data: unknown): void {
  mkdirSync(PACKS_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file);
}
function readPackFile(id: string): Pack | null {
  const file = packFile(id);
  if (!existsSync(file)) return null;
  try {
    const p = JSON.parse(readFileSync(file, "utf8")) as Pack;
    // Нормализация: старые паки хранили одиночный userId → приводим к owners[]. Каноника — owners.
    if (!Array.isArray(p.owners)) p.owners = p.userId != null ? [p.userId] : [];
    const createdBy = Number(p.createdBy);
    if (!Number.isInteger(createdBy) || createdBy <= 0) {
      const legacyUserId = Number(p.userId);
      const legacyOwner = p.owners.find((owner) => Number.isInteger(owner) && owner > 0);
      p.createdBy = Number.isInteger(legacyUserId) && legacyUserId > 0 ? legacyUserId : legacyOwner ?? null;
    }
    return p;
  } catch {
    return null;
  }
}

function decodeJsonString(raw: string | undefined): string | undefined {
  if (raw == null) return undefined;
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw.replace(/\\"/g, '"');
  }
}

function topLevelString(head: string, field: string): string | undefined {
  const match = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(head);
  return decodeJsonString(match?.[1]);
}

export function getPackVisibilitySummary(id: string): PackVisibilitySummary | null {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;
  const file = packFile(cleanId);
  if (!existsSync(file)) return null;
  let fd: number | null = null;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(64 * 1024);
    const bytes = readSync(fd, buf, 0, buf.length, 0);
    const head = buf.toString("utf8", 0, bytes);
    const packId = topLevelString(head, "id") || cleanId;
    return {
      id: packId,
      name: topLevelString(head, "name") || packId,
      templateType: topLevelString(head, "templateType"),
    };
  } catch {
    return null;
  } finally {
    if (fd != null) closeSync(fd);
  }
}

function creatorPackPreviewSrc(p: Pack): string | undefined {
  const el = p.templates[0]?.elements?.find(
    (item) => item.type === "image" && typeof item.src === "string" && (item.src as string).startsWith("assets/template-packs/"),
  );
  return el ? (el.src as string) : undefined;
}

function summary(p: Pack): PackSummary {
  const previewSrc = p.creator ? creatorPackPreviewSrc(p) : undefined;
  return {
    id: p.id,
    owners: p.owners,
    createdBy: p.createdBy ?? null,
    name: p.name,
    lang: p.lang,
    templateType: p.templateType,
    creator: !!p.creator,
    templates: p.templates.length,
    cards: p.cards.length,
    createdAt: p.createdAt,
    grants: p.grants ?? [],
    ...(previewSrc ? { previewSrc } : {}),
  };
}

/** Создать пак (владелец = userId). templates — 1+ шаблонов из редактора. */
export function createPack(
  userId: number,
  opts: { name: string; lang: string; templates: PackTemplate[]; templateType?: string; creator?: boolean; creatorDesignState?: unknown },
  now: string = new Date().toISOString(),
): Pack {
  const id = `${slug(opts.name)}-${Date.now().toString(36)}`;
  const pack: Pack = {
    id,
    owners: [userId], // создатель = первый владелец
    createdBy: userId,
    name: opts.name.trim() || "Пак",
    lang: opts.lang || "ru",
    templateType: cleanTemplateType(opts.templateType),
    creator: !!opts.creator,
    creatorDesignState: opts.creatorDesignState,
    templates: opts.templates?.length ? opts.templates : [],
    cards: [],
    createdAt: now,
    grants: [], // по умолчанию доступ только у владельца/главного админа; главный админ раздаёт через матрицу
  };
  writeAtomic(packFile(id), pack);
  return pack;
}

function cleanTemplateType(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "custom";
}

/** Доступ к паку (чтение/использование: список, превью, сборка видео): главный админ ИЛИ владелец ИЛИ грант. */
export function canAccess(pack: Pack, userId: number, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || pack.owners.includes(userId) || (pack.grants ?? []).includes(userId);
}

/** Право РЕДАКТИРОВАТЬ пак (имя, язык, карточки): главный админ ИЛИ один из владельцев.
 *  Грант даёт лишь чтение/использование — гранчёный юзер пак НЕ редактирует. */
export function canEdit(pack: Pack, userId: number, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || pack.owners.includes(userId);
}

/** Право УДАЛИТЬ пак: главный админ — любой; обычный админ — только созданный им; юзер — свой. */
export function canDeletePack(pack: Pack, userId: number, isSuperAdmin: boolean, isAdmin = false): boolean {
  if (isSuperAdmin) return true;
  if (isAdmin) return pack.createdBy === userId;
  return pack.owners.includes(userId);
}

/** Все паки (любой владелец) — для матрицы Админки (колонки + кто гранчен). */
export function listAllPacks(): PackSummary[] {
  if (!existsSync(PACKS_DIR)) return [];
  const out: PackSummary[] = [];
  for (const f of readdirSync(PACKS_DIR)) {
    if (!f.endsWith(".json") || f.endsWith(".tmp")) continue;
    const p = readPackFile(f.replace(/\.json$/, ""));
    if (!p) continue;
    out.push(summary(p));
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

export function listPackVisibilitySummaries(): PackVisibilitySummary[] {
  if (!existsSync(PACKS_DIR)) return [];
  const out: PackVisibilitySummary[] = [];
  for (const f of readdirSync(PACKS_DIR)) {
    if (!f.endsWith(".json") || f.endsWith(".tmp")) continue;
    const p = getPackVisibilitySummary(f.replace(/\.json$/, ""));
    if (p) out.push(p);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** Выдать/снять доступ юзеру к паку (грант). Владельца не трогаем. */
export function setGrant(packId: string, userId: number, on: boolean): boolean {
  const p = readPackFile(packId);
  if (!p) return false;
  const grants = new Set(p.grants ?? []);
  if (on) grants.add(userId);
  else grants.delete(userId);
  p.grants = [...grants];
  writeAtomic(packFile(packId), p);
  return true;
}

/** Сменить язык пака (тег языка). Право (владелец/главный админ) проверяется на уровне роута. */
export function setPackLang(packId: string, lang: string): boolean {
  const p = readPackFile(packId);
  if (!p) return false;
  p.lang = (lang || "ru").trim().toLowerCase();
  writeAtomic(packFile(packId), p);
  return true;
}

/** Переименовать пак. Право (владелец/главный админ) проверяется на уровне роута. */
export function setPackName(packId: string, name: string): boolean {
  const p = readPackFile(packId);
  if (!p) return false;
  const next = name.trim().slice(0, 80);
  if (!next) return false;
  p.name = next;
  writeAtomic(packFile(packId), p);
  return true;
}

export function setCreatorPackTemplate(
  id: string,
  userId: number,
  isSuperAdmin: boolean,
  templates: PackTemplate[],
  templateType?: string,
  creatorDesignState?: unknown,
): { ok: true; pack: Pack } | { ok: false; reason: "not_found" | "not_creator" | "no_template" } {
  const p = readPackFile(id);
  if (!p || !canEdit(p, userId, isSuperAdmin)) return { ok: false, reason: "not_found" };
  if (!p.creator) return { ok: false, reason: "not_creator" };
  if (!templates.length) return { ok: false, reason: "no_template" };
  p.templates = templates;
  if (templateType) p.templateType = cleanTemplateType(templateType);
  if (creatorDesignState !== undefined) p.creatorDesignState = creatorDesignState;
  writeAtomic(packFile(id), p);
  return { ok: true, pack: p };
}

/** Удалить один шаблон creator-пака; карточки переиндексируются (== index → 0, > index → сдвиг на -1).
 *  Последний шаблон удалить нельзя — пак без шаблонов не рендерится. */
export function deleteCreatorTemplate(
  id: string,
  userId: number,
  isSuperAdmin: boolean,
  index: number,
): { ok: true; pack: Pack } | { ok: false; reason: "not_found" | "not_creator" | "last_template" } {
  const p = readPackFile(id);
  if (!p || !canEdit(p, userId, isSuperAdmin)) return { ok: false, reason: "not_found" };
  if (!p.creator) return { ok: false, reason: "not_creator" };
  if (!Number.isInteger(index) || index < 0 || index >= p.templates.length) return { ok: false, reason: "not_found" };
  if (p.templates.length <= 1) return { ok: false, reason: "last_template" };
  p.templates.splice(index, 1);
  p.cards = p.cards.map((card) => {
    const current = Number.isInteger(card.templateIndex) ? (card.templateIndex as number) : 0;
    if (current === index) return { ...card, templateIndex: 0 };
    if (current > index) return { ...card, templateIndex: current - 1 };
    return card;
  });
  writeAtomic(packFile(id), p);
  return { ok: true, pack: p };
}

/** Задать список владельцев пака (0+; проверка админ-права на уровне роута). Пусто = без владельца.
 *  Владельцы убираются из грантов (владельцу грант не нужен). Legacy-поле userId стирается. */
export function setPackOwners(packId: string, ownerIds: number[]): boolean {
  const p = readPackFile(packId);
  if (!p) return false;
  const owners = [...new Set(ownerIds.filter((n) => Number.isInteger(n) && n > 0))];
  p.owners = owners;
  if (p.grants) p.grants = p.grants.filter((g) => !owners.includes(g));
  delete p.userId; // каноника теперь owners[]
  writeAtomic(packFile(packId), p);
  return true;
}

/** Список паков пользователя (сводки), новейшие сверху. */
export function listPacks(userId: number, isSuperAdmin = false): PackSummary[] {
  if (!existsSync(PACKS_DIR)) return [];
  const out: PackSummary[] = [];
  for (const f of readdirSync(PACKS_DIR)) {
    if (!f.endsWith(".json") || f.endsWith(".tmp")) continue;
    const p = readPackFile(f.replace(/\.json$/, ""));
    if (!p || !canAccess(p, userId, isSuperAdmin)) continue;
    out.push(summary(p));
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

/** Creator hub packs only. Admins may inspect all creator packs; users see only their own/editable packs. */
export function listCreatorPacks(userId: number, isSuperAdmin = false): PackSummary[] {
  if (!existsSync(PACKS_DIR)) return [];
  const out: PackSummary[] = [];
  for (const f of readdirSync(PACKS_DIR)) {
    if (!f.endsWith(".json") || f.endsWith(".tmp")) continue;
    const p = readPackFile(f.replace(/\.json$/, ""));
    if (!p || !p.creator || !canAccess(p, userId, isSuperAdmin)) continue;
    out.push(summary(p));
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return out;
}

/** Полный пак — владельцу/админу/гранченному. */
export function getPack(id: string, userId: number, isSuperAdmin = false): Pack | null {
  const p = readPackFile(id);
  if (!p || !canAccess(p, userId, isSuperAdmin)) return null;
  return p;
}

/** Добавить карточки в пак с проверкой по правилам ПЕРВОГО шаблона. All-or-nothing на уровне роута.
 *  Редактирование (добавление) — только владелец/главный админ (canEdit); грант не даёт права менять контент. */
export function addCards(
  id: string,
  userId: number,
  isSuperAdmin: boolean,
  input: unknown,
  now: string = new Date().toISOString(),
): { ok: true; added: number; total: number } | { ok: false; reason: "not_found" | "no_template" | "invalid"; result?: ValidationResult } {
  const p = readPackFile(id);
  if (!p || !canEdit(p, userId, isSuperAdmin)) return { ok: false, reason: "not_found" };
  if (!p.templates.length) return { ok: false, reason: "no_template" };
  const rules = deriveRules(p.templates[0]);
  let result: ValidationResult;
  try {
    result = validateBatch(input, rules);
  } catch {
    return { ok: false, reason: "invalid", result: { cards: [], errors: [{ index: 0, messages: ["Неверный JSON"] }], parsed: 0 } };
  }
  if (result.parsed === 0 || result.errors.length) return { ok: false, reason: "invalid", result };
  for (const v of result.cards) p.cards.push({ values: v, addedAt: now });
  writeAtomic(packFile(id), p);
  return { ok: true, added: result.cards.length, total: p.cards.length };
}

export interface CreatorCardInput {
  values?: CardValues;
  narration?: string;
  templateIndex?: number;
  [role: string]: unknown;
}

function cardValuesFromCreatorInput(input: unknown): { values: unknown; narration?: string; templateIndex?: number } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { values: input };
  const raw = input as CreatorCardInput;
  const narration = typeof raw.narration === "string" ? raw.narration.trim().slice(0, 5_000) : undefined;
  const templateIndex = Number.isInteger(raw.templateIndex) ? raw.templateIndex : undefined;
  if (raw.values && typeof raw.values === "object" && !Array.isArray(raw.values)) return { values: raw.values, narration, templateIndex };
  const { narration: _narration, values: _values, templateIndex: _templateIndex, ...rest } = raw;
  return { values: rest, narration, templateIndex };
}

function cleanCardTemplateIndex(value: unknown, templateCount: number): number {
  const index = Math.round(Number(value));
  if (!Number.isInteger(index) || index < 0 || index >= templateCount) return 0;
  return index;
}

function creatorRulesForTemplate(pack: Pack, templateIndex: number): RoleRule[] {
  const template = pack.templates[templateIndex] ?? pack.templates[0];
  return deriveRules(pack.creator ? stripCreatorTemplateMetaForRules(template) : template);
}

function normalizeCreatorValues(raw: unknown, rules: RoleRule[]): CardValues {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const getString = (...keys: string[]) => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length) return value.map((x) => String(x)).join("\n").trim();
    }
    return "";
  };
  const lines = (...keys: string[]) => {
    for (const key of keys) {
      const value = input[key];
      if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
      if (typeof value === "string" && value.trim()) {
        return value.split(/\r?\n|(?:^|\s)\d+\.\s+/).map((x) => x.trim()).filter(Boolean);
      }
    }
    return [];
  };
  const title = getString("title", "heading", "hook", "badge") || "Карточка";
  const body = getString("text", "body", "fact", "description") || title;
  const source = getString("source", "badge", "cta") || "Creator";
  const cta = getString("cta", "source") || source;
  const points = lines("points", "items", "body", "text");
  const out: CardValues = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim()) out[key] = value;
    else if (Array.isArray(value) && value.length) out[key] = value.map(String);
  }
  for (const rule of rules) {
    if (out[rule.role] != null) continue;
    if (rule.role === "title" || rule.role === "heading") out[rule.role] = title;
    else if (rule.role === "hook") out[rule.role] = getString("hook", "heading", "title", "badge") || title;
    else if (rule.role === "text" || rule.role === "body" || rule.role === "fact") out[rule.role] = rule.list ? points : body;
    else if (rule.role === "points" || rule.role === "items") out[rule.role] = points.length ? points : [body];
    else if (rule.role === "source") out[rule.role] = source;
    else if (rule.role === "cta") out[rule.role] = cta;
  }
  return out;
}

function stripCreatorTemplateMetaForRules(template: PackTemplate): PackTemplate {
  const copy = JSON.parse(JSON.stringify(template)) as PackTemplate;
  copy.elements = (copy.elements ?? []).filter((el) => {
    const role = String(el.role ?? "").toLowerCase();
    const id = String((el as { id?: unknown }).id ?? "").toLowerCase();
    return role !== "source" && role !== "cta" && role !== "badge" && id !== "source" && id !== "cta" && id !== "badge" && id !== "panel";
  });
  return copy;
}

/** Add creator cards, preserving optional per-card narration for TTS. */
export function addCreatorCards(
  id: string,
  userId: number,
  isSuperAdmin: boolean,
  input: unknown,
  now: string = new Date().toISOString(),
): { ok: true; added: number; total: number; pack: Pack } | { ok: false; reason: "not_found" | "no_template" | "invalid"; result?: ValidationResult } {
  const p = readPackFile(id);
  if (!p || !canEdit(p, userId, isSuperAdmin)) return { ok: false, reason: "not_found" };
  if (!p.templates.length) return { ok: false, reason: "no_template" };
  const entries = Array.isArray(input) ? input : input ? [input] : [];
  const normalized = entries.map(cardValuesFromCreatorInput);
  if (!normalized.length) return { ok: false, reason: "invalid", result: { cards: [], errors: [], parsed: 0 } };
  const nextCards: StoredCard[] = [];
  const errors: CardError[] = [];
  normalized.forEach((entry, i) => {
    const templateIndex = cleanCardTemplateIndex(entry.templateIndex, p.templates.length);
    const rules = creatorRulesForTemplate(p, templateIndex);
    try {
      const result = validateBatch([normalizeCreatorValues(entry.values, rules)], rules);
      if (result.parsed === 0 || result.errors.length) {
        errors.push(...result.errors.map((error) => ({ ...error, index: i })));
        return;
      }
      const values = result.cards[0];
      nextCards.push({ values, addedAt: now, templateIndex, ...(entry.narration ? { narration: entry.narration } : {}) });
    } catch {
      errors.push({ index: i, messages: ["Неверный JSON"] });
    }
  });
  if (errors.length) return { ok: false, reason: "invalid", result: { cards: [], errors, parsed: normalized.length } };
  p.cards.push(...nextCards);
  writeAtomic(packFile(id), p);
  return { ok: true, added: nextCards.length, total: p.cards.length, pack: p };
}

/** Обновить одну creator-карточку по индексу (валидация как при добавлении). Только canEdit. */
export function updateCreatorCard(
  id: string,
  userId: number,
  isSuperAdmin: boolean,
  index: number,
  input: unknown,
): { ok: true; pack: Pack } | { ok: false; reason: "not_found" | "no_template" | "invalid"; result?: ValidationResult } {
  const p = readPackFile(id);
  if (!p || !canEdit(p, userId, isSuperAdmin)) return { ok: false, reason: "not_found" };
  if (!Number.isInteger(index) || index < 0 || index >= p.cards.length) return { ok: false, reason: "not_found" };
  if (!p.templates.length) return { ok: false, reason: "no_template" };
  const prev = p.cards[index];
  const parsed = cardValuesFromCreatorInput(input);
  const templateIndex = cleanCardTemplateIndex(parsed.templateIndex ?? prev.templateIndex, p.templates.length);
  const rules = creatorRulesForTemplate(p, templateIndex);
  let result: ValidationResult;
  try {
    result = validateBatch([normalizeCreatorValues(parsed.values, rules)], rules);
  } catch {
    return { ok: false, reason: "invalid", result: { cards: [], errors: [{ index: 0, messages: ["Неверный JSON"] }], parsed: 0 } };
  }
  if (result.parsed === 0 || result.errors.length) return { ok: false, reason: "invalid", result };
  // narration: undefined → не трогаем, "" → убираем, строка → заменяем
  const nextNarration = parsed.narration === undefined ? prev.narration : parsed.narration || undefined;
  p.cards[index] = { values: result.cards[0], addedAt: prev.addedAt, templateIndex, ...(nextNarration ? { narration: nextNarration } : {}) };
  writeAtomic(packFile(id), p);
  return { ok: true, pack: p };
}

/** Удалить одну карточку по индексу (сверка addedAt от гонок). Только владелец/главный админ (canEdit). */
export function deleteCard(
  id: string,
  userId: number,
  isSuperAdmin: boolean,
  index: number,
  expectedAddedAt?: string,
): { deleted: boolean; total: number; reason?: "not_found" | "stale" } {
  const p = readPackFile(id);
  if (!p || !canEdit(p, userId, isSuperAdmin)) return { deleted: false, total: 0, reason: "not_found" };
  if (!Number.isInteger(index) || index < 0 || index >= p.cards.length)
    return { deleted: false, total: p.cards.length, reason: "not_found" };
  if (expectedAddedAt && p.cards[index].addedAt !== expectedAddedAt)
    return { deleted: false, total: p.cards.length, reason: "stale" };
  p.cards.splice(index, 1);
  writeAtomic(packFile(id), p);
  return { deleted: true, total: p.cards.length };
}

/** Удалить пак целиком: главный админ — любой; обычный админ — созданный им; юзер — свой. */
export function deletePack(id: string, userId: number, isSuperAdmin = false, opts: { isAdmin?: boolean } = {}): boolean {
  const p = readPackFile(id);
  if (!p) return false;
  if (!canDeletePack(p, userId, isSuperAdmin, !!opts.isAdmin)) return false;
  unlinkSync(packFile(id));
  return true;
}

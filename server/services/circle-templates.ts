import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  activateCircleAdvertiser,
  circleAdvertiserState,
  circleProjectDir,
} from "./circle-advertisers.ts";

export type CircleLayout = {
  circle: { x: number; y: number; size: number };
  puzzle: { x: number; y: number; width: number; labelSize: number; puzzleSize: number; gap: number };
  banner: { x: number; y: number; width: number; height: number; startSeconds: number; repeatEverySeconds: number };
};

export type CircleTemplate = {
  id: string;
  name: string;
  layout: CircleLayout;
  advertiserId: string;
  bannerEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export const CIRCLE_DECK_ID = "telegram-circles";
export const CIRCLE_DECK_PREFIX = `${CIRCLE_DECK_ID}:`;

export function isCircleDeckId(deckId: unknown): boolean {
  const value = String(deckId || "").trim();
  return value === CIRCLE_DECK_ID || value.startsWith(CIRCLE_DECK_PREFIX);
}

export function circleTemplateDeckId(templateId: unknown): string {
  return `${CIRCLE_DECK_PREFIX}${safeId(templateId)}`;
}

export function circleTemplateIdFromDeckId(deckId: unknown): string | null {
  const value = String(deckId || "").trim();
  if (value === CIRCLE_DECK_ID) return activeCircleTemplateId();
  if (!value.startsWith(CIRCLE_DECK_PREFIX)) return null;
  return safeId(value.slice(CIRCLE_DECK_PREFIX.length)) || null;
}

type TemplateStore = { version: 1; items: CircleTemplate[] };
type ConfigRecord = Record<string, unknown>;

function storeFile(): string {
  return resolve(circleProjectDir(), "circle-templates.json");
}

function configFile(): string {
  return resolve(circleProjectDir(), "config.json");
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "";
}

function safeId(value: unknown): string {
  const result = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(result) ? result : "";
}

function number(value: unknown, fallback: number): number {
  const result = Number(value);
  return Number.isFinite(result) ? Math.round(result) : fallback;
}

function layoutFromConfig(config: ConfigRecord): CircleLayout {
  const video = (config.video && typeof config.video === "object" ? config.video : {}) as ConfigRecord;
  const engagement = (video.engagement && typeof video.engagement === "object" ? video.engagement : {}) as ConfigRecord;
  const banner = (video.banner && typeof video.banner === "object" ? video.banner : {}) as ConfigRecord;
  return {
    circle: {
      x: number(video.circleLeft, 130),
      y: number(video.circleTop, 300),
      size: number(video.circleDiameter, 820),
    },
    puzzle: {
      x: number(engagement.left, 90),
      y: number(engagement.top, 92),
      width: number(engagement.width, 900),
      labelSize: number(engagement.labelFontSize, 30),
      puzzleSize: number(engagement.puzzleFontSize, 68),
      gap: number(engagement.lineGap, 14),
    },
    banner: {
      x: number(banner.left, 90),
      y: number(banner.top, 830),
      width: number(banner.width, 900),
      height: number(banner.height, 260),
      startSeconds: number(banner.startSeconds, 0),
      repeatEverySeconds: number(banner.repeatEverySeconds, 0),
    },
  };
}

function currentConfig(): ConfigRecord {
  if (!existsSync(configFile())) throw new Error(`Не найден ${configFile()}`);
  return JSON.parse(readFileSync(configFile(), "utf8")) as ConfigRecord;
}

async function saveConfig(config: ConfigRecord): Promise<void> {
  const file = configFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function bootstrapTemplate(): CircleTemplate {
  const config = currentConfig();
  const advertiser = circleAdvertiserState();
  const now = new Date().toISOString();
  return {
    id: safeId(config.templateId) || "default",
    name: cleanName(config.templateName) || "Telegram-кружочки",
    layout: layoutFromConfig(config),
    advertiserId: advertiser.activeAdvertiserId,
    bannerEnabled: advertiser.bannerEnabled,
    createdAt: now,
    updatedAt: now,
  };
}

function loadStore(): TemplateStore {
  if (!existsSync(storeFile())) return { version: 1, items: [bootstrapTemplate()] };
  try {
    const parsed = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<TemplateStore>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.filter((item): item is CircleTemplate => !!item && typeof item.id === "string")
      : [];
    return { version: 1, items: items.length ? items : [bootstrapTemplate()] };
  } catch {
    return { version: 1, items: [bootstrapTemplate()] };
  }
}

async function saveStore(store: TemplateStore): Promise<void> {
  const file = storeFile();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

export function listCircleTemplates(): CircleTemplate[] {
  return loadStore().items.map((item) => {
    const copy = structuredClone(item);
    copy.layout.banner.startSeconds = number(copy.layout.banner.startSeconds, 0);
    copy.layout.banner.repeatEverySeconds = number(copy.layout.banner.repeatEverySeconds, 0);
    return copy;
  });
}

export function activeCircleTemplateId(): string {
  const config = currentConfig();
  const requested = safeId(config.templateId);
  const templates = listCircleTemplates();
  return templates.some((item) => item.id === requested) ? requested : templates[0]?.id || "default";
}

export function getCircleTemplate(idValue: unknown): CircleTemplate | null {
  const id = safeId(idValue);
  return listCircleTemplates().find((item) => item.id === id) || null;
}

async function applyTemplate(template: CircleTemplate): Promise<void> {
  const config = currentConfig();
  const video = ((config.video ||= {}) as ConfigRecord);
  video.circleLeft = template.layout.circle.x;
  video.circleTop = template.layout.circle.y;
  video.circleDiameter = template.layout.circle.size;
  const engagement = ((video.engagement ||= {}) as ConfigRecord);
  engagement.left = template.layout.puzzle.x;
  engagement.top = template.layout.puzzle.y;
  engagement.width = template.layout.puzzle.width;
  engagement.labelFontSize = template.layout.puzzle.labelSize;
  engagement.puzzleFontSize = template.layout.puzzle.puzzleSize;
  engagement.lineGap = template.layout.puzzle.gap;
  const banner = ((video.banner ||= {}) as ConfigRecord);
  banner.left = template.layout.banner.x;
  banner.top = template.layout.banner.y;
  banner.width = template.layout.banner.width;
  banner.height = template.layout.banner.height;
  banner.startSeconds = template.layout.banner.startSeconds ?? 0;
  banner.repeatEverySeconds = template.layout.banner.repeatEverySeconds ?? 0;
  config.templateId = template.id;
  config.templateName = template.name;
  await saveConfig(config);
  await activateCircleAdvertiser(template.advertiserId, template.bannerEnabled);
}

export async function activateCircleTemplate(idValue: unknown): Promise<CircleTemplate> {
  const template = getCircleTemplate(idValue);
  if (!template) throw new Error("Шаблон кружочков не найден.");
  await applyTemplate(template);
  return template;
}

export async function setActiveCircleTemplateAdvertiser(idValue: unknown, enabledValue: unknown): Promise<void> {
  await activateCircleAdvertiser(idValue, enabledValue);
  const advertiser = circleAdvertiserState();
  const store = loadStore();
  const activeId = activeCircleTemplateId();
  const index = store.items.findIndex((item) => item.id === activeId);
  if (index < 0) return;
  store.items[index] = {
    ...store.items[index],
    advertiserId: advertiser.activeAdvertiserId,
    bannerEnabled: advertiser.bannerEnabled,
    updatedAt: new Date().toISOString(),
  };
  await saveStore(store);
}

export async function replaceCircleTemplateAdvertiser(idValue: unknown, replacementId = ""): Promise<void> {
  const id = safeId(idValue);
  if (!id) return;
  const store = loadStore();
  let changed = false;
  const now = new Date().toISOString();
  store.items = store.items.map((item) => {
    if (item.advertiserId !== id) return item;
    changed = true;
    return { ...item, advertiserId: replacementId, bannerEnabled: replacementId ? item.bannerEnabled : false, updatedAt: now };
  });
  if (changed) await saveStore(store);
}

export async function saveCircleTemplate(input: {
  id?: unknown;
  createNew?: boolean;
  name?: unknown;
  layout: CircleLayout;
  advertiserId?: unknown;
  bannerEnabled?: unknown;
}): Promise<CircleTemplate> {
  const store = loadStore();
  const requestedId = safeId(input.id);
  const current = requestedId ? store.items.find((item) => item.id === requestedId) : undefined;
  const createNew = input.createNew === true || !current;
  const id = createNew ? `tpl-${randomUUID().slice(0, 8)}` : current.id;
  const now = new Date().toISOString();
  const advertiser = circleAdvertiserState();
  const template: CircleTemplate = {
    id,
    name: cleanName(input.name) || current?.name || "Новый шаблон",
    layout: structuredClone(input.layout),
    advertiserId: safeId(input.advertiserId) || advertiser.activeAdvertiserId,
    bannerEnabled: input.bannerEnabled !== false,
    createdAt: createNew ? now : current.createdAt,
    updatedAt: now,
  };
  const index = store.items.findIndex((item) => item.id === id);
  if (index >= 0) store.items[index] = template;
  else store.items.push(template);
  await saveStore(store);
  await applyTemplate(template);
  return template;
}

export async function deleteCircleTemplate(idValue: unknown): Promise<CircleTemplate> {
  const id = safeId(idValue);
  const store = loadStore();
  if (store.items.length <= 1) throw new Error("Нельзя удалить единственный шаблон.");
  if (!store.items.some((item) => item.id === id)) throw new Error("Шаблон не найден.");
  store.items = store.items.filter((item) => item.id !== id);
  await saveStore(store);
  const next = store.items[0];
  await applyTemplate(next);
  return next;
}

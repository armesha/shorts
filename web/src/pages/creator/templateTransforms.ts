import {
  clampStickerBox,
  clampTextBox,
  textBackgroundCss,
  textOutlineShadow,
} from "./designState";
import type { CreatorRecord, StickerOverlay, TextBoxRole, TextLayout, TextStyle } from "./types";

const HEADING_ROLES = new Set(["title", "heading", "hook"]);
const BODY_ROLES = new Set(["body", "text", "fact", "points", "items"]);

function killboxRole(el: CreatorRecord): TextBoxRole | null {
  const role = String(el.role ?? el.id ?? "");
  if (HEADING_ROLES.has(role)) return "heading";
  if (BODY_ROLES.has(role)) return "body";
  return null;
}

/** Ёмкость килбокса в символах при fitMin — та же формула, что в src/packs/store.ts (deriveRules). */
export function estimateKillboxCapacity(el: CreatorRecord): number {
  const font = (el.font && typeof el.font === "object" ? el.font : {}) as CreatorRecord;
  const f = Math.max(8, Number(el.fitMin) || 24);
  const lh = Number(font.lineHeight) || 1.2;
  const padX = Number(el.padX) || 0;
  const padY = Number(el.padY) || 0;
  const w = Math.max(0, (Number(el.w) || 0) - 2 * padX);
  const h = Math.max(0, (Number(el.h) || 0) - 2 * padY);
  const lines = Math.max(1, Math.floor(h / (f * lh)));
  const charsPerLine = Math.max(1, Math.floor(w / (0.52 * f)));
  return Math.max(1, Math.floor(lines * charsPerLine * 0.9));
}

function templateKillbox(templates: unknown[], role: TextBoxRole): CreatorRecord | null {
  const first = templates[0];
  if (!first || typeof first !== "object") return null;
  const elements = ((first as CreatorRecord).elements ?? []) as CreatorRecord[];
  if (!Array.isArray(elements)) return null;
  return elements.find((el) => el?.type === "killbox" && killboxRole(el) === role) ?? null;
}

/** Сколько символов влезает в бокс роли (по уже трансформированному payload — совпадает с правилами сервера). */
export function capacityForRole(templates: unknown[], role: TextBoxRole): number {
  const el = templateKillbox(templates, role);
  if (!el) return role === "heading" ? 72 : 420;
  const explicit = Number(el.maxChars);
  return Number.isFinite(explicit) && explicit > 0 ? Math.round(explicit) : estimateKillboxCapacity(el);
}

/** Текущий (эффективный) размер шрифта роли в шаблоне — для слайдера, когда fs не задан. */
export function fontSizeForRole(templates: unknown[], role: TextBoxRole): number {
  const el = templateKillbox(templates, role);
  const font = (el?.font && typeof el.font === "object" ? el.font : {}) as CreatorRecord;
  const size = Number(el?.fitMax ?? font.size);
  if (Number.isFinite(size) && size > 0) return Math.round(size);
  return role === "heading" ? 58 : 43;
}

function isCreatorMetaElement(el: CreatorRecord): boolean {
  const role = String(el.role ?? "").toLowerCase();
  const id = String(el.id ?? "").toLowerCase();
  return role === "source" || role === "cta" || role === "badge" || id === "source" || id === "cta" || id === "badge" || id === "panel";
}

function stickerTemplateElement(sticker: StickerOverlay): CreatorRecord {
  const box = clampStickerBox(sticker);
  if (sticker.kind === "image") {
    return {
      id: "creator-sticker-image",
      type: "image",
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      rot: box.rot ?? 0,
      src: sticker.value,
      fit: "contain",
    };
  }
  return {
    id: "creator-sticker-emoji",
    type: "text",
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    rot: box.rot ?? 0,
    text: sticker.value,
    align: "center",
    font: {
      family: "Inter",
      size: Math.max(32, Math.round(Math.min(box.w, box.h) * 0.72)),
      weight: 700,
      color: "#111827",
      lineHeight: 1,
    },
  };
}

export function applyTextLayoutToTemplates(templates: unknown[], layout: TextLayout, style: TextStyle, sticker: StickerOverlay | null): unknown[] {
  return templates.map((template) => {
    if (!template || typeof template !== "object") return template;
    const copy = JSON.parse(JSON.stringify(template)) as CreatorRecord & { elements?: CreatorRecord[] };
    copy.elements = (copy.elements ?? []).filter((el) => !isCreatorMetaElement(el));
    const boxes = {
      heading: clampTextBox(layout.heading, "heading"),
      body: clampTextBox(layout.body, "body"),
    };
    for (const el of copy.elements ?? []) {
      if (el.type !== "killbox") continue;
      const roleKind = killboxRole(el);
      const target = roleKind ? boxes[roleKind] : null;
      if (!target) continue;
      el.x = target.x;
      el.y = target.y;
      el.w = target.w;
      el.h = target.h;
      el.rot = target.rot ?? 0;
      el.font = { ...((el.font && typeof el.font === "object" ? el.font : {}) as CreatorRecord), color: style.color };
      if (target.fs) {
        (el.font as CreatorRecord).size = target.fs;
        el.fitMax = target.fs;
        // авто-подгон может ужать текст максимум до ~62% выбранного размера —
        // так лимит символов честно зависит от выбранного шрифта
        el.fitMin = Math.max(18, Math.round(target.fs * 0.62));
      }
      const bg = textBackgroundCss(style.background);
      const shadow = textOutlineShadow(style.outline);
      if (bg) {
        el.bg = bg;
        el.radius = 24;
        el.padX = Math.max(24, Number(el.padX ?? 0));
        el.padY = Math.max(18, Number(el.padY ?? 0));
        el.shadow = "0 18px 42px rgba(15,23,42,.14)";
      } else {
        delete el.bg;
        delete el.radius;
        delete el.shadow;
        el.padX = 0;
        el.padY = 0;
      }
      if (shadow) el.textShadow = shadow;
      else delete el.textShadow;
      if (target.w < 520) el.align = "center";
      if (target.h < 220) el.valign = "center";
      // лимит символов просчитывается прямо из геометрии и шрифта бокса —
      // именно его увидят правила пака (deriveRules) и формы карточек
      el.maxChars = estimateKillboxCapacity(el);
    }
    if (sticker) copy.elements.push(stickerTemplateElement(sticker));
    return copy;
  });
}

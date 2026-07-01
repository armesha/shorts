import {
  clampStickerBox,
  clampTextBox,
  textBackgroundCss,
  textOutlineShadow,
} from "./designState";
import type { CreatorRecord, StickerOverlay, TextLayout, TextStyle } from "./types";

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
      const role = String(el.role ?? el.id ?? "");
      const target =
        role === "title" || role === "heading" || role === "hook"
          ? boxes.heading
          : role === "body" || role === "text" || role === "fact" || role === "points" || role === "items"
            ? boxes.body
            : null;
      if (!target) continue;
      el.x = target.x;
      el.y = target.y;
      el.w = target.w;
      el.h = target.h;
      el.rot = target.rot ?? 0;
      el.font = { ...((el.font && typeof el.font === "object" ? el.font : {}) as CreatorRecord), color: style.color };
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
    }
    if (sticker) copy.elements.push(stickerTemplateElement(sticker));
    return copy;
  });
}

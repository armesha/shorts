// CSS-миниатюра карточки 9:16 в стиле шаблона проекта — без серверного рендера.
// Позиции блоков берутся из layout шаблона (проценты от 1080×1920).
import type { CSSProperties } from "react";
import { TEMPLATE_H, TEMPLATE_W } from "./config";
import { textBackgroundCss, textOutlineShadow } from "./designState";
import { creatorServiceAssetUrl } from "./model";
import { templateBackgroundSrc } from "./templateTransforms";
import type { StickerOverlay, TextLayout, TextStyle } from "./types";

export type MiniCardStyling = {
  backgroundUrl: string;
  tone: string;
  layout: TextLayout;
  textStyle: TextStyle;
  sticker: StickerOverlay | null;
};

/** Стиль мини-карты с фоном КОНКРЕТНОГО шаблона — карточки пака рендерятся каждая по своему. */
export function stylingForTemplate(base: MiniCardStyling, template: unknown): MiniCardStyling {
  const src = templateBackgroundSrc(template);
  if (!src) return base;
  const url = src.startsWith("data:") ? src : creatorServiceAssetUrl(src);
  return url ? { ...base, backgroundUrl: url } : base;
}

function boxStyle(box: { x: number; y: number; w: number; h: number; rot?: number }): CSSProperties {
  return {
    left: `${(box.x / TEMPLATE_W) * 100}%`,
    top: `${(box.y / TEMPLATE_H) * 100}%`,
    width: `${(box.w / TEMPLATE_W) * 100}%`,
    height: `${(box.h / TEMPLATE_H) * 100}%`,
    transform: `rotate(${box.rot ?? 0}deg)`,
    transformOrigin: "center center",
  };
}

export function MiniCard({
  styling,
  title,
  text,
  className = "",
}: {
  styling: MiniCardStyling;
  title: string;
  text: string;
  className?: string;
}) {
  const { layout, textStyle } = styling;
  const textVars = {
    "--creator-text-color": textStyle.color,
    "--creator-text-bg": textBackgroundCss(textStyle.background) || "transparent",
    "--creator-text-shadow": textOutlineShadow(textStyle.outline) || "none",
  } as CSSProperties;
  const backgroundStyle = styling.backgroundUrl
    ? ({ backgroundImage: `url("${styling.backgroundUrl.replace(/["\\]/g, "\\$&")}")` } as CSSProperties)
    : undefined;

  return (
    <span className={`creator-mini-card ${styling.tone} ${className}`} style={backgroundStyle} aria-hidden="true">
      <span className="creator-mini-box is-heading" style={{ ...boxStyle(layout.heading), ...textVars }}>
        {title}
      </span>
      <span className="creator-mini-box is-body" style={{ ...boxStyle(layout.body), ...textVars }}>
        {text}
      </span>
      {styling.sticker && (
        <span className="creator-mini-sticker" style={boxStyle(styling.sticker)}>
          {styling.sticker.kind === "image" ? <img src={styling.sticker.value} alt="" /> : styling.sticker.value}
        </span>
      )}
    </span>
  );
}

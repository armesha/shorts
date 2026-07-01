from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


OUT = Path("assets/motion/jokes")
OUT.mkdir(parents=True, exist_ok=True)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_HEAVY = ImageFont.truetype(FONT_BOLD, 34)
FONT_SMALL = ImageFont.truetype(FONT_BOLD, 24)
FONT_TINY = ImageFont.truetype(FONT_BOLD, 18)


LAUGH_ASSETS = [
    ("laugh-tears.gif", "tears"),
    ("laugh-rofl.gif", "rofl"),
    ("laugh-squint.gif", "squint"),
    ("laugh-cry.gif", "cry"),
    ("laugh-pop.gif", "pop"),
    ("laugh-shake.gif", "shake"),
    ("laugh-grin.gif", "grin"),
    ("laugh-snort.gif", "snort"),
    ("laugh-tilt.gif", "tilt"),
    ("laugh-wave.gif", "wave"),
    ("laugh-zoom.gif", "zoom"),
    ("laugh-spark.gif", "spark"),
]

CTA_ASSETS = [
    ("cta-subscribe.gif", "SUBSCRIBE", "#ef2f2f", "#ffffff"),
    ("cta-like.gif", "LIKE", "#2563eb", "#ffffff"),
    ("cta-follow.gif", "FOLLOW", "#111827", "#ffffff"),
    ("cta-share.gif", "SHARE", "#16a34a", "#ffffff"),
    ("cta-comment.gif", "COMMENT", "#f59e0b", "#111827"),
    ("cta-save.gif", "SAVE", "#7c3aed", "#ffffff"),
    ("cta-tap.gif", "TAP", "#ffffff", "#111827"),
    ("cta-new.gif", "NEW", "#22c55e", "#ffffff"),
]


def text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font)
    return box[2] - box[0], box[3] - box[1]


def draw_teardrop(draw: ImageDraw.ImageDraw, cx: float, cy: float, scale: float, alpha: int) -> None:
    fill = (73, 171, 255, alpha)
    outline = (255, 255, 255, min(230, alpha + 30))
    draw.ellipse((cx - 6 * scale, cy, cx + 6 * scale, cy + 16 * scale), fill=fill, outline=outline, width=max(1, int(2 * scale)))
    draw.polygon([(cx, cy - 7 * scale), (cx - 5 * scale, cy + 5 * scale), (cx + 5 * scale, cy + 5 * scale)], fill=fill)


def make_laugh_frames(kind: str) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for i in range(18):
        t = i / 17
        pulse = 1 + 0.045 * math.sin(t * math.tau)
        wobble = math.sin(t * math.tau * (2.0 if kind != "shake" else 4.0)) * (5 if kind != "zoom" else 2)
        tilt = math.sin(t * math.tau * 2) * (8 if kind in {"tilt", "rofl"} else 3)

        img = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
        layer = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)

        cx = 110 + (wobble if kind == "shake" else 0)
        cy = 105 + (wobble if kind != "shake" else 0)
        r = 70 * pulse
        shadow = (0, 0, 0, 42)
        draw.ellipse((cx - r + 3, cy - r + 8, cx + r + 3, cy + r + 8), fill=shadow)
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 211, 56, 255), outline=(235, 157, 28, 255), width=4)
        draw.ellipse((cx - r + 10, cy - r + 8, cx + r - 16, cy - 6), fill=(255, 237, 118, 105))

        eye_y = cy - 18
        draw.arc((cx - 42, eye_y - 8, cx - 14, eye_y + 14), 18, 162, fill=(76, 48, 20, 255), width=5)
        draw.arc((cx + 14, eye_y - 8, cx + 42, eye_y + 14), 18, 162, fill=(76, 48, 20, 255), width=5)

        mouth_h = 34 + 7 * math.sin(t * math.tau)
        mouth_w = 68 if kind != "grin" else 82
        mouth_y = cy + 18
        draw.rounded_rectangle((cx - mouth_w / 2, mouth_y - mouth_h / 2, cx + mouth_w / 2, mouth_y + mouth_h / 2), radius=18, fill=(76, 38, 28, 255))
        draw.arc((cx - mouth_w / 2 + 6, mouth_y - mouth_h / 2 + 2, cx + mouth_w / 2 - 6, mouth_y + mouth_h / 2 + 24), 18, 162, fill=(255, 255, 255, 230), width=8)

        if kind in {"tears", "rofl", "cry", "snort", "wave"}:
            tear_shift = 5 * math.sin(t * math.tau)
            draw_teardrop(draw, cx - 57, cy + 2 + tear_shift, 1.0, 235)
            draw_teardrop(draw, cx + 57, cy + 2 - tear_shift, 1.0, 235)
        if kind in {"spark", "pop", "zoom"}:
            for n in range(5):
                a = t * math.tau + n * 1.35
                sx = cx + math.cos(a) * 88
                sy = cy + math.sin(a) * 76
                draw.ellipse((sx - 4, sy - 4, sx + 4, sy + 4), fill=(255, 178, 0, 210))
        if kind in {"rofl", "tilt"}:
            layer = layer.rotate(tilt, resample=Image.Resampling.BICUBIC, center=(110, 110))

        img.alpha_composite(layer)
        frames.append(img)
    return frames


def make_cta_frames(text: str, bg: str, fg: str) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for i in range(18):
        t = i / 17
        pulse = 1 + 0.045 * math.sin(t * math.tau)
        click = 1 if 0.32 < t < 0.55 else 0
        img = Image.new("RGBA", (220, 220), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        w = 184 * pulse
        h = 64 * pulse
        x = (220 - w) / 2
        y = 75 + math.sin(t * math.tau * 2) * 4
        draw.rounded_rectangle((x + 4, y + 8, x + w + 4, y + h + 8), radius=26, fill=(0, 0, 0, 42))
        draw.rounded_rectangle((x, y, x + w, y + h), radius=26, fill=bg, outline=(255, 255, 255, 230), width=4)

        font = FONT_SMALL if len(text) > 7 else FONT_HEAVY
        tw, th = text_size(draw, text, font)
        draw.text(((220 - tw) / 2, y + (h - th) / 2 - 3), text, font=font, fill=fg)

        hand_x = 160 + math.sin(t * math.tau) * 7
        hand_y = 139 - click * 9
        draw.rounded_rectangle((hand_x - 18, hand_y - 5, hand_x + 20, hand_y + 20), radius=11, fill=(255, 215, 161, 255), outline=(128, 92, 54, 210), width=2)
        draw.polygon([(hand_x + 6, hand_y - 24), (hand_x + 22, hand_y - 3), (hand_x + 4, hand_y - 2)], fill=(255, 215, 161, 255), outline=(128, 92, 54, 210))
        if click:
            for radius in (18, 28):
                draw.ellipse((hand_x - radius, hand_y - radius, hand_x + radius, hand_y + radius), outline=(255, 255, 255, 170), width=3)
        frames.append(img)
    return frames


def save_gif(path: Path, frames: list[Image.Image]) -> None:
    frames[0].save(
        path,
        save_all=True,
        append_images=frames[1:],
        duration=58,
        loop=0,
        disposal=2,
        optimize=True,
    )


files: list[str] = []
wanted = {file for file, _ in LAUGH_ASSETS} | {file for file, *_ in CTA_ASSETS}
for existing in OUT.glob("*.gif"):
    if existing.name not in wanted:
        existing.unlink()

for file, kind in LAUGH_ASSETS:
    save_gif(OUT / file, make_laugh_frames(kind))
    files.append(file)

for file, text, bg, fg in CTA_ASSETS:
    save_gif(OUT / file, make_cta_frames(text, bg, fg))
    files.append(file)

(OUT / "sources.json").write_text(
    json.dumps(
        {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "license": "Project-owned generated transparent GIF sticker animations; no external imagery.",
            "groups": {
                "laugh": "Laugh",
                "cta": "CTA",
            },
            "files": sorted(files),
            "generator": "src/scripts/build-creator-motion-gifs.py",
        },
        ensure_ascii=False,
        indent=2,
    )
    + "\n",
    encoding="utf-8",
)

print(f"generated {len(files)} gifs in {OUT}")

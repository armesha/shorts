#!/usr/bin/env python3
"""Normalize a source puzzle image for the visual-riddles card frame.

Trims the image's own near-white margins (so the puzzle fills the frame instead of
floating tiny inside a white box), stretches contrast (faded vintage engravings read
poorly on a phone), and caps the long side at maxdim px (keeps the inlined data URI
small so Chrome's setContent does not time out on huge library scans).

Usage: python _vr-prep.py <src> <out> [maxdim=1200]
"""
import sys
from PIL import Image, ImageChops, ImageOps


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    maxdim = int(sys.argv[3]) if len(sys.argv) > 3 else 1200

    im = Image.open(src)
    # Flatten transparency onto white (cards sit on a white mat).
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(bg, im).convert("RGB")
    else:
        im = im.convert("RGB")

    # Trim near-white border: bounding box of pixels that differ from white.
    gray = im.convert("L")
    diff = ImageChops.difference(gray, Image.new("L", gray.size, 255))
    mask = diff.point(lambda p: 255 if p > 8 else 0)
    bbox = mask.getbbox()
    if bbox:
        pad = 10
        left, top, right, bot = bbox
        im = im.crop((max(0, left - pad), max(0, top - pad),
                      min(im.size[0], right + pad), min(im.size[1], bot + pad)))

    # Stretch contrast (no-op for already-pure black/white line art; rescues faded scans).
    im = ImageOps.autocontrast(im, cutoff=1)

    # Cap long side.
    w, h = im.size
    scale = min(1.0, maxdim / max(w, h))
    if scale < 1.0:
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)

    save_kwargs = {"quality": 92} if out.lower().endswith((".jpg", ".jpeg")) else {}
    im.save(out, **save_kwargs)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Tile visual-riddle card PNGs into contact sheets for fast visual QA.

Usage: python _vr-contact.py <dir-with-card-pngs> <out-prefix> [cols=4] [rows=4]
Skips *.work.png intermediates. Each thumb is labelled with its id so culling is precise.
"""
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont

srcdir, outpref = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
rows = int(sys.argv[4]) if len(sys.argv) > 4 else 4
cw, ch, lab, pad = 260, 462, 30, 12

files = sorted(f for f in glob.glob(os.path.join(srcdir, "*.png")) if ".work" not in os.path.basename(f))
per = cols * rows
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
except Exception:
    font = ImageFont.load_default()

sheets = 0
for s in range(0, len(files), per):
    chunk = files[s:s + per]
    W = cols * (cw + pad) + pad
    H = rows * (ch + lab + pad) + pad
    sheet = Image.new("RGB", (W, H), (235, 235, 235))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        r, c = divmod(i, cols)
        x, y = pad + c * (cw + pad), pad + r * (ch + lab + pad)
        try:
            im = Image.open(f).convert("RGB")
            im.thumbnail((cw, ch))
            sheet.paste(im, (x, y))
        except Exception:
            d.rectangle([x, y, x + cw, y + ch], outline=(200, 0, 0), width=3)
            d.text((x + 6, y + 6), "ERR", fill=(200, 0, 0), font=font)
        d.text((x, y + ch + 4), os.path.basename(f).replace(".png", ""), fill=(0, 0, 0), font=font)
    sheets += 1
    out = f"{outpref}_{sheets}.jpg"
    sheet.save(out, quality=88)
    print(out, len(chunk))
print("sheets:", sheets, "cards:", len(files))

#!/usr/bin/env python3
import json
import os
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path.cwd()
SOURCE_PACK = ROOT / "data/packs/new-memes-ru-superadmin.json"
CACHE_FILE = ROOT / "tmp/new-memes-pl-translation-cache.json"
ASSET_DIR = ROOT / "assets/template-packs/new-memes/pl"
PACK_FILE = ROOT / "data/packs/new-memes-pl-superadmin.json"
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
LIMIT = int(os.environ.get("PL_MEMES_LIMIT", "1000"))
RENDER_ONLY = os.environ.get("PL_MEMES_RENDER_ONLY", "").strip() == "1"
TRANSLATE_DELAY = float(os.environ.get("PL_MEMES_TRANSLATE_DELAY", "0.08"))
TRANSLATE_WORKERS = int(os.environ.get("PL_MEMES_TRANSLATE_WORKERS", "4"))
ANALYSIS_WIDTH = int(os.environ.get("PL_MEMES_ANALYSIS_WIDTH", "200"))
CACHE_LOCK = threading.Lock()


def read_json(path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def translate(text, cache):
    text = str(text or "").strip()
    if not text:
        return ""
    key = f"ru:pl:{text}"
    with CACHE_LOCK:
        if key in cache:
            return cache[key]
    params = urllib.parse.urlencode(
        {
            "client": "gtx",
            "sl": "ru",
            "tl": "pl",
            "dt": "t",
            "q": text,
        }
    )
    url = f"https://translate.googleapis.com/translate_a/single?{params}"
    last_error = None
    for attempt in range(1, 7):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "shareboard-meme-localizer/1.0"})
            with urllib.request.urlopen(req, timeout=20) as res:
                data = json.loads(res.read().decode("utf-8"))
            out = "".join(str(part[0] or "") for part in (data[0] or [])).strip()
            if not out:
                raise RuntimeError("empty translation")
            translated = polish_cleanup(out)
            with CACHE_LOCK:
                cache[key] = translated
            time.sleep(TRANSLATE_DELAY)
            return translated
        except Exception as exc:
            last_error = exc
            time.sleep(0.5 * attempt)
    raise RuntimeError(f"translation failed: {last_error}")


def polish_cleanup(text):
    replacements = {
        "„": '"',
        "”": '"',
        "«": '"',
        "»": '"',
        "—": "-",
    }
    out = str(text or "").strip()
    for src, dst in replacements.items():
        out = out.replace(src, dst)
    out = out.replace("...", "...")
    return out


def image_src(template):
    for el in template.get("elements", []):
        if el.get("type") == "image" and el.get("src"):
            return el["src"]
    raise RuntimeError(f"template has no image element: {template.get('name')}")


def pixel_value(pixel):
    r, g, b = pixel
    return (r + g + b) / 3, max(r, g, b) - min(r, g, b)


def is_background_pixel(pixel, kind):
    value, spread = pixel_value(pixel)
    if kind == "light":
        return value > 232 and spread < 48
    return value < 48


def row_background_flags(rgb, kind):
    width, height = rgb.size
    step = max(1, width // 360)
    flags = []
    for y in range(height):
        total = 0
        matches = 0
        for x in range(0, width, step):
            value, spread = pixel_value(rgb.getpixel((x, y)))
            total += 1
            if kind == "light" and value > 232 and spread < 48:
                matches += 1
            if kind == "dark" and value < 48:
                matches += 1
        threshold = 0.52 if kind == "light" else 0.66
        flags.append(matches / max(1, total) > threshold)
    return flags


def edge_background_flags(rgb, kind):
    width, height = rgb.size
    edge = max(4, min(24, width // 16))
    flags = []
    for y in range(height):
        total = 0
        matches = 0
        for x in range(0, edge):
            value, spread = pixel_value(rgb.getpixel((x, y)))
            total += 1
            if kind == "light" and value > 232 and spread < 48:
                matches += 1
            if kind == "dark" and value < 48:
                matches += 1
        for x in range(max(edge, width - edge), width):
            value, spread = pixel_value(rgb.getpixel((x, y)))
            total += 1
            if kind == "light" and value > 232 and spread < 48:
                matches += 1
            if kind == "dark" and value < 48:
                matches += 1
        flags.append(matches / max(1, total) > 0.72)
    return flags


def component_background_bands(rgb, kind):
    width, height = rgb.size
    pixels = list(rgb.getdata())
    total_pixels = width * height
    visited = bytearray(total_pixels)
    min_area = max(180, int(total_pixels * 0.012))
    min_width = int(width * 0.34)
    min_height = max(10, int(height * 0.025))
    bands = []

    for start in range(total_pixels):
        if visited[start] or not is_background_pixel(pixels[start], kind):
            visited[start] = 1
            continue
        stack = [start]
        visited[start] = 1
        area = 0
        min_x = width
        max_x = 0
        min_y = height
        max_y = 0
        while stack:
            idx = stack.pop()
            y, x = divmod(idx, width)
            area += 1
            if x < min_x:
                min_x = x
            if x > max_x:
                max_x = x
            if y < min_y:
                min_y = y
            if y > max_y:
                max_y = y
            if x > 0:
                nxt = idx - 1
                if not visited[nxt] and is_background_pixel(pixels[nxt], kind):
                    visited[nxt] = 1
                    stack.append(nxt)
            if x + 1 < width:
                nxt = idx + 1
                if not visited[nxt] and is_background_pixel(pixels[nxt], kind):
                    visited[nxt] = 1
                    stack.append(nxt)
            if y > 0:
                nxt = idx - width
                if not visited[nxt] and is_background_pixel(pixels[nxt], kind):
                    visited[nxt] = 1
                    stack.append(nxt)
            if y + 1 < height:
                nxt = idx + width
                if not visited[nxt] and is_background_pixel(pixels[nxt], kind):
                    visited[nxt] = 1
                    stack.append(nxt)
        band_w = max_x - min_x + 1
        band_h = max_y - min_y + 1
        if area >= min_area and band_w >= min_width and band_h >= min_height:
            bands.append((min_x, min_y, max_x, max_y, kind))
    return bands


def analysis_image(image):
    rgb = image.convert("RGB")
    width, height = rgb.size
    if width <= ANALYSIS_WIDTH:
        return rgb, 1.0, 1.0
    sample_width = max(80, ANALYSIS_WIDTH)
    sample_height = max(1, round(height * sample_width / width))
    resampling = getattr(Image, "Resampling", Image).BILINEAR
    sample = rgb.resize((sample_width, sample_height), resampling)
    return sample, width / sample_width, height / sample_height


def scale_band_to_original(band, scale_x, scale_y, width, height):
    x0, y0, x1, y1, kind = band
    return (
        max(0, int(x0 * scale_x) - 2),
        max(0, int(y0 * scale_y) - 2),
        min(width - 1, int((x1 + 1) * scale_x) + 2),
        min(height - 1, int((y1 + 1) * scale_y) + 2),
        kind,
    )


def detect_text_bands(image):
    original = image.convert("RGB")
    width, height = original.size
    rgb, scale_x, scale_y = analysis_image(original)
    sample_width, sample_height = rgb.size
    bands = []
    for kind in ("light", "dark"):
        sample_bands = []
        full_rows = row_background_flags(rgb, kind)
        edge_rows = edge_background_flags(rgb, kind)
        row_sets = [
            full_rows,
            edge_rows,
            [full or edge for full, edge in zip(full_rows, edge_rows)],
        ]
        for rows in row_sets:
            raw = extract_row_bands(rows, sample_height, kind)
            for start, end, band_kind in merge_row_bands(raw, sample_height):
                x0, x1 = detect_band_x_bounds(rgb, start, end, band_kind)
                sample_band_w = x1 - x0 + 1
                sample_band_h = end - start + 1
                if sample_band_w >= sample_width * 0.42 and sample_band_h >= max(10, sample_height * 0.025):
                    sample_bands.append((x0, start, x1, end, band_kind))
        sample_bands.extend(component_background_bands(rgb, kind))
        for sample_band in {band for band in sample_bands}:
            band = scale_band_to_original(sample_band, scale_x, scale_y, width, height)
            band_w = band[2] - band[0] + 1
            band_h = band[3] - band[1] + 1
            if band_w >= width * 0.34 and band_h >= max(36, height * 0.025):
                bands.append(band)
                if (
                    band[4] == "dark"
                    and band[1] <= height * 0.08
                    and band_w >= width * 0.85
                    and band_h >= height * 0.52
                ):
                    capped_h = max(int(height * 0.28), min(int(height * 0.36), band_h))
                    bands.append((band[0], band[1], band[2], min(height - 1, band[1] + capped_h), band[4]))
    if not bands:
        bands.append((0, 0, width - 1, min(height - 1, int(height * 0.34)), "light"))
    return bands


def extract_row_bands(rows, height, kind):
    raw = []
    start = None
    min_run = max(6, int(height * 0.018))
    for y, ok in enumerate(rows + [False]):
        if ok and start is None:
            start = y
        elif not ok and start is not None:
            end = y - 1
            if end - start + 1 >= min_run:
                raw.append((start, end, kind))
            start = None
    return raw


def merge_row_bands(raw, height):
    merged = []
    max_gap = max(12, int(height * 0.04))
    for start, end, kind in raw:
        if merged and start - merged[-1][1] <= max_gap:
            merged[-1] = (merged[-1][0], end, kind)
        else:
            merged.append((start, end, kind))
    return merged


def detect_band_x_bounds(rgb, y0, y1, kind):
    width, _ = rgb.size
    span = max(1, y1 - y0 + 1)
    good = []
    step = max(1, span // 220)
    for x in range(width):
        total = 0
        matches = 0
        for y in range(y0, y1 + 1, step):
            value, spread = pixel_value(rgb.getpixel((x, y)))
            total += 1
            if kind == "light" and value > 232 and spread < 48:
                matches += 1
            if kind == "dark" and value < 42:
                matches += 1
        good.append(matches / max(1, total) > 0.38)
    runs = []
    start = None
    for x, ok in enumerate(good + [False]):
        if ok and start is None:
            start = x
        elif not ok and start is not None:
            if x - start >= max(40, int(width * 0.12)):
                runs.append((start, x - 1))
            start = None
    if not runs:
        return 0, width - 1
    x0, x1 = max(runs, key=lambda run: run[1] - run[0])
    x0 = max(0, x0 - 2)
    x1 = min(width - 1, x1 + 2)
    return x0, x1


def score_text_band(image, band):
    x0, y0, x1, y1, kind = band
    original = image.convert("RGB")
    width, height = original.size
    rgb, scale_x, scale_y = analysis_image(original)
    sample_width, sample_height = rgb.size
    x0 = max(0, min(sample_width - 1, int(x0 / scale_x)))
    x1 = max(0, min(sample_width - 1, int(x1 / scale_x)))
    y0 = max(0, min(sample_height - 1, int(y0 / scale_y)))
    y1 = max(0, min(sample_height - 1, int(y1 / scale_y)))
    band_w = x1 - x0 + 1
    band_h = y1 - y0 + 1
    if band_w < sample_width * 0.42 or band_h < sample_height * 0.025:
        return -1
    step_x = max(1, band_w // 220)
    step_y = max(1, band_h // 220)
    total = 0
    background = 0
    foreground = 0
    for y in range(y0, y1 + 1, step_y):
        for x in range(x0, x1 + 1, step_x):
            value, spread = pixel_value(rgb.getpixel((x, y)))
            total += 1
            if kind == "light":
                if value > 232 and spread < 48:
                    background += 1
                if value < 95:
                    foreground += 1
            else:
                if value < 48:
                    background += 1
                if value > 185 and spread < 90:
                    foreground += 1
    background_ratio = background / max(1, total)
    foreground_ratio = foreground / max(1, total)
    text_score = max(0, 1 - abs(foreground_ratio - 0.11) / 0.11)
    center_y = (y0 + y1) / 2
    top_bonus = max(0, 1 - center_y / (sample_height * 0.75))
    area_score = min(1, (band_w * band_h) / (sample_width * sample_height * 0.38))
    kind_bonus = 0.18 if kind == "light" else 0
    return background_ratio * 2 + text_score * 2 + top_bonus * 1.5 + area_score * 0.35 + kind_bonus


def choose_text_band(image, bands, text=""):
    best = max(bands, key=lambda band: score_text_band(image, band))
    width, height = image.size
    if best[4] == "light" and best[1] <= height * 0.14:
        containing = [
            band
            for band in bands
            if band[4] == best[4]
            and band[0] <= best[0] + width * 0.04
            and band[2] >= best[2] - width * 0.04
            and band[1] <= best[1] + height * 0.04
            and band[3] >= best[3] + height * 0.12
            and (band[2] - band[0] + 1) >= width * 0.85
        ]
        if containing:
            reasonable = [band for band in containing if (band[3] - band[1] + 1) <= height * 0.45]
            if reasonable:
                return max(reasonable, key=lambda band: score_text_band(image, band))
            if len(str(text or "")) >= 260:
                return max(containing, key=lambda band: score_text_band(image, band))
    return best


def wrap_text(text, font, max_width):
    lines = []
    draw = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    for paragraph in str(text or "").splitlines() or [""]:
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
                current = candidate
                continue
            if current:
                lines.append(current)
            if draw.textbbox((0, 0), word, font=font)[2] <= max_width:
                current = word
            else:
                current = ""
                part = ""
                for ch in word:
                    candidate_part = part + ch
                    if draw.textbbox((0, 0), candidate_part, font=font)[2] <= max_width:
                        part = candidate_part
                    else:
                        if part:
                            lines.append(part)
                        part = ch
                current = part
        if current:
            lines.append(current)
    return lines


def measure_lines(lines, font, line_gap):
    draw = ImageDraw.Draw(Image.new("RGB", (10, 10)))
    widths = []
    heights = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line or " ", font=font)
        widths.append(bbox[2] - bbox[0])
        heights.append(bbox[3] - bbox[1])
    if not lines:
        return 0, 0
    line_height = max(1, max(heights))
    total_h = len(lines) * line_height + max(0, len(lines) - 1) * line_gap
    return max(widths, default=0), total_h


def fitted_text(text, box_w, box_h):
    max_size = max(22, min(94, int(box_w * 0.085)))
    min_size = max(13, min(24, int(box_w * 0.035)))
    best = None
    for size in range(max_size, min_size - 1, -1):
        font = ImageFont.truetype(FONT_PATH, size=size)
        line_gap = max(2, int(size * 0.18))
        lines = wrap_text(text, font, box_w)
        _, total_h = measure_lines(lines, font, line_gap)
        if total_h <= box_h:
            best = (font, lines, line_gap)
            break
    if best:
        return best
    font = ImageFont.truetype(FONT_PATH, size=min_size)
    return font, wrap_text(text, font, box_w), max(2, int(min_size * 0.15))


def draw_caption(image, band, text):
    x0, y0, x1, y1, kind = band
    draw = ImageDraw.Draw(image)
    fill = (255, 255, 255) if kind == "light" else (18, 18, 18)
    ink = (18, 18, 18) if kind == "light" else (248, 248, 248)
    draw.rectangle((x0, y0, x1, y1), fill=fill)
    w = x1 - x0 + 1
    h = y1 - y0 + 1
    pad_x = max(12, int(w * 0.065))
    pad_y = max(10, int(h * 0.075))
    font, lines, line_gap = fitted_text(text, max(1, w - 2 * pad_x), max(1, h - 2 * pad_y))
    line_w, total_h = measure_lines(lines, font, line_gap)
    y = y0 + max(pad_y, (h - total_h) // 2)
    for line in lines:
        bbox = draw.textbbox((0, 0), line or " ", font=font)
        line_width = bbox[2] - bbox[0]
        x = x0 + (w - line_width) // 2
        draw.text((x, y - bbox[1]), line, font=font, fill=ink)
        y += (bbox[3] - bbox[1]) + line_gap


def render_card(src_path, dst_path, translated):
    image = Image.open(src_path).convert("RGB")
    bands = detect_text_bands(image)
    target = choose_text_band(image, bands, translated)
    draw_caption(image, target, translated)
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(dst_path, "JPEG", quality=92, optimize=True)
    return target


def hidden_killbox(id_, role, y, max_chars):
    return {
        "id": id_,
        "type": "killbox",
        "x": 0,
        "y": y,
        "w": 1,
        "h": 1,
        "rot": 0,
        "role": role,
        "padX": 0,
        "padY": 0,
        "align": "left",
        "valign": "top",
        "font": {"family": "Inter", "size": 1, "weight": 400, "color": "#00000000", "lineHeight": 1},
        "fitMin": 1,
        "fitMax": 1,
        "maxChars": max_chars,
        "placeholder": role,
    }


def template_for(file_name, index):
    return {
        "version": 1,
        "name": f"new-memes-pl-{index + 1:03d}",
        "canvas": {"w": 1080, "h": 1920, "bg": "#111111"},
        "elements": [
            {
                "id": "card",
                "type": "image",
                "x": 0,
                "y": 0,
                "w": 1080,
                "h": 1920,
                "rot": 0,
                "src": f"assets/template-packs/new-memes/pl/{file_name}",
                "fit": "cover",
            },
            hidden_killbox("title", "title", 0, 260),
            hidden_killbox("source", "source", 1, 1200),
        ],
    }


def main():
    source_pack = read_json(SOURCE_PACK, None)
    if not source_pack:
        raise SystemExit(f"Missing source pack: {SOURCE_PACK}")
    cache = read_json(CACHE_FILE, {})
    cards = source_pack["cards"][:LIMIT]
    templates = source_pack["templates"][:LIMIT]
    titles_ru = [card.get("values", {}).get("title", "") for card in cards]
    if RENDER_ONLY:
        translations = [cache.get(f"ru:pl:{title}", title) for title in titles_ru]
    else:
        translations = [None] * len(titles_ru)
        with ThreadPoolExecutor(max_workers=max(1, TRANSLATE_WORKERS)) as pool:
            futures = {pool.submit(translate, title, cache): index for index, title in enumerate(titles_ru)}
            for done, future in enumerate(as_completed(futures), start=1):
                index = futures[future]
                translations[index] = future.result()
                if done % 25 == 0:
                    write_json(CACHE_FILE, cache)
                    print(f"[pl-memes] translated {done}/{len(titles_ru)}", flush=True)
        write_json(CACHE_FILE, cache)
    rows = []
    for index, (card, template, title_pl) in enumerate(zip(cards, templates, translations), start=1):
        src_rel = image_src(template)
        src_path = ROOT / src_rel
        file_name = src_path.name
        title_ru = card.get("values", {}).get("title", "")
        if not title_pl:
            title_pl = title_ru
        target_path = ASSET_DIR / file_name
        band = render_card(src_path, target_path, title_pl)
        rows.append(
            {
                "file": file_name,
                "title_ru": title_ru,
                "title_pl": title_pl,
                "band": band,
                "src": src_rel,
            }
        )
        if index % 25 == 0:
            write_json(CACHE_FILE, cache)
            print(f"[pl-memes] rendered {index}/{len(cards)}", flush=True)
    write_json(CACHE_FILE, cache)

    generated_at = "2026-07-05T00:00:00.000Z"
    pack = {
        "id": "new-memes-pl-superadmin",
        "owners": [1],
        "createdBy": 1,
        "name": "Nowe memy",
        "lang": "pl",
        "templates": [template_for(row["file"], index) for index, row in enumerate(rows)],
        "cards": [
            {
                "values": {
                    "title": row["title_pl"],
                    "source": f"Polish localized ready-made meme card {Path(row['file']).stem} from pack:new-memes-ru-superadmin.",
                },
                "addedAt": generated_at,
            }
            for row in rows
        ],
        "createdAt": generated_at,
        "grants": [],
        "autoExpireMode": "per_account",
        "notes": {
            "source": "Polish localization of pack:new-memes-ru-superadmin; original photo/card image reused, Russian caption area redrawn with Polish text.",
            "translation": "Machine translated ru->pl via translate.googleapis.com with local cache at tmp/new-memes-pl-translation-cache.json.",
            "cards": len(rows),
        },
    }
    write_json(PACK_FILE, pack)
    write_json(
        ROOT / "data/output/new-memes-pl-build-report.json",
        {
            "packId": pack["id"],
            "cards": len(rows),
            "assetDir": str(ASSET_DIR.relative_to(ROOT)),
            "packFile": str(PACK_FILE.relative_to(ROOT)),
            "sample": rows[:20],
        },
    )
    print(json.dumps({"packId": pack["id"], "cards": len(rows), "packFile": str(PACK_FILE)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()

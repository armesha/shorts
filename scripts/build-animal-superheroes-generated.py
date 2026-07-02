#!/usr/bin/env python3
import argparse
import base64
import json
import math
import os
import random
import subprocess
import wave
from pathlib import Path
from urllib import request, error

from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path.cwd()
SOURCE = ROOT / "data/animal-superheroes/episodes-source.json"
ADMIN_DIR = ROOT / "data/output/admin-demos"
SCENE_ROOT = ROOT / "tmp/animal-superheroes/gpt-image2/generated_scenes"
WORK_ROOT = ROOT / "tmp/animal-superheroes/generated-build"
VOICE_DIR = ROOT / "tmp/animal-superheroes/voice-jessica"
MUSIC = ROOT / "assets/audio/animal-superheroes/sunflower-valley-isaiah658.mp3"

W, H, FPS = 1080, 1920, 30
VOICE_ID = "cgSgspJ2msm6clMCkdW9"
FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
END_CARD_SECONDS = 2.5
SUBTITLE_SAFE_LEFT = 70
SUBTITLE_SAFE_RIGHT = 190
SUBTITLE_SAFE_TOP = 420
SUBTITLE_SAFE_BOTTOM = 1320
SUBTITLE_TARGET_CENTER_Y = 1140
SUBTITLE_ACTIVE_FILL = (255, 221, 76)
SUBTITLE_ACTIVE_SHADOW = (255, 176, 34, 120)

LANGS = {
    "ru": {
        "deck_id": "animal-superheroes",
        "deck_dir": ROOT / "data/animal-superheroes",
        "asset_dir": ROOT / "assets/fact-videos/animal-superheroes",
        "pack_title_key": "packTitle",
        "title_key": "title",
        "text_key": "text",
        "episode_label": "СЕРИЯ",
        "language_code": "ru",
    },
    "en": {
        "deck_id": "animal-superheroes-en",
        "deck_dir": ROOT / "data/animal-superheroes-en",
        "asset_dir": ROOT / "assets/fact-videos/animal-superheroes-en",
        "pack_title_key": "packTitleEn",
        "title_key": "titleEn",
        "text_key": "textEn",
        "episode_label": "EPISODE",
        "language_code": "en",
    },
}


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        os.environ.setdefault(key, value)


def eleven_keys() -> list[str]:
    raw = [
        os.environ.get("ELEVENLABS_API_KEYS", ""),
        os.environ.get("ELEVENLABS_API_KEY", ""),
    ]
    raw.extend(v for k, v in sorted(os.environ.items()) if k.startswith("ELEVENLABS_API_KEY_"))
    keys: list[str] = []
    for chunk in ",".join(raw).replace(";", ",").split(","):
        key = chunk.strip()
        if key and key not in keys:
            keys.append(key)
    return keys


def sh(args: list[str], timeout: int = 300) -> str:
    return subprocess.check_output(args, cwd=ROOT, text=True, timeout=timeout)


def ffprobe_duration(path: Path) -> float:
    out = sh([
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ])
    return float(out.strip())


def lang_config(lang: str) -> dict:
    return LANGS[lang]


def pack_title(source: dict, lang: str) -> str:
    if lang == "en":
        return "Animal Heroes"
    if lang == "ru":
        return "ЗвероГерои"
    cfg = lang_config(lang)
    return source.get(cfg["pack_title_key"]) or source["packTitle"]


def episode_title(ep: dict, lang: str) -> str:
    cfg = lang_config(lang)
    return ep.get(cfg["title_key"]) or ep["title"]


def episode_video_id(ep: dict, lang: str) -> str:
    if lang == "ru":
        return ep["id"]
    return ep["id"].replace("as_", "as_en_", 1)


def episode_segments(ep: dict, lang: str, for_tts: bool = False) -> list[dict]:
    cfg = lang_config(lang)
    key = "ttsTextEn" if for_tts and lang == "en" else "ttsText" if for_tts else cfg["text_key"]
    fallback_key = cfg["text_key"]
    return [{**seg, "text": seg.get(key) or seg.get(fallback_key) or seg["text"]} for seg in ep["segments"]]


def full_text(ep: dict, lang: str) -> str:
    return " ".join(seg["text"].strip() for seg in episode_segments(ep, lang, for_tts=True))


def tts(ep: dict, lang: str, force: bool = False) -> tuple[Path, dict]:
    voice_dir = VOICE_DIR / lang
    voice_dir.mkdir(parents=True, exist_ok=True)
    video_id = episode_video_id(ep, lang)
    audio = voice_dir / f"{video_id}.mp3"
    align = voice_dir / f"{video_id}.alignment.json"
    if audio.exists() and align.exists() and not force:
        return audio, json.loads(align.read_text())

    keys = eleven_keys()
    if not keys:
        raise RuntimeError("No ElevenLabs API keys found")

    body = {
        "text": full_text(ep, lang),
        "model_id": "eleven_multilingual_v2",
        "language_code": lang_config(lang)["language_code"],
        "voice_settings": {
            "stability": 0.43,
            "similarity_boost": 0.82,
            "style": 0.18,
            "use_speaker_boost": True,
            "speed": 1.08,
        },
        "apply_text_normalization": "auto",
    }
    payload = json.dumps(body, ensure_ascii=False).encode()
    last = ""
    for idx, key in enumerate(keys):
        req = request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/with-timestamps?output_format=mp3_44100_128",
            data=payload,
            method="POST",
            headers={
                "accept": "application/json",
                "content-type": "application/json",
                "xi-api-key": key,
            },
        )
        try:
            with request.urlopen(req, timeout=90) as res:
                data = json.loads(res.read().decode())
            audio.write_bytes(base64.b64decode(data["audio_base64"]))
            alignment = data.get("normalized_alignment") or data.get("alignment") or {}
            align.write_text(json.dumps(alignment, ensure_ascii=False, indent=2))
            print(f"tts {video_id}: key #{idx + 1} ...{key[-4:]}")
            return audio, alignment
        except error.HTTPError as e:
            msg = e.read().decode(errors="ignore").replace(key, "[secret]")[:220]
            last = f"{e.code} {msg}"
        except Exception as e:
            last = str(e)[:220]
    raise RuntimeError(f"ElevenLabs TTS failed for {video_id}: {last}")


def find_segment_starts(ep: dict, lang: str, alignment: dict, audio_duration: float) -> list[float]:
    chars = alignment.get("characters") or []
    starts = alignment.get("character_start_times_seconds") or []
    text = "".join(chars)
    result = []
    cursor = 0
    segments = episode_segments(ep, lang, for_tts=True)
    for i, seg in enumerate(segments):
        needle = seg["text"].strip()
        pos = text.find(needle, cursor)
        if pos >= 0 and pos < len(starts):
            result.append(float(starts[pos]))
            cursor = pos + len(needle)
        else:
            result.append((i / max(1, len(segments))) * audio_duration)
    if result:
        result[0] = 0.0
    return result


def segment_word_timings(
    ep: dict,
    lang: str,
    alignment: dict,
    audio_duration: float,
    fallback_bounds: list[float],
) -> list[list[dict]]:
    chars = alignment.get("characters") or []
    starts = alignment.get("character_start_times_seconds") or []
    ends = alignment.get("character_end_times_seconds") or []
    aligned_text = "".join(chars)
    subtitles = episode_segments(ep, lang)
    spoken = episode_segments(ep, lang, for_tts=True)
    result: list[list[dict]] = []
    cursor = 0
    for idx, sub_seg in enumerate(subtitles):
        spoken_text = spoken[idx]["text"].strip()
        subtitle_words = sub_seg["text"].strip().split()
        seg_start = fallback_bounds[idx] if idx < len(fallback_bounds) else (idx / max(1, len(subtitles))) * audio_duration
        seg_end = fallback_bounds[idx + 1] if idx + 1 < len(fallback_bounds) else audio_duration
        pos = aligned_text.find(spoken_text, cursor)
        word_items: list[dict] = []
        spoken_words = spoken_text.split()
        if pos >= 0 and pos < len(starts) and len(spoken_words) == len(subtitle_words):
            local = pos
            for s_word, sub_word in zip(spoken_words, subtitle_words):
                while local < len(chars) and chars[local].isspace():
                    local += 1
                begin = local
                local += len(s_word)
                end_idx = max(begin, min(local - 1, len(starts) - 1))
                w_start = float(starts[begin]) if begin < len(starts) else seg_start
                w_end = float(ends[end_idx]) if end_idx < len(ends) else min(seg_end, w_start + 0.24)
                word_items.append({"word": sub_word, "start": w_start, "end": max(w_start + 0.12, w_end)})
            cursor = pos + len(spoken_text)
        else:
            # If TTS wording differs from subtitles, keep the highlight usable by spreading
            # words across the segment instead of lying about exact phoneme timing.
            span = max(0.3, seg_end - seg_start)
            step = span / max(1, len(subtitle_words))
            for n, word in enumerate(subtitle_words):
                w_start = seg_start + n * step
                word_items.append({"word": word, "start": w_start, "end": w_start + max(0.16, step * 0.86)})
        result.append(word_items)
    return result


def cover(im: Image.Image, size: tuple[int, int], fx: float, fy: float, zoom: float) -> Image.Image:
    tw, th = size
    iw, ih = im.size
    scale = max(tw / iw, th / ih) * zoom
    nw, nh = max(tw, math.ceil(iw * scale)), max(th, math.ceil(ih * scale))
    r = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, min(nw - tw, int(nw * fx - tw / 2))) if nw > tw else 0
    top = max(0, min(nh - th, int(nh * fy - th / 2))) if nh > th else 0
    return r.crop((left, top, left + tw, top + th)).convert("RGBA")


def ease(x: float) -> float:
    return x * x * (3 - 2 * x)


def text_box(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, stroke: int = 0) -> tuple[int, int]:
    b = draw.textbbox((0, 0), text, font=font, stroke_width=stroke)
    return b[2] - b[0], b[3] - b[1]


def wrap_words(draw: ImageDraw.ImageDraw, words: list[str], font: ImageFont.FreeTypeFont, maxw: int) -> list[list[str]]:
    lines: list[str] = []
    cur: list[str] = []
    for word in words:
        cand = [*cur, word]
        if not cur or text_box(draw, " ".join(cand), font, 5)[0] <= maxw:
            cur = cand
        else:
            lines.append(cur)
            cur = [word]
    if cur:
        lines.append(cur)
    return lines


def draw_overlay(frame: Image.Image, ep: dict, lang: str, header_title: str, words: list[dict], t: float) -> Image.Image:
    canvas = frame.convert("RGBA")
    d = ImageDraw.Draw(canvas)
    top = ImageFont.truetype(FONT_BOLD, 56)
    title_font = ImageFont.truetype(FONT_BOLD, 34)
    label = lang_config(lang)["episode_label"]
    d.text((38, 34), f"{label} {ep['episode']:02d}", font=top, fill=(255, 255, 255), stroke_width=7, stroke_fill=(0, 0, 0))
    while title_font.size >= 24 and text_box(d, header_title, title_font, 3)[0] > 520:
        title_font = ImageFont.truetype(FONT_BOLD, title_font.size - 2)
    tw = text_box(d, header_title, title_font, 3)[0]
    d.text((W - 42 - tw, 52), header_title, font=title_font, fill=(255, 255, 255), stroke_width=4, stroke_fill=(0, 0, 0))

    grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(900, 1405):
        dist = abs(y - SUBTITLE_TARGET_CENTER_Y) / 285
        a = int(max(0, 170 * (1 - dist ** 1.7)))
        gd.line((0, y, W, y), fill=(0, 0, 0, a))
    canvas.alpha_composite(grad)

    size = 72
    raw_words = [w["word"] for w in words]
    max_width = W - SUBTITLE_SAFE_LEFT - SUBTITLE_SAFE_RIGHT
    while size >= 48:
        font = ImageFont.truetype(FONT_BOLD, size)
        lines = wrap_words(d, raw_words, font, max_width)
        lh = int(size * 1.08)
        if len(lines) <= 3 and lh * len(lines) <= (SUBTITLE_SAFE_BOTTOM - SUBTITLE_SAFE_TOP):
            break
        size -= 3
    total = lh * len(lines)
    y = max(SUBTITLE_SAFE_TOP, min(SUBTITLE_SAFE_BOTTOM - total, SUBTITLE_TARGET_CENTER_Y - total // 2))
    active_idx = next((i for i, w in enumerate(words) if w["start"] <= t <= w["end"] + 0.06), -1)
    if active_idx < 0:
        nearby = [
            (abs(((w["start"] + w["end"]) / 2) - t), i)
            for i, w in enumerate(words)
            if w["start"] - 0.08 <= t <= w["end"] + 0.24
        ]
        if nearby:
            active_idx = min(nearby)[1]
    word_index = 0
    for line in lines:
        line_text = " ".join(line)
        tw = text_box(d, line_text, font, 6)[0]
        x = max(SUBTITLE_SAFE_LEFT, min((W - tw) // 2, W - SUBTITLE_SAFE_RIGHT - tw))
        cursor_x = x
        for n, word in enumerate(line):
            is_active = word_index == active_idx
            fill = SUBTITLE_ACTIVE_FILL if is_active else (255, 255, 255)
            draw_y = y
            stroke = 7
            if is_active:
                active_word = words[word_index]
                span = max(0.12, active_word["end"] - active_word["start"])
                local = max(0.0, min(1.0, (t - active_word["start"]) / span))
                lift = int(-5 * math.sin(math.pi * local))
                draw_y += lift
                stroke = 8
                wb = d.textbbox((cursor_x, draw_y), word, font=font, stroke_width=stroke)
                pad_x = 18
                pad_y = 7
                d.rounded_rectangle(
                    (wb[0] - pad_x, wb[1] - pad_y, wb[2] + pad_x, wb[3] + pad_y),
                    radius=16,
                    fill=(0, 0, 0, 105),
                    outline=(255, 221, 76, 72),
                    width=2,
                )
                d.text((cursor_x, draw_y + 3), word, font=font, fill=SUBTITLE_ACTIVE_SHADOW, stroke_width=0)
            d.text((cursor_x, draw_y), word, font=font, fill=fill, stroke_width=stroke, stroke_fill=(0, 0, 0))
            if is_active:
                d.text((cursor_x, draw_y - 1), word, font=font, fill=(255, 246, 150, 70), stroke_width=0)
            cursor_x += text_box(d, word, font, 6)[0]
            if n < len(line) - 1:
                cursor_x += text_box(d, " ", font, 0)[0]
            word_index += 1
        y += lh
    return canvas.convert("RGB")


def draw_end_card(ep: dict, lang: str) -> Image.Image:
    canvas = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(canvas)
    text = "Следующая серия\nуже на канале" if lang == "ru" else "Next episode\nis already on the channel"
    size = 92 if lang == "ru" else 84
    while size >= 58:
        font = ImageFont.truetype(FONT_BOLD, size)
        lines = text.splitlines()
        widths = [text_box(d, line, font, 0)[0] for line in lines]
        line_h = int(size * 1.16)
        if max(widths) <= W - 120 and line_h * len(lines) <= 360:
            break
        size -= 4
    total_h = line_h * len(lines)
    y = (H - total_h) // 2
    for line in lines:
        tw = text_box(d, line, font, 0)[0]
        d.text(((W - tw) // 2, y), line, font=font, fill=(255, 255, 255))
        y += line_h
    return canvas


def write_breaths(path: Path, duration: float, pulses: list[float]) -> None:
    rate = 44100
    n = int(duration * rate)
    rng = random.Random(42)
    samples = [0.0] * n
    for t in pulses:
        start = max(0, int(t * rate))
        length = int(0.42 * rate)
        for i in range(length):
            j = start + i
            if j >= n:
                break
            env = math.sin(math.pi * (i / length)) ** 1.8
            samples[j] += (rng.random() * 2 - 1) * env * 0.11
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        data = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            data.extend(int(v * 32767).to_bytes(2, "little", signed=True))
        w.writeframes(bytes(data))


def build_episode(source: dict, ep: dict, lang: str, force_tts: bool = False) -> dict:
    cfg = lang_config(lang)
    video_id = episode_video_id(ep, lang)
    segments = episode_segments(ep, lang)
    scene_dir = SCENE_ROOT / ep["id"]
    scenes = [scene_dir / f"scene_{i:02d}.png" for i in range(1, len(segments) + 1)]
    missing = [str(p) for p in scenes if not p.exists()]
    if missing:
        raise RuntimeError(f"Missing generated scenes for {ep['id']}: {missing[:3]}")

    audio, alignment = tts(ep, lang, force_tts)
    audio_duration = ffprobe_duration(audio)
    video_duration = min(35.0, max(20.0, audio_duration + 0.45 + END_CARD_SECONDS))
    end_card_start = max(video_duration - END_CARD_SECONDS, audio_duration + 0.25)
    end_card_start = min(end_card_start, video_duration - 0.8)
    content_duration = max(1.0, end_card_start)
    starts = find_segment_starts(ep, lang, alignment, audio_duration)
    bounds = starts + [content_duration]
    for i in range(1, len(bounds)):
        if bounds[i] <= bounds[i - 1] + 1.25:
            bounds[i] = bounds[i - 1] + 1.25
    if bounds[-1] > content_duration:
        scale = content_duration / bounds[-1]
        bounds = [b * scale for b in bounds]
    highlight_words = segment_word_timings(ep, lang, alignment, audio_duration, bounds)

    frame_dir = WORK_ROOT / "frames" / lang / video_id
    if frame_dir.exists():
        for f in frame_dir.glob("*.jpg"):
            f.unlink()
    frame_dir.mkdir(parents=True, exist_ok=True)
    images = [Image.open(p).convert("RGB") for p in scenes]
    transition = 0.28
    total_frames = math.ceil(video_duration * FPS)
    for fi in range(total_frames):
        t = fi / FPS
        if t >= end_card_start:
            frame = draw_end_card(ep, lang)
        else:
            idx = max(0, min(len(segments) - 1, next((i for i in range(len(bounds) - 1) if bounds[i] <= t < bounds[i + 1]), len(bounds) - 2)))
            start, end = bounds[idx], bounds[idx + 1]
            prog = 0.0 if end <= start else max(0.0, min(1.0, (t - start) / (end - start)))
            fx = 0.5 + 0.035 * math.sin((idx + 1) * 1.7)
            fy = 0.49 + 0.03 * math.cos((idx + 1) * 1.3)
            frame = cover(images[idx], (W, H), fx, fy - 0.03 * ease(prog), 1.0 + 0.09 * ease(prog))
            if idx < len(images) - 1 and end - t < transition:
                alpha = ease(max(0.0, min(1.0, (transition - (end - t)) / transition)))
                nxt = cover(images[idx + 1], (W, H), 0.5, 0.49, 1.0)
                frame = Image.blend(frame, nxt, alpha)
            frame = draw_overlay(frame, ep, lang, pack_title(source, lang), highlight_words[idx], t)
        frame.save(frame_dir / f"{fi + 1:05d}.jpg", quality=91, subsampling=1)

    breath_path = WORK_ROOT / "breaths" / lang / f"{video_id}.wav"
    # Keep this track available for the mix, but do not add per-scene noise pulses:
    # repeated breath/whoosh hits read like a page-turn transition SFX in Shorts.
    write_breaths(breath_path, video_duration, [])

    out = ADMIN_DIR / f"{video_id}.mp4"
    poster = ADMIN_DIR / f"{video_id}.jpg"
    fact = cfg["asset_dir"] / f"{video_id}.mp4"
    ADMIN_DIR.mkdir(parents=True, exist_ok=True)
    cfg["asset_dir"].mkdir(parents=True, exist_ok=True)
    fade_out = max(0, video_duration - 1.2)
    subprocess.check_call([
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-framerate",
        str(FPS),
        "-i",
        str(frame_dir / "%05d.jpg"),
        "-i",
        str(audio),
        "-i",
        str(breath_path),
        "-stream_loop",
        "-1",
        "-i",
        str(MUSIC),
        "-filter_complex",
        f"[1:a]volume=1.0[v];[2:a]volume=0.14[b];[3:a]volume=0.06,atrim=0:{video_duration:.3f},afade=t=in:st=0:d=0.8,afade=t=out:st={fade_out:.3f}:d=1.2[m];[v][b][m]amix=inputs=3:duration=longest:normalize=0,atrim=0:{video_duration:.3f},asetpts=N/SR/TB[a]",
        "-map",
        "0:v",
        "-map",
        "[a]",
        "-t",
        f"{video_duration:.3f}",
        "-r",
        str(FPS),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "19",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        str(out),
    ])
    subprocess.check_call(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", "0.8", "-i", str(out), "-frames:v", "1", "-q:v", "2", str(poster)])
    fact.write_bytes(out.read_bytes())

    timing = {
        "id": video_id,
        "sourceEpisodeId": ep["id"],
        "lang": lang,
        "duration": video_duration,
        "audioDuration": audio_duration,
        "bounds": bounds,
        "segments": segments,
    }
    timing_path = WORK_ROOT / "timing" / lang / f"{video_id}.json"
    timing_path.parent.mkdir(parents=True, exist_ok=True)
    timing_path.write_text(json.dumps(timing, ensure_ascii=False, indent=2))
    return {"id": video_id, "sourceEpisodeId": ep["id"], "lang": lang, "duration": video_duration, "mp4": str(out), "poster": str(poster)}


def update_catalog(lang: str, source: dict, built: list[dict]) -> None:
    cfg = lang_config(lang)
    deck_dir = cfg["deck_dir"]
    deck_dir.mkdir(parents=True, exist_ok=True)
    videos_path = deck_dir / "videos.json"
    current = json.loads(videos_path.read_text()) if videos_path.exists() else []
    by_episode = {int(x.get("episode", 9999)): x for x in current}
    source_by_id = {ep["id"]: ep for ep in source["episodes"]}
    for item in built:
        ep = source_by_id[item["sourceEpisodeId"]]
        by_episode[int(ep["episode"])] = {
            "file": f"{cfg['deck_id']}/{item['id']}.mp4",
            "title": episode_title(ep, lang),
            "text": full_text(ep, lang),
            "series": pack_title(source, lang),
            "episode": ep["episode"],
            "voice": "ElevenLabs Jessica",
            "lang": lang,
            "visualSource": ep["id"],
            "source": "gpt-image-2 generated scenes + ElevenLabs alignment subtitles",
        }
    videos = [by_episode[k] for k in sorted(by_episode)]
    videos_path.write_text(json.dumps(videos, ensure_ascii=False, indent=2) + "\n")
    (deck_dir / "index.json").write_text(json.dumps({"total": len(videos), "packs": 1, "packSize": len(videos), "range": [1, len(videos)]}, ensure_ascii=False, indent=2) + "\n")

    manifest_path = ADMIN_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    pack = next((p for p in manifest["packs"] if p["id"] == cfg["deck_id"]), None)
    if not pack:
        pack = {"id": cfg["deck_id"], "title": pack_title(source, lang), "lang": lang, "items": []}
        manifest["packs"].append(pack)
    pack["title"] = pack_title(source, lang)
    pack["lang"] = lang
    now = __import__("datetime").datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    pack["items"] = [
        {
            "id": Path(v["file"]).stem,
            "title": v["title"],
            "theme": "generated-scenes-jessica",
            "voice": "ElevenLabs Jessica",
            "dur": f"0:{round(next((b['duration'] for b in built if b['id'] == Path(v['file']).stem), 24)):02d}",
            "createdAt": now,
            "updatedAt": now,
        }
        for v in videos
    ]
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--episodes", nargs="+", required=True, help="Episode ids or numbers, e.g. as_02_stone_lions or 2")
    parser.add_argument("--lang", choices=["ru", "en", "both"], default="ru")
    parser.add_argument("--force-tts", action="store_true")
    args = parser.parse_args()

    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    source = json.loads(SOURCE.read_text())
    wanted = set(args.episodes)
    episodes = [
        ep
        for ep in source["episodes"]
        if str(ep["episode"]) in wanted or ep["id"] in wanted
    ]
    if not episodes:
        raise SystemExit("No matching episodes")
    langs = ["ru", "en"] if args.lang == "both" else [args.lang]
    all_built = []
    for lang in langs:
        built = [build_episode(source, ep, lang, args.force_tts) for ep in episodes]
        update_catalog(lang, source, built)
        all_built.extend(built)
    print(json.dumps(all_built, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DECK = ROOT / "data" / "quotes-de"
TARGET_DECK = ROOT / "data" / "quotes-de-2"
ASSET_DIR = ROOT / "assets" / "fact-videos"
CARD_DIR = TARGET_DECK / "render-cache" / "cards"
CONTACT_DIR = TARGET_DECK / "render-cache" / "contact"


def load_builder():
    path = ROOT / "scripts" / "build-quotes-de-cards.py"
    spec = importlib.util.spec_from_file_location("build_quotes_de_cards", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def qnum(file_name: str | None) -> int | None:
    match = re.fullmatch(r"q(\d+)\.mp4", str(file_name or ""))
    return int(match.group(1)) if match else None


def natural_file_key(item: dict[str, Any]) -> int:
    return qnum(item.get("file")) or 999999999


def file_ranges(files: list[str]) -> list[list[int]]:
    nums = sorted(n for n in (qnum(file) for file in files) if n is not None)
    if not nums:
        return []
    ranges: list[list[int]] = []
    start = prev = nums[0]
    for n in nums[1:]:
        if n == prev + 1:
            prev = n
            continue
        ranges.append([start, prev])
        start = prev = n
    ranges.append([start, prev])
    return ranges


def quote_key_from_video(builder: Any, item: dict[str, Any]) -> str:
    text = str(item.get("text", "")).replace("\n", " ")
    text = re.sub(r"^[„\"«](.*?)[“\"»]\s*—.*$", r"\1", text, flags=re.S)
    return builder.normalized_key(text)


def existing_quote_keys(builder: Any) -> set[str]:
    keys: set[str] = set()
    for deck in ["quotes-de", "quotes-de-1", "quotes-de-2", "quotes-de-3"]:
        for item in load_json(ROOT / "data" / deck / "videos.json", []):
            if isinstance(item, dict):
                keys.add(quote_key_from_video(builder, item))
    return keys


def existing_files() -> set[str]:
    files: set[str] = set()
    for deck in ["quotes-de", "quotes-de-1", "quotes-de-2", "quotes-de-3"]:
        for item in load_json(ROOT / "data" / deck / "videos.json", []):
            if isinstance(item, dict) and item.get("file"):
                files.add(str(item["file"]))
    return files


def next_ids(count: int, start_id: int | None) -> list[int]:
    used = [n for f in existing_files() for n in [qnum(f)] if n is not None]
    first = start_id if start_id is not None else max(used, default=0) + 1
    return list(range(first, first + count))


def collect_cached_candidates(builder: Any, args: argparse.Namespace) -> list[Any]:
    source_sources = load_json(SOURCE_DECK / "sources.json", {})
    portrait_sources = source_sources.get("portraitSources", {})
    if not isinstance(portrait_sources, dict):
        raise RuntimeError("data/quotes-de/sources.json has no portraitSources object")

    authors_path = SOURCE_DECK / "authors.json"
    authors = builder.load_authors(authors_path) if authors_path.exists() else copy.deepcopy(builder.DEFAULT_AUTHORS)
    existing = existing_quote_keys(builder)

    all_by_author: dict[str, list[Any]] = {}
    for author in authors:
        portrait = portrait_sources.get(author["name"])
        if not portrait:
            continue
        local_path = portrait.get("localPath")
        if not local_path or not (ROOT / local_path).exists():
            continue
        cache_file = SOURCE_DECK / "source-cache" / "wikiquote" / f"{builder.slugify(author['wikiquote'])}.wiki"
        if not cache_file.exists():
            continue
        wikitext = cache_file.read_text(encoding="utf-8")
        candidates = [item for item in builder.extract_quotes(author, wikitext) if builder.normalized_key(item.quote) not in existing]
        if candidates:
            all_by_author[author["name"]] = candidates
            print(f"{author['name']}: {len(candidates)} cached unused quotes")

    selected: list[Any] = []
    selected_keys: set[str] = set()
    per_author = {name: 0 for name in all_by_author}
    max_per_author = args.max_per_author
    while len(selected) < args.count:
        made_progress = False
        for name, candidates in sorted(all_by_author.items(), key=lambda x: len(x[1]), reverse=True):
            if per_author[name] >= max_per_author:
                continue
            while candidates:
                item = candidates.pop(0)
                key = builder.normalized_key(item.quote)
                if key in existing or key in selected_keys:
                    continue
                selected.append(item)
                selected_keys.add(key)
                per_author[name] += 1
                made_progress = True
                break
            if len(selected) >= args.count:
                break
        if len(selected) >= args.count:
            break
        if not made_progress:
            if max_per_author < args.hard_max_per_author:
                max_per_author += 2
                print(f"not enough cached quotes; relaxing max per author to {max_per_author}")
                continue
            break

    author_count = len({item.author for item in selected})
    print(f"selected {len(selected)} cached quotes from {author_count} authors")
    if len(selected) < args.count:
        raise RuntimeError(f"only selected {len(selected)} cached quotes; need {args.count}")
    if author_count < args.min_authors:
        raise RuntimeError(f"only {author_count} authors; need at least {args.min_authors}")
    return selected


def merge_deck(builder: Any, rendered_items: list[dict[str, Any]], metrics: list[dict[str, Any]]) -> None:
    existing_videos = load_json(TARGET_DECK / "videos.json", [])
    by_file = {item["file"]: item for item in existing_videos}
    for item in rendered_items:
        by_file[item["file"]] = {
            "file": item["file"],
            "title": builder.title_for(item["quote"], item["author"]),
            "text": f"„{item['quote']}“\n— {item['author']}",
            "author": item["author"],
        }
    next_videos = sorted(by_file.values(), key=natural_file_key)
    write_json(TARGET_DECK / "videos.json", next_videos)

    ranges = file_ranges([item["file"] for item in next_videos])
    write_json(
        TARGET_DECK / "index.json",
        {
            "total": len(next_videos),
            "packs": 1,
            "packSize": len(next_videos),
            **({"range": [ranges[0][0], ranges[-1][1]], "fileRanges": ranges} if ranges else {}),
        },
    )

    source_sources = load_json(SOURCE_DECK / "sources.json", {})
    target_sources = load_json(TARGET_DECK / "sources.json", {"items": [], "portraitSources": {}})
    source_portraits = source_sources.get("portraitSources", {}) if isinstance(source_sources, dict) else {}
    target_portraits = target_sources.get("portraitSources", {}) if isinstance(target_sources, dict) else {}
    portrait_sources = {**target_portraits}
    for item in rendered_items:
        if item["author"] in source_portraits:
            portrait_sources[item["author"]] = source_portraits[item["author"]]

    source_items = target_sources.get("items", []) if isinstance(target_sources, dict) else []
    source_by_file = {item["file"]: item for item in source_items if isinstance(item, dict) and item.get("file")}
    for item in rendered_items:
        source_by_file[item["file"]] = item
    write_json(
        TARGET_DECK / "sources.json",
        {
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "quoteSource": target_sources.get(
                "quoteSource",
                {
                    "name": "German Wikiquote",
                    "license": "CC BY-SA",
                    "note": "Each item records the source Wikiquote page and source bullet used for attribution review.",
                },
            ),
            "portraitSource": target_sources.get(
                "portraitSource",
                {
                    "name": "Wikimedia Commons via Wikidata P18",
                    "note": "Per-author Commons file, license and artist metadata are stored under portraitSources.",
                },
            ),
            "musicSource": target_sources.get(
                "musicSource",
                {
                    "name": "Procedural local synthesis",
                    "license": "No external audio source",
                    "generator": "scripts/build-quotes-de-cards.py",
                },
            ),
            "portraitSources": portrait_sources,
            "items": sorted(source_by_file.values(), key=natural_file_key),
        },
    )

    existing_metrics = load_json(TARGET_DECK / "layout-report.json", {"items": []}).get("items", [])
    metrics_by_file = {item["file"]: item for item in existing_metrics if isinstance(item, dict) and item.get("file")}
    for item in metrics:
        metrics_by_file[item["file"]] = item
    write_json(TARGET_DECK / "layout-report.json", {"items": [metrics_by_file[v["file"]] for v in next_videos if v["file"] in metrics_by_file]})


def main() -> None:
    parser = argparse.ArgumentParser(description="Safely top up only data/quotes-de-2 from cached German Wikiquote sources.")
    parser.add_argument("--count", type=int, default=125)
    parser.add_argument("--start-id", type=int, default=None)
    parser.add_argument("--max-per-author", type=int, default=16)
    parser.add_argument("--hard-max-per-author", type=int, default=30)
    parser.add_argument("--min-authors", type=int, default=8)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-video", action="store_true")
    parser.add_argument("--keep-render-cache", action="store_true")
    args = parser.parse_args()

    builder = load_builder()
    for path in [TARGET_DECK, ASSET_DIR, CARD_DIR, CONTACT_DIR]:
        path.mkdir(parents=True, exist_ok=True)

    selected = collect_cached_candidates(builder, args)
    ids = next_ids(len(selected), args.start_id)
    occupied_files = existing_files()
    for numeric_id in ids:
        file_name = f"q{numeric_id:03d}.mp4"
        if file_name in occupied_files:
            raise RuntimeError(f"refusing to overwrite existing deck item {file_name}")
        if (ASSET_DIR / file_name).exists() and not args.force:
            raise RuntimeError(f"refusing to overwrite existing asset {ASSET_DIR / file_name}")

    source_sources = load_json(SOURCE_DECK / "sources.json", {})
    portrait_sources = source_sources["portraitSources"]
    rendered_items: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    card_paths: list[Path] = []
    now = datetime.now(timezone.utc).isoformat()

    for index, (numeric_id, candidate) in enumerate(zip(ids, selected), start=1):
        qid = f"q{numeric_id:03d}"
        filename = f"{qid}.mp4"
        template_index = (numeric_id - 1) % (len(builder.TEMPLATES) * 3)
        music_name = f"quote-card-bg-{(numeric_id - 1) % 12 + 1:02d}.wav"
        music_path = SOURCE_DECK / "music" / music_name
        if not music_path.exists():
            raise RuntimeError(f"missing source music loop: {music_path}")

        item = {
            "id": qid,
            "file": filename,
            "author": candidate.author,
            "quote": candidate.quote,
            "wikiquoteTitle": candidate.wikiquote,
            "wikiquoteUrl": f"https://de.wikiquote.org/wiki/{builder.requests.utils.quote(candidate.wikiquote.replace(' ', '_'))}",
            "wikiquoteSection": candidate.section,
            "wikiquoteSourceLine": candidate.source_line,
            "template": builder.TEMPLATES[template_index % len(builder.TEMPLATES)]["id"],
            "templateIndex": template_index,
            "music": music_name,
            "policyReview": "auto-blocklist-pass; manual rule set from data/quotes-de/CONTENT-POLICY.md",
            "createdAt": now,
        }
        portrait_meta = portrait_sources[candidate.author]
        portrait_path = ROOT / portrait_meta["localPath"]
        card_path = CARD_DIR / f"{qid}.jpg"
        metric = builder.render_card(item, portrait_path, card_path)
        metric["file"] = filename
        metric["quoteChars"] = len(candidate.quote)
        metrics.append(metric)
        card_paths.append(card_path)

        duration = max(6.5, min(10.5, 4.8 + len(candidate.quote) / 48))
        item["duration"] = round(duration, 2)
        if not args.no_video:
            builder.render_video(card_path, music_path, ASSET_DIR / filename, duration, args.force)
        rendered_items.append(item)
        if index % 25 == 0:
            print(f"rendered {index}/{len(selected)}")

    builder.CONTACT_DIR = CONTACT_DIR
    sheets = builder.make_contact_sheets(card_paths)
    if not args.no_video:
        builder.verify_outputs(rendered_items, metrics)
        merge_deck(builder, rendered_items, metrics)
    if not args.keep_render_cache:
        shutil.rmtree(TARGET_DECK / "render-cache", ignore_errors=True)

    print(
        json.dumps(
            {
                "target": "data/quotes-de-2",
                "rendered": len(rendered_items),
                "first": rendered_items[0]["file"],
                "last": rendered_items[-1]["file"],
                "authors": len({item["author"] for item in rendered_items}),
                "renderCacheKept": args.keep_render_cache,
                "contactSheets": [str(path.relative_to(ROOT)) for path in sheets] if args.keep_render_cache else [],
                "minFont": min(m["fontSize"] for m in metrics),
                "maxLines": max(m["lines"] for m in metrics),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

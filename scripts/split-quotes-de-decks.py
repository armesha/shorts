#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data" / "quotes-de"
DEFAULT_OUTPUT_PREFIX = ROOT / "data" / "quotes-de"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def file_number(file_name: str) -> int | None:
    match = re.fullmatch(r"q(\d+)\.mp4", file_name)
    return int(match.group(1)) if match else None


def file_ranges(files: list[str]) -> list[list[int]]:
    numbers = sorted(n for file in files if (n := file_number(file)) is not None)
    if not numbers:
        return []
    ranges: list[list[int]] = []
    start = prev = numbers[0]
    for number in numbers[1:]:
        if number == prev + 1:
            prev = number
            continue
        ranges.append([start, prev])
        start = prev = number
    ranges.append([start, prev])
    return ranges


def split_chunks(items: list[dict[str, Any]], pack_size: int) -> list[list[dict[str, Any]]]:
    return [items[index : index + pack_size] for index in range(0, len(items), pack_size)]


def build_sources(
    aggregate_sources: dict[str, Any],
    chunk: list[dict[str, Any]],
) -> dict[str, Any]:
    chunk_files = {item["file"] for item in chunk}
    source_items = [
        item
        for item in aggregate_sources.get("items", [])
        if item.get("file") in chunk_files
    ]
    by_file = {item.get("file"): item for item in source_items}
    ordered_items = [by_file[item["file"]] for item in chunk if item["file"] in by_file]
    authors = {
        author
        for item in [*chunk, *ordered_items]
        if isinstance((author := item.get("author")), str) and author
    }
    portrait_sources = aggregate_sources.get("portraitSources", {})
    filtered_portraits = {
        author: portrait_sources[author]
        for author in sorted(authors)
        if author in portrait_sources
    }
    data = {
        key: value
        for key, value in aggregate_sources.items()
        if key not in {"updatedAt", "portraitSources", "items"}
    }
    data["updatedAt"] = datetime.now(timezone.utc).isoformat()
    data["portraitSources"] = filtered_portraits
    data["items"] = ordered_items
    return data


def build_index(chunk: list[dict[str, Any]]) -> dict[str, Any]:
    files = [item["file"] for item in chunk]
    ranges = file_ranges(files)
    index: dict[str, Any] = {
        "total": len(chunk),
        "packs": 1,
        "packSize": len(chunk),
    }
    if ranges:
        index["range"] = [ranges[0][0], ranges[-1][1]]
        index["fileRanges"] = ranges
    return index


def validate_source(source_dir: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    videos = load_json(source_dir / "videos.json")
    sources = load_json(source_dir / "sources.json")
    if not isinstance(videos, list):
        raise ValueError(f"{rel(source_dir / 'videos.json')} must be a JSON array")
    if not isinstance(sources, dict):
        raise ValueError(f"{rel(source_dir / 'sources.json')} must be a JSON object")
    files = [item.get("file") for item in videos if isinstance(item, dict)]
    if len(files) != len(videos) or any(not file for file in files):
        raise ValueError("every video item must be an object with file")
    duplicates = sorted({file for file in files if files.count(file) > 1})
    if duplicates:
        raise ValueError(f"duplicate video files: {duplicates[:10]}")
    source_files = {item.get("file") for item in sources.get("items", [])}
    missing_sources = [file for file in files if file not in source_files]
    if missing_sources:
        raise ValueError(f"videos without source items: {missing_sources[:10]}")
    return videos, sources


def write_deck(
    output_dir: Path,
    source_dir: Path,
    chunk: list[dict[str, Any]],
    sources: dict[str, Any],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "videos.json", chunk)
    write_json(output_dir / "index.json", build_index(chunk))
    write_json(output_dir / "sources.json", build_sources(sources, chunk))
    policy = source_dir / "CONTENT-POLICY.md"
    if policy.exists():
        shutil.copyfile(policy, output_dir / "CONTENT-POLICY.md")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Split aggregate data/quotes-de into numbered quote deck folders.",
    )
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-prefix", type=Path, default=DEFAULT_OUTPUT_PREFIX)
    parser.add_argument("--pack-size", type=int, default=500)
    parser.add_argument("--start-pack", type=int, default=1)
    parser.add_argument("--write", action="store_true", help="write deck JSON files")
    args = parser.parse_args()

    if args.pack_size < 1:
        raise ValueError("--pack-size must be positive")
    if args.start_pack < 1:
        raise ValueError("--start-pack must be positive")

    source_dir = args.source.resolve()
    output_prefix = args.output_prefix.resolve()
    videos, sources = validate_source(source_dir)
    chunks = split_chunks(videos, args.pack_size)

    plan = []
    for offset, chunk in enumerate(chunks):
        pack_number = args.start_pack + offset
        output_dir = output_prefix.parent / f"{output_prefix.name}-{pack_number}"
        files = [item["file"] for item in chunk]
        source_data = build_sources(sources, chunk)
        plan.append(
            {
                "deck": rel(output_dir),
                "videos": len(chunk),
                "first": files[0],
                "last": files[-1],
                "fileRanges": file_ranges(files),
                "sourceItems": len(source_data["items"]),
                "portraitSources": len(source_data["portraitSources"]),
            }
        )
        if args.write:
            write_deck(output_dir, source_dir, chunk, sources)

    print(
        json.dumps(
            {
                "source": rel(source_dir),
                "total": len(videos),
                "packSize": args.pack_size,
                "packs": len(chunks),
                "mode": "write" if args.write else "dry-run",
                "plan": plan,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

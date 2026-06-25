#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_AGGREGATE = ROOT / "data" / "quotes-de"
DEFAULT_ASSETS = ROOT / "assets" / "fact-videos"

POLICY_BLOCKLIST = [
    "nationalsozialisten",
    "bücherverbrennungen",
    "volksgemeinschaft",
    "feuerspruch",
    "übergebe der flamme",
    "flamme die schriften",
    "zauberinnen getötet",
    "zauberinnen getötet werden",
]
VIOLENCE_RE = re.compile(
    r"\b(töt|totschlag|totgeschlag|todesstrafe|rache|wiedervergeltung|geschossen|schossen|erschieß|erhäng|gehängt)\w*",
    re.IGNORECASE,
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def natural_file_key(file_name: str) -> int:
    match = re.fullmatch(r"q(\d+)\.mp4", file_name)
    return int(match.group(1)) if match else 999999999


def add_error(errors: list[str], path: Path, message: str) -> None:
    errors.append(f"{rel(path)}: {message}")


def add_warning(warnings: list[str], path: Path, message: str) -> None:
    warnings.append(f"{rel(path)}: {message}")


def policy_block_reason(text: str) -> str | None:
    lower = text.lower()
    for token in POLICY_BLOCKLIST:
        if token in lower:
            return token
    if VIOLENCE_RE.search(lower):
        return "violence-term"
    return None


def validate_deck(deck_dir: Path, assets_dir: Path, check_assets: bool) -> tuple[dict[str, Any], list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    videos_path = deck_dir / "videos.json"
    sources_path = deck_dir / "sources.json"
    index_path = deck_dir / "index.json"
    for path in [videos_path, sources_path, index_path]:
        if not path.exists():
            add_error(errors, deck_dir, f"missing {path.name}")
    if errors:
        return {"deck": rel(deck_dir), "videos": 0}, errors, warnings

    try:
        videos = load_json(videos_path)
        sources = load_json(sources_path)
        index = load_json(index_path)
    except Exception as exc:
        add_error(errors, deck_dir, f"invalid JSON: {exc}")
        return {"deck": rel(deck_dir), "videos": 0}, errors, warnings

    if not isinstance(videos, list):
        add_error(errors, videos_path, "must be a JSON array")
        videos = []
    if not isinstance(sources, dict):
        add_error(errors, sources_path, "must be a JSON object")
        sources = {}
    if not isinstance(index, dict):
        add_error(errors, index_path, "must be a JSON object")
        index = {}

    files: list[str] = []
    authors: set[str] = set()
    for item in videos:
        if not isinstance(item, dict):
            add_error(errors, videos_path, "all video items must be objects")
            continue
        file = item.get("file")
        if not isinstance(file, str) or not file:
            add_error(errors, videos_path, "video item missing file")
            continue
        files.append(file)
        if not re.fullmatch(r"q\d+\.mp4", file):
            add_error(errors, videos_path, f"unexpected file name: {file}")
        author = item.get("author")
        if isinstance(author, str) and author:
            authors.add(author)
        else:
            add_error(errors, videos_path, f"{file} missing author")
        if not item.get("title") or not item.get("text"):
            add_error(errors, videos_path, f"{file} missing title/text")
        reason = policy_block_reason("\n".join(str(item.get(key, "")) for key in ["title", "text", "author"]))
        if reason:
            add_error(errors, videos_path, f"{file} policy blocklist hit: {reason}")
        if check_assets and not (assets_dir / file).exists():
            add_error(errors, assets_dir / file, "missing MP4 asset")

    duplicate_files = sorted({file for file in files if files.count(file) > 1}, key=natural_file_key)
    if duplicate_files:
        add_error(errors, videos_path, f"duplicate files: {duplicate_files[:10]}")

    source_items = sources.get("items", [])
    if not isinstance(source_items, list):
        add_error(errors, sources_path, "items must be an array")
        source_items = []
    source_files = [item.get("file") for item in source_items if isinstance(item, dict)]
    for item in source_items:
        if not isinstance(item, dict):
            continue
        file = str(item.get("file") or item.get("id") or "?")
        reason = policy_block_reason(
            "\n".join(
                str(item.get(key, ""))
                for key in ["quote", "wikiquoteSourceLine", "wikiquoteSection", "author", "wikiquoteTitle"]
            )
        )
        if reason:
            add_error(errors, sources_path, f"{file} policy blocklist hit: {reason}")
    missing_source_items = sorted(set(files) - set(source_files), key=natural_file_key)
    extra_source_items = sorted(set(source_files) - set(files), key=natural_file_key)
    if missing_source_items:
        add_error(errors, sources_path, f"missing source items: {missing_source_items[:10]}")
    if extra_source_items:
        add_error(errors, sources_path, f"extra source items: {extra_source_items[:10]}")

    portrait_sources = sources.get("portraitSources", {})
    if not isinstance(portrait_sources, dict):
        add_error(errors, sources_path, "portraitSources must be an object")
        portrait_sources = {}
    missing_portraits = sorted(author for author in authors if author not in portrait_sources)
    if missing_portraits:
        add_warning(warnings, sources_path, f"missing portraitSources: {missing_portraits[:10]}")

    if index.get("total") != len(videos):
        add_error(errors, index_path, f"total {index.get('total')} does not match videos {len(videos)}")
    if index.get("packSize") != len(videos):
        add_error(errors, index_path, f"packSize {index.get('packSize')} does not match videos {len(videos)}")

    summary = {
        "deck": rel(deck_dir),
        "videos": len(videos),
        "sourceItems": len(source_items),
        "portraitSources": len(portrait_sources),
        "first": files[0] if files else None,
        "last": files[-1] if files else None,
        "errors": len(errors),
        "warnings": len(warnings),
    }
    return summary, errors, warnings


def find_numbered_decks(aggregate_dir: Path) -> list[Path]:
    parent = aggregate_dir.parent
    prefix = aggregate_dir.name + "-"
    decks = [
        path
        for path in parent.iterdir()
        if path.is_dir() and path.name.startswith(prefix) and path.name[len(prefix) :].isdigit()
    ]
    return sorted(decks, key=lambda path: int(path.name[len(prefix) :]))


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate German quote aggregate and numbered decks.")
    parser.add_argument("--aggregate", type=Path, default=DEFAULT_AGGREGATE)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--check-assets", action="store_true")
    parser.add_argument("--numbered-only", action="store_true")
    args = parser.parse_args()

    aggregate = args.aggregate.resolve()
    assets = args.assets.resolve()
    deck_dirs = find_numbered_decks(aggregate)
    if not args.numbered_only:
        deck_dirs = [aggregate] + deck_dirs

    summaries: list[dict[str, Any]] = []
    errors: list[str] = []
    warnings: list[str] = []
    for deck_dir in deck_dirs:
        summary, deck_errors, deck_warnings = validate_deck(deck_dir, assets, args.check_assets)
        summaries.append(summary)
        errors.extend(deck_errors)
        warnings.extend(deck_warnings)

    print(json.dumps({"decks": summaries, "errors": errors, "warnings": warnings}, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

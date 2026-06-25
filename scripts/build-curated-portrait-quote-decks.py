#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import runpy
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PORTRAIT_DIR = DATA_DIR / "quotes-portraits"
PACK_SIZE = 100
USER_AGENT = "shorts-curated-portrait-quotes/1.0 (local source tracking)"

BASE = runpy.run_path(str(ROOT / "scripts" / "build-multilang-quote-decks.py"))
PageMeta = BASE["PageMeta"]
fetch_wikitext_pages = BASE["fetch_wikitext_pages"]
extract_quotes = BASE["extract_quotes"]
normalized_key = BASE["normalized_key"]

AUTHOR_QIDS = [
    # Global figures with broad Wikiquote coverage.
    "Q692", "Q180", "Q7245", "Q91", "Q11812", "Q34969", "Q48226", "Q131149",
    "Q8016", "Q937", "Q9036", "Q935", "Q1035", "Q913", "Q859", "Q868", "Q842",
    "Q4604", "Q9333", "Q1001", "Q8023", "Q8027", "Q206293", "Q36322", "Q40909",
    "Q3335", "Q892", "Q23434", "Q7243", "Q991", "Q5685", "Q7200", "Q41576",
    "Q43718", "Q207437", "Q41261", "Q229547", "Q4596", "Q47064", "Q12706",
    "Q36591", "Q7285", "Q1043", "Q19080", "Q2161", "Q7327", "Q9106", "Q19173",
    "Q7315", "Q186320", "Q202604",
    # Spanish-language and Latin American figures.
    "Q5682", "Q909", "Q16327", "Q5878", "Q144582", "Q156954", "Q204713",
    "Q311383", "Q222287", "Q132504", "Q8605", "Q186579", "Q5588", "Q229003",
    "Q221571", "Q172456", "Q165257", "Q315390", "Q313362", "Q170352",
    "Q172492", "Q310419",
    # More scientists, writers, philosophers.
    "Q762", "Q9061", "Q905", "Q255", "Q9068", "Q7186", "Q23444", "Q9312",
    "Q8003", "Q16204", "Q175197", "Q7198", "Q76611", "Q63187", "Q47681",
    "Q6101", "Q5809", "Q7725", "Q8007", "Q5297", "Q5879", "Q9056", "Q1048",
    "Q1511", "Q5805", "Q5872", "Q830", "Q836", "Q891", "Q5711", "Q765",
    "Q46375", "Q34670", "Q42775", "Q83333", "Q29478", "Q41421",
]

LICENSE_NOTE = (
    "Quote text was fetched from each language's Wikiquote page through the MediaWiki API. "
    "Wikiquote text is CC BY-SA; each item stores its source page and line. Portraits are "
    "downloaded from Wikimedia Commons via Wikidata P18 and each portrait source stores Commons "
    "file, page, artist, credit and license metadata."
)


def request_json(url: str, params: dict[str, Any], wait: float) -> dict[str, Any]:
    query = urllib.parse.urlencode(params, doseq=True)
    full_url = f"{url}?{query}"
    last_error: Exception | None = None
    for attempt in range(7):
        try:
            req = urllib.request.Request(full_url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=80) as response:
                data = json.loads(response.read().decode("utf-8"))
            if wait:
                time.sleep(wait)
            return data
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429:
                raise
            retry_after = exc.headers.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 14.0 + attempt * 12.0
            print(f"metadata 429 from {url}; sleeping {delay:.0f}s")
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            delay = 4.0 + attempt * 4.0
            print(f"metadata request failed for {url}: {exc}; retrying in {delay:.0f}s")
            time.sleep(delay)
    raise RuntimeError(f"metadata request failed after retries: {url}: {last_error}")


def clean_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    return re.sub(r"\s+", " ", text).strip()


def slug(text: str) -> str:
    out = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return out[:80] or "portrait"


def entity_batches(qids: list[str], wait: float) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for start in range(0, len(qids), 50):
        batch = qids[start : start + 50]
        data = request_json(
            "https://www.wikidata.org/w/api.php",
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "sitelinks|claims|labels",
                "languages": "en|ru|es",
                "format": "json",
            },
            wait,
        )
        out.update(data.get("entities", {}))
    return out


def commons_image_meta(filename: str, wait: float) -> dict[str, Any] | None:
    data = request_json(
        "https://commons.wikimedia.org/w/api.php",
        {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": "1100",
            "titles": "File:" + filename,
        },
        wait,
    )
    page = next(iter(data.get("query", {}).get("pages", {}).values()), None)
    if not page:
        return None
    info = (page.get("imageinfo") or [{}])[0]
    metadata = info.get("extmetadata") or {}
    thumb = info.get("thumburl") or info.get("url")
    if not thumb:
        return None
    return {
        "commonsFile": filename,
        "commonsTitle": "File:" + filename,
        "commonsPage": f"https://commons.wikimedia.org/wiki/File:{urllib.parse.quote(filename.replace(' ', '_'))}",
        "thumbUrl": thumb,
        "originalUrl": info.get("url"),
        "licenseShortName": metadata.get("LicenseShortName", {}).get("value"),
        "licenseUrl": metadata.get("LicenseUrl", {}).get("value"),
        "artist": clean_html(metadata.get("Artist", {}).get("value", "")),
        "credit": clean_html(metadata.get("Credit", {}).get("value", "")),
    }


def download(url: str, dest: Path) -> None:
    if dest.exists():
        return
    body = b""
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=90) as response:
                body = response.read()
            break
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429:
                raise
            retry_after = exc.headers.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 12.0 + attempt * 10.0
            print(f"portrait download 429; sleeping {delay:.0f}s")
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            delay = 4.0 + attempt * 4.0
            print(f"portrait download failed: {exc}; retrying in {delay:.0f}s")
            time.sleep(delay)
    if not body:
        raise RuntimeError(f"portrait download failed after retries: {last_error}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)


def portrait_for_entity(qid: str, entity: dict[str, Any], wait: float) -> dict[str, Any] | None:
    claims = entity.get("claims", {}).get("P18", [])
    if not claims:
        return None
    filename = claims[0].get("mainsnak", {}).get("datavalue", {}).get("value")
    if not filename:
        return None
    meta = commons_image_meta(str(filename), wait)
    if not meta:
        return None
    ext = Path(str(filename)).suffix.lower()
    if ext not in {".jpg", ".jpeg", ".png", ".webp"}:
        ext = ".jpg"
    local = PORTRAIT_DIR / f"{qid.lower()}-{slug(Path(str(filename)).stem)}{ext}"
    download(meta["thumbUrl"], local)
    meta["localPath"] = str(local.relative_to(ROOT))
    return meta


def lang_page(qid: str, entity: dict[str, Any], lang: str) -> PageMeta | None:
    site = f"{lang}wikiquote"
    sitelink = entity.get("sitelinks", {}).get(site)
    title = (sitelink or {}).get("title")
    if not title:
        return None
    url_title = urllib.parse.quote(str(title).replace(" ", "_"), safe="/():,")
    return PageMeta(
        title=str(title),
        pageid=0,
        qid=qid,
        url=f"https://{lang}.wikiquote.org/wiki/{url_title}",
        human=True,
    )


def select_round_robin(by_author: dict[str, list[Any]], author_order: list[str], target: int) -> list[Any]:
    selected: list[Any] = []
    seen: set[str] = set()
    cursors = {author: 0 for author in author_order}
    while len(selected) < target:
        progressed = False
        for author in author_order:
            items = by_author.get(author) or []
            cursor = cursors[author]
            while cursor < len(items):
                item = items[cursor]
                cursor += 1
                key = normalized_key(item.quote)
                if key in seen:
                    continue
                seen.add(key)
                selected.append(item)
                progressed = True
                break
            cursors[author] = cursor
            if len(selected) >= target:
                break
        if not progressed:
            break
    return selected


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def existing_portrait_sources() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for path in [
        DATA_DIR / "quotes-de" / "sources.json",
        DATA_DIR / "quotes-de-1" / "sources.json",
        DATA_DIR / "quotes-de-2" / "sources.json",
        DATA_DIR / "quotes-de-3" / "sources.json",
    ]:
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for meta in (data.get("portraitSources") or {}).values():
            qid = str(meta.get("wikidataQid") or "")
            local = meta.get("localPath")
            if qid and local and (ROOT / local).exists():
                out[qid] = meta
    return out


def build_lang(lang: str, qid_order: list[str], entities: dict[str, dict[str, Any]], portraits: dict[str, dict[str, Any]], target: int, max_per_author: int, wait: float) -> None:
    pages: list[PageMeta] = []
    page_to_qid: dict[str, str] = {}
    for qid in qid_order:
        entity = entities.get(qid) or {}
        if qid not in portraits:
            continue
        page = lang_page(qid, entity, lang)
        if not page:
            continue
        pages.append(page)
        page_to_qid[page.title] = qid

    print(f"{lang}: curated pages with portraits={len(pages)}")
    texts = fetch_wikitext_pages(lang, [page.title for page in pages], wait)
    by_author: dict[str, list[Any]] = {}
    author_order: list[str] = []
    for page in pages:
        text = texts.get(page.title)
        if not text:
            continue
        quotes = extract_quotes(lang, page, text, max_per_author)
        if not quotes:
            continue
        by_author[page.title] = quotes
        author_order.append(page.title)
    selected = select_round_robin(by_author, author_order, target)
    print(f"{lang}: selected={len(selected)} authors={len({item.author for item in selected})}")

    deck_dir = DATA_DIR / f"quotes-{lang}"
    items = []
    ledger_items = []
    for index, item in enumerate(selected, start=1):
        qid = page_to_qid.get(item.page_title) or item.qid or ""
        portrait = portraits.get(qid, {})
        row = {
            "id": index,
            "pack": math.floor((index - 1) / PACK_SIZE) + 1,
            "title": item.author,
            "text": item.quote,
            "chars": len(item.quote),
            "source": item.page_url,
            "qid": qid,
            "portraitFile": portrait.get("localPath"),
            "portraitUrl": portrait.get("commonsPage"),
            "portraitCredit": portrait.get("artist") or portrait.get("credit"),
            "portraitLicense": portrait.get("licenseShortName"),
        }
        items.append(row)
        ledger_items.append({
            "id": index,
            "author": item.author,
            "quote": item.quote,
            "wikiquoteTitle": item.page_title,
            "wikiquoteUrl": item.page_url,
            "wikidataQid": qid,
            "section": item.section,
            "line": item.line_index,
            "sourceLine": item.source_line,
            "portraitFile": portrait.get("localPath"),
            "portraitSource": portrait.get("commonsPage"),
        })

    chars = [item["chars"] for item in items]
    write_json(deck_dir / "titled.json", items)
    write_json(
        deck_dir / "index.json",
        {
            "language": lang,
            "total": len(items),
            "packs": math.ceil(len(items) / PACK_SIZE) if items else 0,
            "packSize": PACK_SIZE,
            "range": [min(chars), max(chars)] if chars else [0, 0],
            "target": target,
            "source": "Curated Wikiquote + Commons portraits",
            "generator": "scripts/build-curated-portrait-quote-decks.py",
        },
    )
    write_json(
        deck_dir / "sources.json",
        {
            "language": lang,
            "generator": "scripts/build-curated-portrait-quote-decks.py",
            "license": {
                "quoteSource": "Wikiquote",
                "quoteSpdx": "CC-BY-SA",
                "portraitSource": "Wikimedia Commons via Wikidata P18",
                "note": LICENSE_NOTE,
            },
            "policy": {
                "note": "Curated human-author pages only; automated filters from build-multilang-quote-decks.py; still requires editorial spot-check before very large publication.",
                "germanVideoPackBoundary": "Do not localize or derive from data/quotes-de-1, data/quotes-de-2, data/quotes-de-3. Those are separate German pre-built MP4 packs.",
            },
            "target": target,
            "count": len(items),
            "authors": sorted({item.author for item in selected}, key=str.casefold),
            "portraitSources": {qid: portraits[qid] for qid in sorted({page_to_qid.get(item.page_title) or item.qid or "" for item in selected}) if qid in portraits},
            "items": ledger_items,
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--langs", default="en,ru,es")
    parser.add_argument("--target", type=int, default=1200)
    parser.add_argument("--max-per-author", type=int, default=24)
    parser.add_argument("--request-wait", type=float, default=0.08)
    parser.add_argument("--no-fetch-portraits", action="store_true")
    args = parser.parse_args()

    langs = [part.strip() for part in args.langs.split(",") if part.strip()]
    portraits: dict[str, dict[str, Any]] = existing_portrait_sources()
    print(f"seeded portraits from local ledgers={len(portraits)}")
    qid_order = list(dict.fromkeys([*AUTHOR_QIDS, *portraits.keys()]))
    entities = entity_batches(qid_order, args.request_wait)
    for qid in qid_order:
        if args.no_fetch_portraits or qid in portraits:
            continue
        entity = entities.get(qid) or {}
        try:
            portrait = portrait_for_entity(qid, entity, args.request_wait)
            if portrait:
                portraits[qid] = portrait
        except Exception as exc:
            print(f"{qid}: portrait skipped after error: {exc}")
    print(f"portraits={len(portraits)}")
    for lang in langs:
        build_lang(lang, qid_order, entities, portraits, args.target, args.max_per_author, args.request_wait)


if __name__ == "__main__":
    main()

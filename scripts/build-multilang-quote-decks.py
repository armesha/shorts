#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import json
import math
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"

TARGET_LANGS = ("ru", "ar", "en", "it", "es", "pt", "hi", "id", "fr")
PACK_SIZE = 100
DEFAULT_TARGET = 1000
DEFAULT_MAX_PAGES = 9000
DEFAULT_MAX_PER_PAGE = 25
DEFAULT_CANDIDATE_BUFFER = 500
DEFAULT_PAGE_BATCH_SIZE = 40

USER_AGENT = "shorts-multilang-quote-decks/1.0 (local source tracking)"
WDQS_URL = "https://query.wikidata.org/sparql"
CC_BY_SA_NOTE = (
    "Quote text was fetched from matching-language Wikiquote pages through the "
    "MediaWiki API. Wikiquote page text is available under CC BY-SA; review each "
    "source page for its current license footer and attribution history."
)

QUOTE_OPEN = {
    "ar": "«",
    "ru": "«",
    "fr": "«",
    "it": "«",
    "es": "«",
    "pt": "«",
    "hi": "“",
    "id": "“",
    "en": "“",
}
QUOTE_CLOSE = {
    "ar": "»",
    "ru": "»",
    "fr": "»",
    "it": "»",
    "es": "»",
    "pt": "»",
    "hi": "”",
    "id": "”",
    "en": "”",
}

BAD_SECTION_TOKENS = (
    "about",
    "also",
    "bibliograph",
    "disputed",
    "external links",
    "incorrect",
    "misattributed",
    "references",
    "related",
    "see also",
    "variant",
    "wrongly",
    "à propos",
    "attribuées",
    "bibliographie",
    "citations sur",
    "liens externes",
    "références",
    "variante",
    "attribuite",
    "bibliografia",
    "collegamenti esterni",
    "riferimenti",
    "riguardo",
    "su di",
    "atribuidas",
    "bibliografía",
    "enlaces externos",
    "referencias",
    "sobre",
    "atribuídas",
    "bibliografia",
    "ligações externas",
    "referências",
    "sobre",
    "вариант",
    "литература",
    "неверно",
    "о нём",
    "о ней",
    "приписываем",
    "ссылки",
    "источники",
    "انظر",
    "روابط خارجية",
    "مصادر",
    "مراجع",
    "منسوب",
    "बाहरी कड़ियाँ",
    "सन्दर्भ",
    "संदर्भ",
    "इन्हें भी देखें",
    "lihat pula",
    "pranala luar",
    "referensi",
)

NOISE_TOKENS = (
    "[[category:",
    "[[категория:",
    "[[categoria:",
    "[[catégorie:",
    "[[تصنيف:",
    "[[श्रेणी:",
    "[[kategori:",
    "category:",
    "categoria:",
    "catégorie:",
    "تصنيف:",
    "श्रेणी:",
    "file:",
    "image:",
    "arquivo:",
    "fichier:",
    "файл:",
    "ملف:",
    "isbn",
    "issn",
    "http://",
    "https://",
    "www.",
    "wikimedia",
    "wikiquote",
    "wikipedia",
)

SOURCE_NOISE_RE = re.compile(
    r"\b("
    r"retrieved|published|translated|translation|original|source|chapter|page|pages|"
    r"édition|traduction|source|chapitre|página|páginas|fonte|fuente|"
    r"источник|перевод|страница|страницы|глава|"
    r"مصدر|ترجمة|صفحة|فصل|"
    r"स्रोत|अनुवाद|पृष्ठ|bab|halaman|sumber"
    r")\b",
    re.I,
)

SAFETY_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "hate-slur",
        (
            "nigger",
            "negroes",
            "kike",
            "chink",
            "gook",
            "spic",
            "wetback",
            "coon",
            "faggot",
            "tranny",
            "gypsy",
            "paki",
            "raghead",
            "nazi",
            "nazis",
            "hitler",
            "heil",
            "white power",
            "kkk",
            "untermensch",
            "neger",
            "zigeuner",
            "жид",
            "жиды",
            "ниггер",
            "хохол",
            "москаль",
            "чурка",
            "чурки",
            "пидор",
            "гитлер",
            "нацист",
            "фашист",
            "نازي",
            "هتلر",
            "كافر",
            "زنجي",
            "يهودي قذر",
            "जिहादी",
            "नाज़ी",
            "हिटलर",
            "fascista",
            "nazista",
            "nazis",
            "racaille",
            "nègre",
            "gitano",
            "cigano",
        ),
    ),
    (
        "extremism",
        (
            "isis",
            "isil",
            "al-qaeda",
            "al qaeda",
            "terrorist",
            "terrorism",
            "jihad",
            "caliphate",
            "suicide bomber",
            "террорист",
            "терроризм",
            "джихад",
            "игил",
            "смертник",
            "إرهاب",
            "داعش",
            "جهاد",
            "تفجير انتحاري",
            "आतंकवाद",
            "जिहाद",
            "terorisme",
            "jihad",
            "terrorismo",
            "terrorisme",
        ),
    ),
    (
        "violence",
        (
            "kill",
            "killing",
            "murder",
            "blood",
            "behead",
            "bomb",
            "gun",
            "shoot",
            "slaughter",
            "rape",
            "war",
            "война",
            "убий",
            "убить",
            "кров",
            "бомб",
            "пистолет",
            "насили",
            "قتل",
            "دم",
            "حرب",
            "قنبلة",
            "بندقية",
            "violencia",
            "guerra",
            "matar",
            "asesin",
            "sangre",
            "violência",
            "guerra",
            "matar",
            "assassin",
            "sangue",
            "violence",
            "guerre",
            "tuer",
            "meurtre",
            "meurtr",
            "assassin",
            "égorg",
            "trucid",
            "massacr",
            "sang",
            "violenza",
            "guerra",
            "uccidere",
            "sangue",
            "हत्या",
            "खून",
            "युद्ध",
            "membunuh",
            "perang",
            "darah",
        ),
    ),
    (
        "sexual",
        (
            "sex",
            "sexual",
            "porn",
            "boob",
            "tits",
            "dick",
            "cock",
            "pussy",
            "fuck",
            "bitch",
            "nude",
            "naked",
            "prostitut",
            "brothel",
            "orgasm",
            "masturbat",
            "секс",
            "порно",
            "проститут",
            "голая",
            "голый",
            "изнасил",
            "جنس",
            "إباحية",
            "عاري",
            "اغتصاب",
            "sexo",
            "sexual",
            "porn",
            "desnudo",
            "desnuda",
            "prostitut",
            "sexe",
            "sexuel",
            "porno",
            "nu ",
            "nue ",
            "sesso",
            "sessuale",
            "nudo",
            "nuda",
            "सेक्स",
            "यौन",
            "नग्न",
            "सेक्स",
            "seks",
            "porno",
            "telanjang",
        ),
    ),
    (
        "minor",
        (
            "child",
            "children",
            "minor",
            "underage",
            "kid ",
            "kids",
            "boy ",
            "girl ",
            "ребён",
            "ребен",
            "дети",
            "девоч",
            "мальчик",
            "طفل",
            "أطفال",
            "قاصر",
            "niño",
            "niña",
            "menor",
            "criança",
            "menino",
            "menina",
            "enfant",
            "mineur",
            "bambino",
            "bambina",
            "minore",
            "बच्च",
            "बालक",
            "बालिका",
            "anak",
        ),
    ),
    (
        "politics-slur",
        (
            "libtard",
            "commie",
            "traitor race",
            "snowflake",
            "ватник",
            "майданут",
            "либераст",
            "пятая колонна",
            "facho",
            "rojo de mierda",
            "comunista de mierda",
            "gaucho",
            "sale gauchiste",
        ),
    ),
)


@dataclass(frozen=True)
class PageMeta:
    title: str
    pageid: int
    qid: str | None
    url: str
    human: bool


@dataclass(frozen=True)
class PageSource:
    meta: PageMeta
    wikitext: str


@dataclass(frozen=True)
class QuoteCandidate:
    lang: str
    author: str
    page_title: str
    page_url: str
    qid: str | None
    section: str
    quote: str
    source_line: str
    line_index: int
    score: int


ENTITY_HUMAN_CACHE: dict[str, bool] = {}


def api_url(lang: str) -> str:
    return f"https://{lang}.wikiquote.org/w/api.php"


def page_url(lang: str, title: str) -> str:
    quoted = urllib.parse.quote(title.replace(" ", "_"), safe="/():,")
    return f"https://{lang}.wikiquote.org/wiki/{quoted}"


def title_from_page_url(url: str) -> str | None:
    if "/wiki/" not in url:
        return None
    raw = url.rsplit("/wiki/", 1)[1]
    return urllib.parse.unquote(raw).replace("_", " ").strip()


def request_json(url: str, params: dict[str, Any], wait: float) -> dict[str, Any]:
    query = urllib.parse.urlencode(params, doseq=True)
    full_url = f"{url}?{query}"
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            req = urllib.request.Request(full_url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as response:
                payload = response.read().decode("utf-8")
            if wait:
                time.sleep(wait)
            return json.loads(payload)
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code != 429:
                raise
            retry_after = exc.headers.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 10.0 + attempt * 8.0
            print(f"429 from {url}; sleeping {delay:.0f}s")
            time.sleep(delay)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            delay = 2.0 + attempt * 3.0
            print(f"request failed for {url}: {exc}; retrying in {delay:.0f}s")
            time.sleep(delay)
    raise RuntimeError(f"request failed after retries: {url}: {last_error}")


def chunked(items: list[str], size: int) -> Iterable[list[str]]:
    for index in range(0, len(items), size):
        yield items[index : index + size]


def is_human_entity(qid: str, wait: float) -> bool:
    if qid in ENTITY_HUMAN_CACHE:
        return ENTITY_HUMAN_CACHE[qid]
    data = request_json(
        "https://www.wikidata.org/w/api.php",
        {
            "action": "wbgetentities",
            "ids": qid,
            "props": "claims",
            "format": "json",
        },
        wait,
    )
    entity = data.get("entities", {}).get(qid, {})
    claims = entity.get("claims", {}).get("P31", [])
    human = False
    for claim in claims:
        value = (
            claim.get("mainsnak", {})
            .get("datavalue", {})
            .get("value", {})
            .get("id")
        )
        if value == "Q5":
            human = True
            break
    ENTITY_HUMAN_CACHE[qid] = human
    return human


def human_flags(qids: list[str], wait: float) -> dict[str, bool]:
    missing = sorted({qid for qid in qids if qid and qid not in ENTITY_HUMAN_CACHE})
    for batch in chunked(missing, 50):
        data = request_json(
            "https://www.wikidata.org/w/api.php",
            {
                "action": "wbgetentities",
                "ids": "|".join(batch),
                "props": "claims",
                "format": "json",
            },
            wait,
        )
        entities = data.get("entities", {})
        for qid in batch:
            entity = entities.get(qid, {})
            claims = entity.get("claims", {}).get("P31", [])
            ENTITY_HUMAN_CACHE[qid] = any(
                (
                    claim.get("mainsnak", {})
                    .get("datavalue", {})
                    .get("value", {})
                    .get("id")
                    == "Q5"
                )
                for claim in claims
            )
    return {qid: ENTITY_HUMAN_CACHE.get(qid, False) for qid in qids}


def bad_title(title: str) -> bool:
    lower = title.lower()
    if ":" in title or "/" in title:
        return True
    if lower.startswith(('"', "'", "`", "«", "“", "„", "(")):
        return True
    if lower.endswith("(disambiguation)") or lower.endswith("(homonymie)"):
        return True
    blocked = (
        "quotes by",
        "list of",
        "proverbs",
        "slogans",
        "death camp",
        "proverbios",
        "proverbes",
        "proverbi",
        "provérbios",
        "пословицы",
        "الأمثال",
        "कहावत",
        "peribahasa",
    )
    return any(token in lower for token in blocked)


def iter_page_meta_batches(lang: str, max_pages: int, wait: float) -> Iterable[list[PageMeta]]:
    params: dict[str, Any] = {
        "action": "query",
        "generator": "allpages",
        "gapnamespace": "0",
        "gapfilterredir": "nonredirects",
        "gaplimit": "max",
        "prop": "pageprops",
        "format": "json",
        "formatversion": "2",
    }
    seen = 0
    while seen < max_pages:
        data = request_json(api_url(lang), params, wait)
        pages = data.get("query", {}).get("pages", [])
        pages = sorted(pages, key=lambda item: item.get("title", ""))
        batch: list[PageMeta] = []
        for page in pages:
            seen += 1
            title = str(page.get("title", "")).strip()
            qid = page.get("pageprops", {}).get("wikibase_item")
            if not title or bad_title(title):
                continue
            batch.append(
                PageMeta(
                    title=title,
                    pageid=int(page.get("pageid", 0) or 0),
                    qid=qid,
                    url=page_url(lang, title),
                    human=False,
                )
            )
            if seen >= max_pages:
                break
        if batch:
            yield batch
        cont = data.get("continue")
        if not cont:
            break
        params = {**params, **cont}


def fetch_human_sitelinks(lang: str, limit: int, wait: float) -> list[PageMeta]:
    query = f"""
SELECT ?person ?article WHERE {{
  ?article schema:about ?person ;
           schema:isPartOf <https://{lang}.wikiquote.org/> .
  ?person wdt:P31 wd:Q5 .
}}
ORDER BY ?article
LIMIT {int(limit)}
"""
    data = request_json(
        WDQS_URL,
        {
            "format": "json",
            "query": query,
        },
        wait,
    )
    out: list[PageMeta] = []
    seen: set[str] = set()
    for row in data.get("results", {}).get("bindings", []):
        article = row.get("article", {}).get("value", "")
        person = row.get("person", {}).get("value", "")
        title = title_from_page_url(article)
        if not title or bad_title(title):
            continue
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        qid = person.rsplit("/", 1)[-1] if person else None
        out.append(
            PageMeta(
                title=title,
                pageid=0,
                qid=qid,
                url=page_url(lang, title),
                human=True,
            )
        )
    return out


def iter_page_source_batches(
    lang: str,
    max_pages: int,
    wait: float,
    batch_size: int,
) -> Iterable[list[PageSource]]:
    params: dict[str, Any] = {
        "action": "query",
        "generator": "allpages",
        "gapnamespace": "0",
        "gapfilterredir": "nonredirects",
        "gaplimit": str(batch_size),
        "prop": "pageprops|revisions",
        "rvprop": "content",
        "rvslots": "main",
        "format": "json",
        "formatversion": "2",
    }
    seen = 0
    while seen < max_pages:
        data = request_json(api_url(lang), params, wait)
        pages = data.get("query", {}).get("pages", [])
        pages = sorted(pages, key=lambda item: item.get("title", ""))
        batch: list[PageSource] = []
        for page in pages:
            seen += 1
            title = str(page.get("title", "")).strip()
            qid = page.get("pageprops", {}).get("wikibase_item")
            if not title or bad_title(title) or not qid:
                if seen >= max_pages:
                    break
                continue
            revisions = page.get("revisions") or []
            if not revisions:
                if seen >= max_pages:
                    break
                continue
            revision = revisions[0]
            content = (
                revision.get("slots", {})
                .get("main", {})
                .get("content")
                or revision.get("content")
                or ""
            )
            if not content:
                if seen >= max_pages:
                    break
                continue
            batch.append(
                PageSource(
                    meta=PageMeta(
                        title=title,
                        pageid=int(page.get("pageid", 0) or 0),
                        qid=qid,
                        url=page_url(lang, title),
                        human=False,
                    ),
                    wikitext=content,
                )
            )
            if seen >= max_pages:
                break
        if batch:
            yield batch
        cont = data.get("continue")
        if not cont:
            break
        params = {**params, **cont}


def fetch_wikitext_pages(lang: str, titles: list[str], wait: float) -> dict[str, str]:
    out: dict[str, str] = {}
    for batch in chunked(titles, 40):
        data = request_json(
            api_url(lang),
            {
                "action": "query",
                "prop": "revisions",
                "rvprop": "content",
                "rvslots": "main",
                "titles": "|".join(batch),
                "format": "json",
                "formatversion": "2",
            },
            wait,
        )
        pages = data.get("query", {}).get("pages", [])
        for page in pages:
            if page.get("missing"):
                continue
            revisions = page.get("revisions") or []
            if not revisions:
                continue
            revision = revisions[0]
            content = (
                revision.get("slots", {})
                .get("main", {})
                .get("content")
                or revision.get("content")
                or ""
            )
            if content:
                out[str(page.get("title", ""))] = content
    return out


def sparql_human_pages(lang: str, max_pages: int, wait: float) -> list[PageMeta]:
    query = f"""
SELECT ?item ?article WHERE {{
  ?article schema:about ?item ;
           schema:isPartOf <https://{lang}.wikiquote.org/> .
  ?item wdt:P31 wd:Q5 .
}}
ORDER BY ?item
LIMIT {int(max_pages)}
"""
    data = request_json(
        "https://query.wikidata.org/sparql",
        {"query": query, "format": "json"},
        wait,
    )
    out: list[PageMeta] = []
    seen: set[str] = set()
    for row in data.get("results", {}).get("bindings", []):
        article_url = row.get("article", {}).get("value", "")
        item_url = row.get("item", {}).get("value", "")
        if "/wiki/" not in article_url or not item_url.rsplit("/", 1):
            continue
        raw_title = article_url.rsplit("/wiki/", 1)[1]
        title = urllib.parse.unquote(raw_title).replace("_", " ").strip()
        qid = item_url.rsplit("/", 1)[-1]
        if not title or bad_title(title) or title in seen:
            continue
        seen.add(title)
        out.append(PageMeta(title=title, pageid=0, qid=qid, url=page_url(lang, title), human=True))
    return out


def iter_sparql_page_source_batches(
    lang: str,
    max_pages: int,
    wait: float,
    batch_size: int,
) -> Iterable[list[PageSource]]:
    pages = sparql_human_pages(lang, max_pages, wait)
    print(f"{lang}: SPARQL human pages={len(pages)}")
    meta_by_title = {page.title: page for page in pages}
    for title_batch in chunked([page.title for page in pages], batch_size):
        texts = fetch_wikitext_pages(lang, title_batch, wait)
        batch: list[PageSource] = []
        for title, text in texts.items():
            meta = meta_by_title.get(title)
            if meta and text:
                batch.append(PageSource(meta=meta, wikitext=text))
        if batch:
            yield batch


def strip_templates(text: str) -> str:
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    return text


def clean_wikitext(text: str) -> str:
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S | re.I)
    text = re.sub(r"<ref[^>]*/>", "", text, flags=re.I)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"\{\{\s*[Pp]ersonnage\s*\|\s*([^{}|]+?)\s*\}\}", r"\1", text)
    text = re.sub(r"\{\{\s*[Tt]ab\s*\}\}", " ", text)
    text = re.sub(r"</?poem[^>]*>", " ", text, flags=re.I)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"</?(small|sup|sub|span|div|p|blockquote)[^>]*>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = strip_templates(text)
    text = re.sub(r"\[\[[^|\]]+\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[https?://[^\s\]]+\s*([^\]]*)\]", r"\1", text)
    text = text.replace("'''", "").replace("''", "")
    text = html.unescape(text)
    text = text.replace("&nbsp;", " ")
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_template_args(body: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    brace_depth = 0
    link_depth = 0
    index = 0
    while index < len(body):
        pair = body[index : index + 2]
        if pair == "{{":
            brace_depth += 1
            buf.append(pair)
            index += 2
            continue
        if pair == "}}" and brace_depth:
            brace_depth -= 1
            buf.append(pair)
            index += 2
            continue
        if pair == "[[":
            link_depth += 1
            buf.append(pair)
            index += 2
            continue
        if pair == "]]" and link_depth:
            link_depth -= 1
            buf.append(pair)
            index += 2
            continue
        char = body[index]
        if char == "|" and brace_depth == 0 and link_depth == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(char)
        index += 1
    parts.append("".join(buf).strip())
    return parts


def template_quote_candidates(raw_line: str) -> list[str]:
    out: list[str] = []
    for match in re.finditer(r"\{\{([^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*)\}\}", raw_line):
        parts = split_template_args(match.group(1))
        if len(parts) < 2:
            continue
        name = parts[0].strip().lower()
        if not (
            name in {"q", "quote", "quotation", "cquote"}
            or "quote" in name
            or "cita" in name
            or "citazione" in name
            or "citação" in name
            or "цит" in name
            or "اقتباس" in name
            or "उद्धरण" in name
            or "kutip" in name
        ):
            continue
        values: list[str] = []
        for raw_part in parts[1:]:
            if "=" in raw_part:
                key, value = raw_part.split("=", 1)
                key = key.strip().lower()
                if key not in {
                    "1",
                    "text",
                    "quote",
                    "quotation",
                    "citation",
                    "cita",
                    "citazione",
                    "citação",
                    "цитата",
                    "اقتباس",
                    "उद्धरण",
                    "kutipan",
                }:
                    continue
                values.append(value)
            else:
                values.append(raw_part)
        for value in values:
            cleaned = clean_wikitext(value)
            if 35 <= len(cleaned) <= 320:
                out.append(cleaned)
    return out


def iter_citation_template_blocks(wikitext: str) -> Iterable[tuple[int, str]]:
    lines = wikitext.splitlines()
    index = 0
    start_re = re.compile(r"^\s*\{\{\s*citation\b", re.I)
    stop_re = re.compile(r"^\s*(?:={2,}|\{\{\s*(?:réf|ref|choisie|loupe|pour info)\b)", re.I)
    while index < len(lines):
        line = lines[index]
        if not start_re.match(line):
            index += 1
            continue
        start_line = index + 1
        block = [line]
        balance = line.count("{{") - line.count("}}")
        cursor = index + 1
        while cursor < len(lines):
            next_line = lines[cursor]
            if stop_re.match(next_line):
                break
            if start_re.match(next_line) and balance <= 0:
                break
            block.append(next_line)
            balance += next_line.count("{{") - next_line.count("}}")
            cursor += 1
            if balance <= 0:
                break
        yield start_line, "\n".join(block)
        index = max(cursor, index + 1)


def citation_template_values(block: str) -> list[str]:
    out: list[str] = []
    compact = block.strip()
    if compact.endswith("}}"):
        parts = split_template_args(compact[2:-2])
        if parts:
            for raw_part in parts[1:]:
                if "=" in raw_part:
                    key, value = raw_part.split("=", 1)
                    key = key.strip().lower()
                    if key not in {"1", "citation", "texte", "text", "quote"}:
                        continue
                    out.append(value)
                else:
                    out.append(raw_part)

    body = re.sub(r"^\s*\{\{\s*citation\s*\|?", "", block, flags=re.I).strip()
    body = re.sub(r"\}\}\s*$", "", body).strip()
    match = re.search(r"(?:^|\n|\|)\s*(?:citation|1|texte|text|quote)\s*=\s*(.*)", body, flags=re.I | re.S)
    value = match.group(1) if match else body
    value = re.split(
        r"\n\s*\|\s*(?:pr[ée]cisions?|original|langue|r[ée]f[ée]rence|auteur|source|traducteur)\s*=",
        value,
        maxsplit=1,
        flags=re.I,
    )[0]
    value = re.split(r"\n\s*\{\{\s*(?:r[ée]f|ref|choisie|loupe|pour info)\b", value, maxsplit=1, flags=re.I)[0]
    value = re.sub(r"^\s*\|\s*", "", value).strip()
    if value:
        out.append(value)

    cleaned: list[str] = []
    seen: set[str] = set()
    for value in out:
        text = clean_wikitext(value)
        key = normalized_key(text)
        if len(key) < 18 or key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
    return cleaned


def normalize_quote(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = text.strip()
    text = re.sub(r"^\*+\s*", "", text)
    text = text.strip(" \t\r\n\"'“”„«»「」『』()[]")
    text = text.replace("...", "…")
    text = re.sub(r"\s+([,.;:!?،؛؟])", r"\1", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip(" \t\r\n\"'“”„«»「」『』")


def normalized_key(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text.lower() if ch.isalnum())
    return text


def has_letter(text: str) -> bool:
    return any(ch.isalpha() for ch in text)


def blocked_reason(text: str) -> str | None:
    lower = text.lower()
    if re.match(r"^[a-zа-яёà-ÿ]", text):
        return "lowercase-fragment"
    if re.search(r"\b(child|children|minor|underage|kid|kids|boy|girl)\b", lower):
        return "minor"
    if any(token in lower for token in NOISE_TOKENS):
        return "markup-or-source-noise"
    if any(token in text for token in ("{{", "}}", "[[", "]]", "<ref", "</", "|", "[", "]", "{", "}")):
        return "markup-artifact"
    if text.count("(") != text.count(")") or text.count("[") != text.count("]"):
        return "unbalanced-markup"
    if re.search(r"\b\d{3,4}\s*[-–]\s*\d{2,4}\b", text):
        return "date-range-noise"
    if SOURCE_NOISE_RE.search(text) and len(text) < 90:
        return "source-attribution-noise"
    for reason, tokens in SAFETY_PATTERNS:
        if any(token in lower for token in tokens):
            return reason
    return None


def blocked_author_reason(author: str) -> str | None:
    lower = author.lower()
    for reason, tokens in SAFETY_PATTERNS:
        if any(token in lower for token in tokens):
            return reason
    return None


def quoted_substrings(text: str) -> list[str]:
    pairs = (("“", "”"), ("„", "“"), ("«", "»"), ('"', '"'))
    out: list[str] = []
    for start, end in pairs:
        if start == end:
            pattern = re.escape(start) + r"([^" + re.escape(start) + r"]{35,320})" + re.escape(end)
        else:
            pattern = re.escape(start) + r"(.{35,320}?)" + re.escape(end)
        out.extend(match.group(1).strip() for match in re.finditer(pattern, text))
    return out


def line_quote_candidates(cleaned: str) -> list[str]:
    candidates: list[str] = []
    candidates.extend(quoted_substrings(cleaned))

    dash_parts = re.split(r"\s+(?:—|–|―|-)\s+", cleaned, maxsplit=1)
    if len(dash_parts) > 1 and 35 <= len(dash_parts[0]) <= 320:
        candidates.append(dash_parts[0])

    colon_parts = re.split(r"\s*[:：]\s+", cleaned, maxsplit=1)
    if len(colon_parts) > 1 and 35 <= len(colon_parts[1]) <= 320 and len(colon_parts[0]) <= 80:
        candidates.append(colon_parts[1])

    if 35 <= len(cleaned) <= 280:
        candidates.append(cleaned)

    return candidates


def score_quote(text: str) -> int:
    length = len(text)
    score = 0
    if 70 <= length <= 190:
        score += 20
    elif 45 <= length <= 240:
        score += 12
    elif length <= 280:
        score += 4
    if re.search(r"[.!?。！？؟…]$", text):
        score += 6
    if any(mark in text for mark in ("?", "؟", "!", "！")):
        score += 2
    if text.count(",") + text.count("،") > 4:
        score -= 3
    if text.count(";") + text.count("؛") > 1:
        score -= 2
    if SOURCE_NOISE_RE.search(text):
        score -= 5
    return score


def title_for(text: str, max_chars: int = 56) -> str:
    first_line = re.split(r"[\n.!?。！？؟…]", text.strip(), maxsplit=1)[0]
    first_line = re.sub(r"\s+", " ", first_line).strip(" \"'“”„«»")
    if len(first_line) <= max_chars:
        return first_line
    clipped = first_line[:max_chars].rsplit(" ", 1)[0].strip()
    return clipped or first_line[:max_chars].strip()


def safe_section(section: str) -> bool:
    lower = section.lower()
    return not any(token in lower for token in BAD_SECTION_TOKENS)


def next_nonempty_line(lines: list[str], start: int) -> str:
    for line in lines[start:]:
        if line.strip():
            return line.strip()
    return ""


def looks_like_source_line(raw_line: str) -> bool:
    stripped = raw_line.strip()
    if not stripped.startswith("*") or stripped.startswith("**"):
        return False
    cleaned = clean_wikitext(re.sub(r"^\*+\s*", "", stripped))
    lower = cleaned.lower()
    if len(cleaned) < 12:
        return False
    return bool(
        SOURCE_NOISE_RE.search(cleaned)
        or re.search(r"\b(dans|éd\.?|édition|chap\.?|coll\.?|trad\.?|isbn|p\.\s*\d|pp\.\s*\d)\b", lower)
        or re.search(r"\b(in|ed\.?|edition|chapter|isbn|p\.\s*\d|pp\.\s*\d)\b", lower)
    )


def extract_quotes(lang: str, page: PageMeta, wikitext: str, max_per_page: int) -> list[QuoteCandidate]:
    section = ""
    seen: set[str] = set()
    out: list[QuoteCandidate] = []

    def add_candidate(raw_candidate: str, source_line: str, section_name: str, line_index: int) -> None:
        quote = normalize_quote(raw_candidate)
        if not (35 <= len(quote) <= 280):
            return
        if not has_letter(quote):
            return
        if quote.endswith((":","：")):
            return
        reason = blocked_reason(quote) or blocked_author_reason(page.title)
        if reason:
            return
        key = normalized_key(quote)
        if len(key) < 18 or key in seen:
            return
        seen.add(key)
        out.append(
            QuoteCandidate(
                lang=lang,
                author=page.title,
                page_title=page.title,
                page_url=page.url,
                qid=page.qid,
                section=section_name,
                quote=quote,
                source_line=source_line[:420],
                line_index=line_index,
                score=score_quote(quote),
            )
        )

    for line_index, block in iter_citation_template_blocks(wikitext):
        for value in citation_template_values(block):
            add_candidate(value, value, section, line_index)

    lines = wikitext.splitlines()
    for line_index, raw_line in enumerate(lines, start=1):
        heading = re.match(r"^=+\s*(.*?)\s*=+$", raw_line)
        if heading:
            section = clean_wikitext(heading.group(1))
            continue
        stripped = raw_line.strip()
        if not safe_section(section):
            continue

        source_line = ""
        if stripped.startswith("*") and not stripped.startswith("**"):
            raw_body = re.sub(r"^\*+\s*", "", stripped)
        else:
            if lang != "fr" or stripped.startswith(("{|", "|", "!", "#", ":", ";", "{{", "[[")):
                continue
            next_line = next_nonempty_line(lines, line_index)
            if not looks_like_source_line(next_line):
                continue
            raw_body = stripped
            source_line = clean_wikitext(re.sub(r"^\*+\s*", "", next_line))

        cleaned = clean_wikitext(raw_body)
        possible = template_quote_candidates(raw_body)
        if cleaned:
            possible.extend(line_quote_candidates(cleaned))

        for raw_candidate in possible:
            add_candidate(raw_candidate, source_line or cleaned, section, line_index)
    out.sort(key=lambda item: (-item.score, item.line_index, item.quote))
    return out[:max_per_page]


def collect_candidates(args: argparse.Namespace, lang: str) -> tuple[list[QuoteCandidate], dict[str, Any]]:
    if args.discovery == "sparql":
        return collect_candidates_from_sitelinks(args, lang)
    return collect_candidates_from_allpages(args, lang)


def collect_candidates_from_sitelinks(args: argparse.Namespace, lang: str) -> tuple[list[QuoteCandidate], dict[str, Any]]:
    candidate_goal = args.target + args.candidate_buffer
    by_page: dict[str, list[QuoteCandidate]] = {}
    page_order: list[str] = []
    pages_seen = 0
    human_pages = 0
    extracted_pages = 0
    qidless_quote_pages = 0
    skipped_nonhuman = 0

    sitelinks = fetch_human_sitelinks(lang, args.max_pages, args.request_wait)
    print(f"{lang}: discovered {len(sitelinks)} human Wikiquote sitelinks")
    for meta_batch in [sitelinks[index : index + args.page_batch_size] for index in range(0, len(sitelinks), args.page_batch_size)]:
        if not meta_batch:
            continue
        pages_seen += len(meta_batch)
        contents = fetch_wikitext_pages(lang, [page.title for page in meta_batch], args.request_wait)
        for page in meta_batch:
            wikitext = contents.get(page.title)
            if not wikitext:
                continue
            extracted = extract_quotes(lang, page, wikitext, args.max_per_page)
            if not extracted:
                continue
            by_page[page.title] = extracted
            page_order.append(page.title)
            human_pages += 1
            extracted_pages += 1
        total = sum(len(items) for items in by_page.values())
        print(
            f"{lang}: pages={pages_seen} human_quote_pages={human_pages} quote_pages={extracted_pages} candidates={total}"
        )
        if total >= candidate_goal:
            break

    selected = select_candidates(by_page, page_order, args.target)
    stats = {
        "discovery": "wikidata-sparql-human-sitelinks",
        "sitelinks": len(sitelinks),
        "pagesSeen": pages_seen,
        "humanPages": human_pages,
        "quotePages": extracted_pages,
        "candidateCount": sum(len(items) for items in by_page.values()),
        "skippedNonHumanPages": skipped_nonhuman,
        "qidlessQuotePages": qidless_quote_pages,
    }
    return selected, stats


def collect_candidates_from_allpages(args: argparse.Namespace, lang: str) -> tuple[list[QuoteCandidate], dict[str, Any]]:
    candidate_goal = args.target + args.candidate_buffer
    by_page: dict[str, list[QuoteCandidate]] = {}
    page_order: list[str] = []
    pages_seen = 0
    human_pages = 0
    extracted_pages = 0
    qidless_quote_pages = 0
    skipped_nonhuman = 0

    for source_batch in iter_sparql_page_source_batches(
        lang,
        args.max_pages,
        args.request_wait,
        args.page_batch_size,
    ):
        pages_seen += len(source_batch)
        for source in source_batch:
            page = source.meta
            extracted = extract_quotes(lang, page, source.wikitext, args.max_per_page)
            if not extracted:
                continue
            human_pages += 1
            by_page[page.title] = extracted
            page_order.append(page.title)
            extracted_pages += 1
        total = sum(len(items) for items in by_page.values())
        print(
            f"{lang}: pages={pages_seen} human_quote_pages={human_pages} quote_pages={extracted_pages} candidates={total}"
        )
        if total >= candidate_goal:
            break

    selected = select_candidates(by_page, page_order, args.target)
    stats = {
        "discovery": "wikiquote-allpages-with-wikidata-human-filter",
        "pagesSeen": pages_seen,
        "humanPages": human_pages,
        "quotePages": extracted_pages,
        "candidateCount": sum(len(items) for items in by_page.values()),
        "skippedNonHumanPages": skipped_nonhuman,
        "qidlessQuotePages": qidless_quote_pages,
    }
    return selected, stats


def select_candidates(
    by_page: dict[str, list[QuoteCandidate]],
    page_order: list[str],
    target: int,
) -> list[QuoteCandidate]:
    selected: list[QuoteCandidate] = []
    seen: set[str] = set()
    cursors = {title: 0 for title in page_order}
    while len(selected) < target:
        made_progress = False
        for title in page_order:
            items = by_page.get(title) or []
            cursor = cursors[title]
            while cursor < len(items):
                item = items[cursor]
                cursor += 1
                key = normalized_key(item.quote)
                if key in seen:
                    continue
                seen.add(key)
                selected.append(item)
                made_progress = True
                break
            cursors[title] = cursor
            if len(selected) >= target:
                break
        if not made_progress:
            break
    selected.sort(key=lambda item: (item.page_title.casefold(), item.line_index, item.quote))
    return selected[:target]


def deck_item(candidate: QuoteCandidate, item_id: int) -> dict[str, Any]:
    return {
        "id": item_id,
        "pack": math.floor((item_id - 1) / PACK_SIZE) + 1,
        "title": candidate.author,
        "text": candidate.quote,
        "chars": len(candidate.quote),
        "source": candidate.page_url,
    }


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_deck(lang: str, candidates: list[QuoteCandidate], stats: dict[str, Any], args: argparse.Namespace) -> None:
    deck_dir = DATA_DIR / f"quotes-{lang}"
    items = [deck_item(candidate, index) for index, candidate in enumerate(candidates, start=1)]
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
            "target": args.target,
            "source": "Wikiquote",
            "generator": "scripts/build-multilang-quote-decks.py",
        },
    )

    page_counts: dict[str, int] = {}
    page_meta: dict[str, dict[str, Any]] = {}
    for candidate in candidates:
        page_counts[candidate.page_title] = page_counts.get(candidate.page_title, 0) + 1
        page_meta[candidate.page_title] = {
            "title": candidate.page_title,
            "url": candidate.page_url,
            "wikidataQid": candidate.qid,
        }

    blockers: list[str] = []
    if len(items) < args.target:
        blockers.append(
            f"Only {len(items)} safe quote candidates were found after scanning {stats['pagesSeen']} Wikiquote pages "
            f"and {stats['humanPages']} Wikidata-human pages for language {lang}."
        )

    write_json(
        deck_dir / "sources.json",
        {
            "language": lang,
            "generator": "scripts/build-multilang-quote-decks.py",
            "license": {
                "source": "Wikiquote",
                "spdx": "CC-BY-SA",
                "note": CC_BY_SA_NOTE,
            },
            "policy": {
                "note": "Automated heuristic filtering; not a substitute for final editorial/legal review.",
                "filters": [
                    "Wikidata human-page filter",
                    "bad section filter",
                    "markup/source-noise filter",
                    "hate/extremism/violence/sexual/minor/politics-slur token filter",
                    "length and duplicate filters",
                ],
            },
            "target": args.target,
            "count": len(items),
            "stats": stats,
            "blockers": blockers,
            "pages": [
                {**page_meta[title], "items": page_counts[title]}
                for title in sorted(page_counts, key=str.casefold)
            ],
            "items": [
                {
                    "id": index,
                    "author": candidate.author,
                    "quote": candidate.quote,
                    "wikiquoteTitle": candidate.page_title,
                    "wikiquoteUrl": candidate.page_url,
                    "wikidataQid": candidate.qid,
                    "section": candidate.section,
                    "line": candidate.line_index,
                    "sourceLine": candidate.source_line,
                }
                for index, candidate in enumerate(candidates, start=1)
            ],
        },
    )


def parse_langs(raw: str) -> list[str]:
    langs = [part.strip() for part in raw.split(",") if part.strip()]
    bad = [lang for lang in langs if lang not in TARGET_LANGS]
    if bad:
        raise SystemExit(f"unsupported language(s): {', '.join(bad)}")
    return langs


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build multilingual dynamic quote decks from matching-language Wikiquote pages."
    )
    parser.add_argument("--langs", default=",".join(TARGET_LANGS), help="Comma-separated language list.")
    parser.add_argument("--target", type=int, default=DEFAULT_TARGET)
    parser.add_argument("--max-pages", type=int, default=DEFAULT_MAX_PAGES)
    parser.add_argument("--max-per-page", type=int, default=DEFAULT_MAX_PER_PAGE)
    parser.add_argument("--candidate-buffer", type=int, default=DEFAULT_CANDIDATE_BUFFER)
    parser.add_argument("--page-batch-size", type=int, default=DEFAULT_PAGE_BATCH_SIZE)
    parser.add_argument("--request-wait", type=float, default=0.15)
    parser.add_argument("--discovery", choices=("sparql", "allpages"), default="sparql")
    args = parser.parse_args()

    langs = parse_langs(args.langs)
    summary: dict[str, int] = {}
    for lang in langs:
        print(f"\n== {lang} ==")
        candidates, stats = collect_candidates(args, lang)
        write_deck(lang, candidates, stats, args)
        summary[lang] = len(candidates)
        status = "ok" if len(candidates) >= args.target else "short"
        print(f"{lang}: wrote {len(candidates)} items ({status})")

    print("\nsummary:")
    for lang in langs:
        print(f"  {lang}: {summary[lang]}")


if __name__ == "__main__":
    main()

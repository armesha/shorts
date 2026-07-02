#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import html
import json
import math
import random
import re
import subprocess
import time
import unicodedata
import wave
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
DECK_DIR = ROOT / "data" / "quotes-de"
VIDEOS_JSON = DECK_DIR / "videos.json"
INDEX_JSON = DECK_DIR / "index.json"
SOURCES_JSON = DECK_DIR / "sources.json"
AUTHORS_JSON = DECK_DIR / "authors.json"
PORTRAIT_DIR = DECK_DIR / "portraits"
MUSIC_DIR = DECK_DIR / "music"
CACHE_DIR = DECK_DIR / "source-cache"
ASSET_DIR = ROOT / "assets" / "fact-videos"
TEMP_CARD_DIR = ROOT / "tmp" / "quotes-de-cards"
CONTACT_DIR = ROOT / "tmp" / "quotes-de-contact"

USER_AGENT = "shorts-quotes-de-card-pack/1.0 (local source tracking)"
WIDTH = 1080
HEIGHT = 1920

FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSansDisplay-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/noto/NotoSansDisplay-Regular.ttf"
FONT_ITALIC = "/usr/share/fonts/truetype/noto/NotoSansDisplay-Italic.ttf"

DEFAULT_AUTHORS: list[dict[str, str]] = [
    {"name": "Abraham Lincoln", "wikiquote": "Abraham Lincoln", "qid": "Q91"},
    {"name": "Franklin D. Roosevelt", "wikiquote": "Franklin D. Roosevelt", "qid": "Q8007"},
    {"name": "Theodore Roosevelt", "wikiquote": "Theodore Roosevelt", "qid": "Q33866"},
    {"name": "John F. Kennedy", "wikiquote": "John F. Kennedy", "qid": "Q9696"},
    {"name": "George Washington", "wikiquote": "George Washington", "qid": "Q23"},
    {"name": "Thomas Jefferson", "wikiquote": "Thomas Jefferson", "qid": "Q11812"},
    {"name": "Benjamin Franklin", "wikiquote": "Benjamin Franklin", "qid": "Q34969"},
    {"name": "Winston Churchill", "wikiquote": "Winston Churchill", "qid": "Q8016"},
    {"name": "Nelson Mandela", "wikiquote": "Nelson Mandela", "qid": "Q8023"},
    {"name": "Mahatma Gandhi", "wikiquote": "Mahatma Gandhi", "qid": "Q1001"},
    {"name": "Martin Luther King", "wikiquote": "Martin Luther King", "qid": "Q8027"},
    {"name": "Charles de Gaulle", "wikiquote": "Charles de Gaulle", "qid": "Q2042"},
    {"name": "Otto von Bismarck", "wikiquote": "Otto von Bismarck", "qid": "Q8442"},
    {"name": "Konrad Adenauer", "wikiquote": "Konrad Adenauer", "qid": "Q2492"},
    {"name": "Willy Brandt", "wikiquote": "Willy Brandt", "qid": "Q2518"},
    {"name": "Helmut Schmidt", "wikiquote": "Helmut Schmidt", "qid": "Q2524"},
    {"name": "Richard von Weizsäcker", "wikiquote": "Richard von Weizsäcker", "qid": ""},
    {"name": "Theodor Heuss", "wikiquote": "Theodor Heuss", "qid": ""},
    {"name": "Hans-Dietrich Genscher", "wikiquote": "Hans-Dietrich Genscher", "qid": ""},
    {"name": "Václav Havel", "wikiquote": "Václav Havel", "qid": ""},
    {"name": "Michail Gorbatschow", "wikiquote": "Michail Gorbatschow", "qid": ""},
    {"name": "Lech Wałęsa", "wikiquote": "Lech Wałęsa", "qid": ""},
    {"name": "Eleanor Roosevelt", "wikiquote": "Eleanor Roosevelt", "qid": "Q83303"},
    {"name": "Margaret Thatcher", "wikiquote": "Margaret Thatcher", "qid": ""},
    {"name": "Simone Veil", "wikiquote": "Simone Veil", "qid": ""},
    {"name": "Marcus Tullius Cicero", "wikiquote": "Marcus Tullius Cicero", "qid": "Q1541"},
    {"name": "Mark Aurel", "wikiquote": "Mark Aurel", "qid": "Q79719"},
    {"name": "Seneca", "wikiquote": "Seneca", "qid": ""},
    {"name": "Niccolò Machiavelli", "wikiquote": "Niccolò Machiavelli", "qid": "Q1399"},
    {"name": "Montesquieu", "wikiquote": "Montesquieu", "qid": "Q1599"},
    {"name": "Jean-Jacques Rousseau", "wikiquote": "Jean-Jacques Rousseau", "qid": "Q6527"},
    {"name": "Voltaire", "wikiquote": "Voltaire", "qid": "Q9068"},
    {"name": "John Locke", "wikiquote": "John Locke", "qid": "Q9353"},
    {"name": "Thomas Hobbes", "wikiquote": "Thomas Hobbes", "qid": ""},
    {"name": "Hannah Arendt", "wikiquote": "Hannah Arendt", "qid": ""},
    {"name": "Aristoteles", "wikiquote": "Aristoteles", "qid": "Q868"},
    {"name": "Platon", "wikiquote": "Platon", "qid": "Q859"},
    {"name": "Perikles", "wikiquote": "Perikles", "qid": ""},
    {"name": "Sokrates", "wikiquote": "Sokrates", "qid": "Q913"},
    {"name": "Immanuel Kant", "wikiquote": "Immanuel Kant", "qid": "Q9312"},
    {"name": "Johann Wolfgang von Goethe", "wikiquote": "Johann Wolfgang von Goethe", "qid": "Q5879"},
    {"name": "Friedrich Schiller", "wikiquote": "Friedrich Schiller", "qid": "Q22670"},
    {"name": "Albert Einstein", "wikiquote": "Albert Einstein", "qid": "Q937"},
    {"name": "Friedrich Nietzsche", "wikiquote": "Friedrich Nietzsche", "qid": "Q9358"},
    {"name": "Arthur Schopenhauer", "wikiquote": "Arthur Schopenhauer", "qid": "Q38193"},
    {"name": "Martin Luther", "wikiquote": "Martin Luther", "qid": "Q9554"},
    {"name": "Blaise Pascal", "wikiquote": "Blaise Pascal", "qid": "Q1290"},
    {"name": "René Descartes", "wikiquote": "René Descartes", "qid": "Q9191"},
    {"name": "Francis Bacon", "wikiquote": "Francis Bacon", "qid": "Q37388"},
    {"name": "Baruch de Spinoza", "wikiquote": "Baruch de Spinoza", "qid": "Q35802"},
    {"name": "Gottfried Wilhelm Leibniz", "wikiquote": "Gottfried Wilhelm Leibniz", "qid": "Q9047"},
    {"name": "David Hume", "wikiquote": "David Hume", "qid": "Q37160"},
    {"name": "Adam Smith", "wikiquote": "Adam Smith", "qid": "Q9381"},
    {"name": "Alexis de Tocqueville", "wikiquote": "Alexis de Tocqueville", "qid": "Q133070"},
    {"name": "Edmund Burke", "wikiquote": "Edmund Burke", "qid": "Q213725"},
    {"name": "John Stuart Mill", "wikiquote": "John Stuart Mill", "qid": "Q50020"},
    {"name": "Thomas Paine", "wikiquote": "Thomas Paine", "qid": "Q213954"},
    {"name": "Karl Marx", "wikiquote": "Karl Marx", "qid": "Q9061"},
    {"name": "Rosa Luxemburg", "wikiquote": "Rosa Luxemburg", "qid": "Q7235"},
    {"name": "Marie von Ebner-Eschenbach", "wikiquote": "Marie von Ebner-Eschenbach", "qid": "Q76783"},
    {"name": "Georg Christoph Lichtenberg", "wikiquote": "Georg Christoph Lichtenberg", "qid": "Q57970"},
    {"name": "Heinrich Heine", "wikiquote": "Heinrich Heine", "qid": "Q44403"},
    {"name": "Friedrich Hölderlin", "wikiquote": "Friedrich Hölderlin", "qid": "Q43440"},
    {"name": "Novalis", "wikiquote": "Novalis", "qid": "Q76527"},
    {"name": "Heinrich von Kleist", "wikiquote": "Heinrich von Kleist", "qid": "Q41578"},
    {"name": "Gotthold Ephraim Lessing", "wikiquote": "Gotthold Ephraim Lessing", "qid": "Q34628"},
    {"name": "Theodor Fontane", "wikiquote": "Theodor Fontane", "qid": "Q76407"},
    {"name": "Wilhelm Busch", "wikiquote": "Wilhelm Busch", "qid": "Q76565"},
    {"name": "Christian Morgenstern", "wikiquote": "Christian Morgenstern", "qid": "Q76590"},
    {"name": "Franz Kafka", "wikiquote": "Franz Kafka", "qid": "Q905"},
    {"name": "Stefan Zweig", "wikiquote": "Stefan Zweig", "qid": "Q78491"},
    {"name": "Karl Kraus", "wikiquote": "Karl Kraus", "qid": "Q78481"},
    {"name": "Kurt Tucholsky", "wikiquote": "Kurt Tucholsky", "qid": "Q58747"},
    {"name": "Dante Alighieri", "wikiquote": "Dante Alighieri", "qid": "Q1067"},
    {"name": "William Shakespeare", "wikiquote": "William Shakespeare", "qid": "Q692"},
    {"name": "Oscar Wilde", "wikiquote": "Oscar Wilde", "qid": "Q30875"},
    {"name": "Mark Twain", "wikiquote": "Mark Twain", "qid": "Q7245"},
    {"name": "Leo Tolstoi", "wikiquote": "Leo Tolstoi", "qid": "Q7243"},
    {"name": "Fjodor Dostojewski", "wikiquote": "Fjodor Dostojewski", "qid": "Q991"},
    {"name": "Anton Tschechow", "wikiquote": "Anton Tschechow", "qid": "Q5685"},
    {"name": "Victor Hugo", "wikiquote": "Victor Hugo", "qid": "Q535"},
    {"name": "Søren Kierkegaard", "wikiquote": "Søren Kierkegaard", "qid": "Q6512"},
    {"name": "Konfuzius", "wikiquote": "Konfuzius", "qid": "Q4604"},
    {"name": "Laotse", "wikiquote": "Laotse", "qid": "Q9333"},
    {"name": "Epiktet", "wikiquote": "Epiktet", "qid": "Q82563"},
    {"name": "Epikur", "wikiquote": "Epikur", "qid": "Q8683"},
    {"name": "Heraklit", "wikiquote": "Heraklit", "qid": "Q41155"},
    {"name": "Demokrit", "wikiquote": "Demokrit", "qid": "Q41980"},
    {"name": "Pythagoras", "wikiquote": "Pythagoras", "qid": "Q10261"},
    {"name": "Sunzi", "wikiquote": "Sunzi", "qid": "Q3011"},
    {"name": "Julius Caesar", "wikiquote": "Julius Caesar", "qid": "Q1048"},
    {"name": "Napoleon Bonaparte", "wikiquote": "Napoleon Bonaparte", "qid": "Q517"},
    {"name": "Simón Bolívar", "wikiquote": "Simón Bolívar", "qid": "Q8605"},
    {"name": "Carl von Clausewitz", "wikiquote": "Carl von Clausewitz", "qid": "Q76865"},
    {"name": "Ralph Waldo Emerson", "wikiquote": "Ralph Waldo Emerson", "qid": "Q48226"},
    {"name": "Henry David Thoreau", "wikiquote": "Henry David Thoreau", "qid": "Q131149"},
    {"name": "Johanna von Orléans", "wikiquote": "Johanna von Orléans", "qid": "Q7226"},
    {"name": "Katharina die Große", "wikiquote": "Katharina die Große", "qid": "Q36450"},
    {"name": "Peter der Große", "wikiquote": "Peter der Große", "qid": "Q8479"},
    {"name": "Friedrich II.", "wikiquote": "Friedrich II.", "qid": "Q66475"},
    {"name": "Maria Theresia", "wikiquote": "Maria Theresia", "qid": "Q131706"},
    {"name": "Elisabeth I.", "wikiquote": "Elisabeth I.", "qid": "Q7207"},
    {"name": "Victoria", "wikiquote": "Victoria", "qid": "Q9439"},
    {"name": "Erasmus von Rotterdam", "wikiquote": "Erasmus von Rotterdam", "qid": "Q43499"},
    {"name": "Michel de Montaigne", "wikiquote": "Michel de Montaigne", "qid": "Q41568"},
    {"name": "Thomas Morus", "wikiquote": "Thomas Morus", "qid": "Q1645"},
    {"name": "Thomas von Aquin", "wikiquote": "Thomas von Aquin", "qid": "Q9438"},
    {"name": "Augustinus von Hippo", "wikiquote": "Augustinus von Hippo", "qid": "Q8018"},
    {"name": "Meister Eckhart", "wikiquote": "Meister Eckhart", "qid": "Q76224"},
    {"name": "Angelus Silesius", "wikiquote": "Angelus Silesius", "qid": "Q61930"},
    {"name": "La Rochefoucauld", "wikiquote": "François de La Rochefoucauld", "qid": "Q193199"},
    {"name": "Jean de La Bruyère", "wikiquote": "Jean de La Bruyère", "qid": "Q180076"},
    {"name": "Samuel Johnson", "wikiquote": "Samuel Johnson", "qid": "Q183266"},
    {"name": "Alexander Pope", "wikiquote": "Alexander Pope", "qid": "Q207781"},
    {"name": "Jonathan Swift", "wikiquote": "Jonathan Swift", "qid": "Q9021"},
    {"name": "Thomas Carlyle", "wikiquote": "Thomas Carlyle", "qid": "Q159740"},
    {"name": "John Ruskin", "wikiquote": "John Ruskin", "qid": "Q179458"},
    {"name": "Charles Dickens", "wikiquote": "Charles Dickens", "qid": "Q5686"},
    {"name": "Jane Austen", "wikiquote": "Jane Austen", "qid": "Q36322"},
    {"name": "Emily Dickinson", "wikiquote": "Emily Dickinson", "qid": "Q217070"},
    {"name": "Walt Whitman", "wikiquote": "Walt Whitman", "qid": "Q81433"},
    {"name": "Gustave Flaubert", "wikiquote": "Gustave Flaubert", "qid": "Q43444"},
    {"name": "Honoré de Balzac", "wikiquote": "Honoré de Balzac", "qid": "Q9711"},
    {"name": "Molière", "wikiquote": "Molière", "qid": "Q687"},
    {"name": "Jean Racine", "wikiquote": "Jean Racine", "qid": "Q183337"},
    {"name": "Pierre Corneille", "wikiquote": "Pierre Corneille", "qid": "Q184432"},
    {"name": "Alphonse de Lamartine", "wikiquote": "Alphonse de Lamartine", "qid": "Q177272"},
    {"name": "Heinrich Mann", "wikiquote": "Heinrich Mann", "qid": "Q76392"},
    {"name": "Gerhart Hauptmann", "wikiquote": "Gerhart Hauptmann", "qid": "Q77248"},
    {"name": "Rainer Maria Rilke", "wikiquote": "Rainer Maria Rilke", "qid": "Q76401"},
    {"name": "Stefan George", "wikiquote": "Stefan George", "qid": "Q76710"},
    {"name": "Hugo von Hofmannsthal", "wikiquote": "Hugo von Hofmannsthal", "qid": "Q76814"},
    {"name": "Johann Gottfried Herder", "wikiquote": "Johann Gottfried Herder", "qid": "Q57085"},
    {"name": "Christoph Martin Wieland", "wikiquote": "Christoph Martin Wieland", "qid": "Q76560"},
    {"name": "Friedrich Gottlieb Klopstock", "wikiquote": "Friedrich Gottlieb Klopstock", "qid": "Q76375"},
    {"name": "Matthias Claudius", "wikiquote": "Matthias Claudius", "qid": "Q76359"},
    {"name": "Jean Paul", "wikiquote": "Jean Paul", "qid": "Q57487"},
    {"name": "Friedrich Hebbel", "wikiquote": "Friedrich Hebbel", "qid": "Q76700"},
    {"name": "Adalbert Stifter", "wikiquote": "Adalbert Stifter", "qid": "Q76410"},
    {"name": "Annette von Droste-Hülshoff", "wikiquote": "Annette von Droste-Hülshoff", "qid": "Q76471"},
    {"name": "Bettina von Arnim", "wikiquote": "Bettina von Arnim", "qid": "Q76746"},
    {"name": "Clemens Brentano", "wikiquote": "Clemens Brentano", "qid": "Q76748"},
    {"name": "Joseph von Eichendorff", "wikiquote": "Joseph von Eichendorff", "qid": "Q76377"},
    {"name": "E. T. A. Hoffmann", "wikiquote": "E. T. A. Hoffmann", "qid": "Q213712"},
    {"name": "Wilhelm von Humboldt", "wikiquote": "Wilhelm von Humboldt", "qid": "Q6694"},
    {"name": "Alexander von Humboldt", "wikiquote": "Alexander von Humboldt", "qid": "Q6692"},
    {"name": "Friedrich Rückert", "wikiquote": "Friedrich Rückert", "qid": "Q76642"},
    {"name": "Georg Büchner", "wikiquote": "Georg Büchner", "qid": "Q76397"},
    {"name": "Ludwig Börne", "wikiquote": "Ludwig Börne", "qid": "Q76722"},
    {"name": "Ferdinand Freiligrath", "wikiquote": "Ferdinand Freiligrath", "qid": "Q76649"},
    {"name": "Gottfried Keller", "wikiquote": "Gottfried Keller", "qid": "Q76549"},
    {"name": "Conrad Ferdinand Meyer", "wikiquote": "Conrad Ferdinand Meyer", "qid": "Q76388"},
    {"name": "Theodor Storm", "wikiquote": "Theodor Storm", "qid": "Q76381"},
    {"name": "Eduard Mörike", "wikiquote": "Eduard Mörike", "qid": "Q76567"},
    {"name": "Ludwig Uhland", "wikiquote": "Ludwig Uhland", "qid": "Q76379"},
]

POLICY_BLOCKLIST = [
    "ratten",
    "warmer bruder",
    "bedingungslosen gehorsam",
    "totalen krieg",
    "tel aviv",
    "untermensch",
    "ausrotten",
    "vernichten",
    "vergas",
    "zigeuner",
    "neger",
    "nigger",
    "juden",
    "jude",
    "israel",
    "paläst",
    "ausländer",
    "asyl",
    "flüchtling",
    "moslem",
    "muslim",
    "islam",
    "türken",
    "schweine",
    "parasiten",
    "nationalsozialisten",
    "bücherverbrennungen",
    "volksgemeinschaft",
    "feuerspruch",
    "übergebe der flamme",
    "flamme die schriften",
    "zauberinnen getötet",
    "hängt",
    "erschießen",
    "erschossen",
    "töten",
    "umbringen",
    "rasse",
    "rass",
    "arier",
    "hitler",
    "goebbels",
    "ss-",
]

BAD_SECTIONS = [
    "zugeschrieben",
    "fälschlich",
    "falsch",
    "über ",
    "über ihn",
    "literatur",
    "weblinks",
    "siehe auch",
]

HOOK_WORDS = [
    "freiheit",
    "demokratie",
    "macht",
    "staat",
    "regierung",
    "wahrheit",
    "lüge",
    "mut",
    "angst",
    "frieden",
    "krieg",
    "geschichte",
    "zukunft",
    "mensch",
    "menschen",
    "verantwortung",
    "gerechtigkeit",
    "gesetz",
    "ordnung",
    "gewissen",
    "charakter",
    "entscheidung",
    "handeln",
    "denken",
    "wissen",
    "lernen",
    "führung",
    "volk",
    "gesellschaft",
]

TEMPLATES = [
    {
        "id": "classic-archive",
        "paper": (232, 238, 244),
        "ink": (8, 11, 28),
        "accent": (18, 38, 80),
        "photo_filter": "silver",
    },
    {
        "id": "cream-history",
        "paper": (242, 238, 226),
        "ink": (20, 18, 14),
        "accent": (111, 78, 38),
        "photo_filter": "sepia",
    },
    {
        "id": "cold-editorial",
        "paper": (229, 236, 238),
        "ink": (3, 21, 31),
        "accent": (0, 82, 102),
        "photo_filter": "mono-blue",
    },
    {
        "id": "high-contrast",
        "paper": (241, 242, 238),
        "ink": (5, 5, 9),
        "accent": (173, 29, 48),
        "photo_filter": "silver",
    },
    {
        "id": "statesman-note",
        "paper": (238, 241, 232),
        "ink": (15, 24, 17),
        "accent": (45, 97, 70),
        "photo_filter": "sepia",
    },
]


@dataclass
class QuoteCandidate:
    author: str
    wikiquote: str
    quote: str
    source_line: str
    section: str
    score: int


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return slug or "item"


def search_title_matches(requested: str, found: str) -> bool:
    requested_norm = slugify(requested).replace("-", " ")
    found_norm = slugify(found).replace("-", " ")
    tokens = [token for token in requested_norm.split() if len(token) > 2 and token not in {"der", "die", "das", "von"}]
    return bool(tokens) and all(token in found_norm for token in tokens)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)


def load_authors(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return copy.deepcopy(DEFAULT_AUTHORS)
    data = load_json(path, None)
    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a JSON array")
    authors: list[dict[str, str]] = []
    seen: set[str] = set()
    for index, item in enumerate(data, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"{path} item {index} must be an object")
        name = str(item.get("name") or "").strip()
        wikiquote = str(item.get("wikiquote") or name).strip()
        qid = str(item.get("qid") or "").strip()
        if not name:
            raise ValueError(f"{path} item {index} is missing name")
        if not wikiquote:
            raise ValueError(f"{path} item {index} is missing wikiquote")
        if name in seen:
            raise ValueError(f"{path} contains duplicate author name: {name}")
        seen.add(name)
        authors.append({"name": name, "wikiquote": wikiquote, "qid": qid})
    if not authors:
        raise ValueError(f"{path} must contain at least one author")
    return authors


def request_json(session: requests.Session, url: str, params: dict[str, str], wait: float) -> Any:
    for attempt in range(6):
        response = session.get(url, params=params, timeout=45)
        if response.status_code == 429:
            retry_after = response.headers.get("retry-after")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else max(20.0, wait * (attempt + 2))
            print(f"429 from {url}; sleeping {delay:.0f}s")
            time.sleep(delay)
            continue
        response.raise_for_status()
        if wait:
            time.sleep(wait)
        return response.json()
    raise RuntimeError(f"too many 429 responses from {url}")


def fetch_wikiquote_wikitext(session: requests.Session, title: str, wait: float, refresh: bool) -> tuple[str | None, str]:
    cache_file = CACHE_DIR / "wikiquote" / f"{slugify(title)}.wiki"
    url = f"https://de.wikiquote.org/wiki/{requests.utils.quote(title.replace(' ', '_'))}"
    if cache_file.exists() and not refresh:
        return cache_file.read_text(encoding="utf-8"), url

    data = request_json(
        session,
        "https://de.wikiquote.org/w/api.php",
        {
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "format": "json",
            "formatversion": "2",
            "titles": title,
        },
        wait,
    )
    page = data["query"]["pages"][0]
    if page.get("missing"):
        search = request_json(
            session,
            "https://de.wikiquote.org/w/api.php",
            {
                "action": "query",
                "list": "search",
                "srsearch": title,
                "srlimit": "1",
                "format": "json",
            },
            wait,
        )
        results = search.get("query", {}).get("search", [])
        if not results:
            return None, url
        found_title = results[0]["title"]
        if found_title.lower() == title.lower() or not search_title_matches(title, found_title):
            return None, url
        return fetch_wikiquote_wikitext(session, found_title, wait, refresh)
    text = page["revisions"][0]["content"]
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(text, encoding="utf-8")
    return text, url


def strip_templates(text: str) -> str:
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"\{\{[^{}]*\}\}", "", text)
    return text


def clean_wikitext(text: str) -> str:
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S | re.I)
    text = re.sub(r"<ref[^>]*/>", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = strip_templates(text)
    text = re.sub(r"\[\[[^|\]]+\|([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"\[https?://[^\s\]]+\s*([^\]]*)\]", r"\1", text)
    text = text.replace("''", "")
    text = html.unescape(text)
    text = text.replace("&nbsp;", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_quote(text: str) -> str:
    text = text.strip(" “„”\"'«»")
    text = re.sub(r"\s+", " ", text)
    text = text.replace("...", "…")
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return text.strip()


def normalized_key(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def blocked_reason(quote: str) -> str | None:
    lower = quote.lower()
    if any(token in quote for token in ["//", "[", "]", "{", "}", "/"]):
        return "markup-artifact"
    if "vollständig" in lower or "original:" in lower or "isbn" in lower or "http" in lower:
        return "source-artifact"
    if "(" in quote or ")" in quote:
        return "parenthetical-artifact"
    if re.search(r"\b(töt|totschlag|totgeschlag|todesstrafe|rache|wiedervergeltung|geschossen|schossen)\w*", lower):
        return "violence-term"
    for token in POLICY_BLOCKLIST:
        if token in lower:
            return token
    return None


def score_quote(quote: str) -> int:
    lower = quote.lower()
    score = 0
    for word in HOOK_WORDS:
        if word in lower:
            score += 4
    length = len(quote)
    if 75 <= length <= 155:
        score += 18
    elif 55 <= length <= 190:
        score += 10
    elif length <= 230:
        score += 3
    if "?" in quote:
        score += 3
    if "!" in quote:
        score += 2
    if quote.count(",") > 3:
        score -= 2
    if quote.count(";") > 1:
        score -= 2
    return score


def extract_quotes(author: dict[str, str], wikitext: str) -> list[QuoteCandidate]:
    section = ""
    out: list[QuoteCandidate] = []
    for raw_line in wikitext.splitlines():
        heading = re.match(r"^=+\s*(.*?)\s*=+$", raw_line)
        if heading:
            section = clean_wikitext(heading.group(1)).lower()
            continue
        if not raw_line.startswith("* ") or raw_line.startswith("**"):
            continue
        if any(bad in section for bad in BAD_SECTIONS):
            continue
        cleaned = clean_wikitext(raw_line[2:])
        if not cleaned or "Original " in cleaned or "Original:" in cleaned:
            continue

        quote: str | None = None
        for pattern in [
            r"^[\"„“«»](.+?)[\"“”«»]\s*(?:-|–|—|,|\.|$)",
            r"^(.{45,260}?)\s+(?:-|–|—)\s+",
        ]:
            match = re.match(pattern, cleaned)
            if match:
                quote = normalize_quote(match.group(1))
                break
        if not quote:
            continue
        if len(quote) < 45 or len(quote) > 235:
            continue
        if quote.endswith(":") or quote.count("(") != quote.count(")"):
            continue
        if blocked_reason(quote):
            continue
        if re.search(r"\b(ich|mir|mein)\b", quote.lower()) and len(quote) < 70:
            continue
        score = score_quote(quote)
        if score < 8:
            continue
        out.append(
            QuoteCandidate(
                author=author["name"],
                wikiquote=author["wikiquote"],
                quote=quote,
                source_line=cleaned[:500],
                section=section,
                score=score,
            )
        )
    deduped: list[QuoteCandidate] = []
    seen: set[str] = set()
    for item in sorted(out, key=lambda x: x.score, reverse=True):
        key = normalized_key(item.quote)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def existing_quote_keys(ignore_range: tuple[int, int] | None = None) -> set[str]:
    existing = load_json(VIDEOS_JSON, [])
    keys: set[str] = set()
    for item in existing:
        if ignore_range:
            match = re.match(r"q(\d+)\.mp4$", item.get("file", ""))
            if match and ignore_range[0] <= int(match.group(1)) <= ignore_range[1]:
                continue
        text = item.get("text", "")
        text = re.sub(r"^[„\"«](.*?)[“\"»]\s*—.*$", r"\1", text.replace("\n", " "), flags=re.S)
        keys.add(normalized_key(text))
    return keys


def collect_candidates(args: argparse.Namespace) -> list[QuoteCandidate]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    authors = getattr(args, "authors", DEFAULT_AUTHORS)
    replace_start = getattr(args, "start_id", None)
    replace_count = getattr(args, "replace_count", args.count)
    ignore_range = (replace_start, replace_start + replace_count - 1) if replace_start else None
    existing = existing_quote_keys(ignore_range)
    all_by_author: dict[str, list[QuoteCandidate]] = {}
    for author in authors:
        try:
            wikitext, url = fetch_wikiquote_wikitext(session, author["wikiquote"], args.fetch_wait, args.refresh)
            if not wikitext:
                print(f"missing wikiquote page: {author['wikiquote']}")
                continue
            candidates = [q for q in extract_quotes(author, wikitext) if normalized_key(q.quote) not in existing]
            all_by_author[author["name"]] = candidates
            print(f"{author['name']}: {len(candidates)} usable quotes ({url})")
        except Exception as exc:
            print(f"{author['name']}: fetch/extract failed: {exc}")

    selected: list[QuoteCandidate] = []
    per_author = {name: 0 for name in all_by_author}
    max_per_author = args.max_per_author
    while len(selected) < args.count:
        made_progress = False
        for name, candidates in sorted(all_by_author.items(), key=lambda x: len(x[1]), reverse=True):
            if per_author[name] >= max_per_author:
                continue
            while candidates:
                item = candidates.pop(0)
                key = normalized_key(item.quote)
                if key in existing or any(normalized_key(s.quote) == key for s in selected):
                    continue
                selected.append(item)
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
                print(f"not enough quotes; relaxing max per author to {max_per_author}")
                continue
            break

    author_count = len({item.author for item in selected})
    print(f"selected {len(selected)} quotes from {author_count} authors")
    allow_short_pool = getattr(args, "allow_short_pool", False)
    min_needed = getattr(args, "min_needed", args.count)
    if len(selected) < args.count and (not allow_short_pool or len(selected) < min_needed):
        raise RuntimeError(f"only selected {len(selected)} quotes; need {args.count}")
    if author_count < args.min_authors:
        raise RuntimeError(f"only {author_count} authors; need at least {args.min_authors}")
    return selected[: args.count]


def fetch_wikidata_qid(session: requests.Session, name: str, wait: float) -> str | None:
    data = request_json(
        session,
        "https://www.wikidata.org/w/api.php",
        {
            "action": "wbsearchentities",
            "language": "en",
            "format": "json",
            "limit": "1",
            "search": name,
        },
        wait,
    )
    search = data.get("search") or []
    return search[0]["id"] if search else None


def fetch_portrait_meta(session: requests.Session, author: dict[str, str], wait: float, refresh: bool) -> dict[str, Any] | None:
    meta_path = CACHE_DIR / "portraits" / f"{slugify(author['name'])}.json"
    if meta_path.exists() and not refresh:
        return load_json(meta_path, None)

    qid = author.get("qid") or fetch_wikidata_qid(session, author["name"], wait)
    if not qid:
        return None
    entity = request_json(
        session,
        f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
        {},
        wait,
    )["entities"][qid]
    claims = entity.get("claims", {}).get("P18", [])
    if not claims:
        return None
    filename = claims[0]["mainsnak"]["datavalue"]["value"]
    title = "File:" + filename
    commons = request_json(
        session,
        "https://commons.wikimedia.org/w/api.php",
        {
            "action": "query",
            "format": "json",
            "prop": "imageinfo",
            "iiprop": "url|extmetadata",
            "iiurlwidth": "1600",
            "titles": title,
        },
        wait,
    )
    page = next(iter(commons["query"]["pages"].values()))
    imageinfo = page.get("imageinfo", [{}])[0]
    metadata = imageinfo.get("extmetadata", {})
    meta = {
        "author": author["name"],
        "wikidataQid": qid,
        "commonsFile": filename,
        "commonsTitle": title,
        "commonsPage": f"https://commons.wikimedia.org/wiki/File:{requests.utils.quote(filename.replace(' ', '_'))}",
        "thumbUrl": imageinfo.get("thumburl") or imageinfo.get("url"),
        "originalUrl": imageinfo.get("url"),
        "licenseShortName": metadata.get("LicenseShortName", {}).get("value"),
        "licenseUrl": metadata.get("LicenseUrl", {}).get("value"),
        "artist": clean_wikitext(metadata.get("Artist", {}).get("value", "")),
        "credit": clean_wikitext(metadata.get("Credit", {}).get("value", "")),
    }
    meta_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(meta_path, meta)
    return meta


def download_portrait(session: requests.Session, meta: dict[str, Any], refresh: bool) -> Path:
    ext = Path(meta["commonsFile"]).suffix.lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        ext = ".jpg"
    path = PORTRAIT_DIR / f"{slugify(meta['author'])}{ext}"
    if path.exists() and not refresh:
        return path
    PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(2):
        response = session.get(meta["thumbUrl"], timeout=60)
        if response.status_code == 429:
            delay = 8 + attempt * 12
            print(f"{meta['author']}: portrait download 429; sleeping {delay}s", flush=True)
            time.sleep(delay)
            continue
        try:
            response.raise_for_status()
            path.write_bytes(response.content)
            return path
        except Exception as exc:
            last_error = exc
            time.sleep(3 + attempt * 3)
    if last_error:
        raise last_error
    raise RuntimeError(f"could not download portrait for {meta['author']}")
    return path


def is_public_domainish(meta: dict[str, Any]) -> bool:
    license_name = (meta.get("licenseShortName") or "").lower()
    return any(token in license_name for token in ["public domain", "cc0", "no restrictions"])


def has_unsafe_portrait_credit(meta: dict[str, Any]) -> bool:
    credit = (meta.get("credit") or "").lower()
    return "allposters.com" in credit


def prepare_portraits(args: argparse.Namespace, required_authors: set[str] | None = None) -> dict[str, dict[str, Any]]:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    authors = getattr(args, "authors", DEFAULT_AUTHORS)
    result: dict[str, dict[str, Any]] = {}
    for author in authors:
        if required_authors is not None and author["name"] not in required_authors:
            continue
        try:
            meta = fetch_portrait_meta(session, author, args.fetch_wait, args.refresh)
            if not meta or not meta.get("thumbUrl"):
                print(f"{author['name']}: no portrait")
                continue
            if has_unsafe_portrait_credit(meta):
                print(f"{author['name']}: portrait skipped (unsafe credit)")
                continue
            if not args.allow_attribution_portraits and not is_public_domainish(meta):
                print(f"{author['name']}: portrait skipped ({meta.get('licenseShortName') or 'unknown license'})")
                continue
            path = download_portrait(session, meta, args.refresh)
            meta["localPath"] = str(path.relative_to(ROOT))
            result[author["name"]] = meta
            print(f"{author['name']}: portrait {meta.get('licenseShortName') or 'unknown license'}")
        except Exception as exc:
            print(f"{author['name']}: portrait failed: {exc}")
    return result


def fit_cover(image: Image.Image, size: tuple[int, int], anchor_y: float = 0.42) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGB")
    iw, ih = image.size
    tw, th = size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = image.resize((nw, nh), Image.Resampling.LANCZOS)
    left = max(0, (nw - tw) // 2)
    top = int(max(0, min(nh - th, nh * anchor_y - th * anchor_y)))
    return resized.crop((left, top, left + tw, top + th))


def tint_photo(image: Image.Image, mode: str) -> Image.Image:
    gray = ImageOps.grayscale(image)
    gray = ImageEnhance.Contrast(gray).enhance(1.12)
    if mode == "sepia":
        colored = ImageOps.colorize(gray, black=(36, 27, 20), white=(229, 219, 202))
    elif mode == "mono-blue":
        colored = ImageOps.colorize(gray, black=(9, 19, 26), white=(218, 228, 232))
    else:
        colored = ImageOps.colorize(gray, black=(13, 14, 18), white=(226, 230, 232))
    return ImageEnhance.Sharpness(colored).enhance(1.18)


def draw_noise(base: Image.Image, amount: int = 5) -> None:
    random.seed(1007)
    overlay = Image.new("L", base.size, 0)
    px = overlay.load()
    for y in range(0, base.size[1], 2):
        for x in range(0, base.size[0], 2):
            value = random.randint(0, amount)
            px[x, y] = value
    base.alpha_composite(Image.merge("RGBA", (overlay, overlay, overlay, overlay)))


def text_bbox(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font, stroke_width=0)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        attempt = word if not current else f"{current} {word}"
        if text_bbox(draw, attempt, font)[0] <= max_width:
            current = attempt
            continue
        if current:
            lines.append(current)
            current = word
        else:
            pieces = []
            part = ""
            for ch in word:
                attempt_part = part + ch
                if text_bbox(draw, attempt_part, font)[0] <= max_width:
                    part = attempt_part
                else:
                    pieces.append(part)
                    part = ch
            if part:
                pieces.append(part)
            lines.extend(pieces[:-1])
            current = pieces[-1] if pieces else ""
    if current:
        lines.append(current)
    return lines


def fit_quote(draw: ImageDraw.ImageDraw, quote: str, max_width: int, max_height: int, min_size: int, max_size: int) -> tuple[ImageFont.FreeTypeFont, list[str], int]:
    best: tuple[ImageFont.FreeTypeFont, list[str], int] | None = None
    rendered = f"«{quote.upper()}»"
    for size in range(max_size, min_size - 1, -2):
        font = ImageFont.truetype(FONT_BOLD, size)
        lines = wrap_text(draw, rendered, font, max_width)
        line_height = int(size * 1.17)
        height = len(lines) * line_height
        if height <= max_height and all(text_bbox(draw, line, font)[0] <= max_width for line in lines):
            best = (font, lines, line_height)
            break
    if not best:
        raise ValueError(f"quote does not fit: {quote[:80]}")
    return best


def draw_panel_one(draw: ImageDraw.ImageDraw, template: dict[str, Any], quote: str, author: str) -> dict[str, Any]:
    x, y, w, h = 64, 98, 952, 620
    quote_font, lines, line_height = fit_quote(draw, quote, w, 455, 42, 76)
    total_height = len(lines) * line_height
    text_y = y + max(0, (455 - total_height) // 2)
    for line in lines:
        draw.text((x, text_y), line, font=quote_font, fill=template["ink"])
        text_y += line_height
    author_font = ImageFont.truetype(FONT_BOLD, 43)
    author_text = f"— {author.upper()}"
    aw, _ = text_bbox(draw, author_text, author_font)
    draw.rounded_rectangle((x, y + 500, x + 96, y + 512), radius=6, fill=template["accent"])
    draw.text((WIDTH - 64 - aw, y + 512), author_text, font=author_font, fill=template["ink"])
    return {"fontSize": quote_font.size, "lines": len(lines), "template": template["id"]}


def draw_panel_two(draw: ImageDraw.ImageDraw, template: dict[str, Any], quote: str, author: str) -> dict[str, Any]:
    x, y, w, h = 72, 104, 936, 710
    draw.rounded_rectangle((x - 24, y - 24, x + w + 24, y + h - 20), radius=20, fill=template["paper"])
    quote_font, lines, line_height = fit_quote(draw, quote, w, 515, 40, 70)
    text_y = y + 34
    for line in lines:
        draw.text((x, text_y), line, font=quote_font, fill=template["ink"])
        text_y += line_height
    author_font = ImageFont.truetype(FONT_BOLD, 41)
    draw.rectangle((x, y + 610, x + 140, y + 622), fill=template["accent"])
    draw.text((x, y + 632), author.upper(), font=author_font, fill=template["ink"])
    return {"fontSize": quote_font.size, "lines": len(lines), "template": template["id"]}


def draw_panel_three(draw: ImageDraw.ImageDraw, template: dict[str, Any], quote: str, author: str) -> dict[str, Any]:
    x, y, w = 74, 84, 932
    quote_font, lines, line_height = fit_quote(draw, quote, w, 535, 40, 72)
    draw.rectangle((0, 0, WIDTH, 790), fill=template["paper"])
    draw.rectangle((0, 790, WIDTH, 806), fill=template["accent"])
    text_y = y
    for line in lines:
        draw.text((x, text_y), line, font=quote_font, fill=template["ink"])
        text_y += line_height
    author_font = ImageFont.truetype(FONT_BOLD, 42)
    author_text = f"{author.upper()}"
    aw, _ = text_bbox(draw, author_text, author_font)
    draw.text((WIDTH - 72 - aw, 682), author_text, font=author_font, fill=template["ink"])
    draw.line((WIDTH - 72 - aw - 128, 708, WIDTH - 72 - aw - 22, 708), fill=template["accent"], width=9)
    return {"fontSize": quote_font.size, "lines": len(lines), "template": template["id"]}


def render_card(item: dict[str, Any], portrait_path: Path, output_path: Path) -> dict[str, Any]:
    template = TEMPLATES[item["templateIndex"] % len(TEMPLATES)]
    base = Image.new("RGBA", (WIDTH, HEIGHT), template["paper"] + (255,))
    draw_noise(base, 3)

    photo_h = 1070 if item["templateIndex"] % 3 != 1 else 1160
    photo_y = HEIGHT - photo_h
    portrait = Image.open(portrait_path)
    portrait = fit_cover(portrait, (WIDTH, photo_h), 0.36)
    portrait = tint_photo(portrait, template["photo_filter"])
    base.alpha_composite(portrait.convert("RGBA"), (0, photo_y))

    gradient = Image.new("L", (WIDTH, photo_h), 0)
    gdraw = ImageDraw.Draw(gradient)
    for yy in range(photo_h):
        alpha = int(160 * (yy / photo_h) ** 1.9)
        gdraw.line((0, yy, WIDTH, yy), fill=alpha)
    shade = Image.new("RGBA", (WIDTH, photo_h), (0, 0, 0, 0))
    shade.putalpha(gradient)
    base.alpha_composite(shade, (0, photo_y))

    draw = ImageDraw.Draw(base)
    if item["templateIndex"] % 3 == 0:
        metrics = draw_panel_one(draw, template, item["quote"], item["author"])
    elif item["templateIndex"] % 3 == 1:
        metrics = draw_panel_two(draw, template, item["quote"], item["author"])
    else:
        metrics = draw_panel_three(draw, template, item["quote"], item["author"])

    badge_font = ImageFont.truetype(FONT_REGULAR, 27)
    badge = "GROSSE ZITATE"
    bw, bh = text_bbox(draw, badge, badge_font)
    draw.rounded_rectangle((64, HEIGHT - 110, 64 + bw + 36, HEIGHT - 62), radius=16, fill=(template["paper"][0], template["paper"][1], template["paper"][2], 215))
    draw.text((82, HEIGHT - 101), badge, font=badge_font, fill=template["ink"])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(output_path, quality=94)
    return metrics


def generate_music_loop(path: Path, variant: int, duration: float = 14.0) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    sample_rate = 44100
    chords = [
        [220.0, 277.18, 329.63, 440.0],
        [196.0, 246.94, 293.66, 392.0],
        [174.61, 220.0, 261.63, 349.23],
        [164.81, 207.65, 246.94, 329.63],
    ]
    rng = random.Random(variant * 7919)
    frames = int(sample_rate * duration)
    with wave.open(str(path), "w") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        for n in range(frames):
            t = n / sample_rate
            chord = chords[int(t // 3.5) % len(chords)]
            pad = 0.0
            for i, freq in enumerate(chord):
                phase = (variant + 1) * 0.11 * i
                pad += math.sin(2 * math.pi * freq * t + phase) * (0.13 / (i + 1))
            bell_freq = chord[(int(t * 2) + variant) % len(chord)] * 2
            bell_env = max(0.0, 1.0 - ((t * 2) % 1.0)) ** 5
            bell = math.sin(2 * math.pi * bell_freq * t) * 0.08 * bell_env
            slow = 0.55 + 0.45 * math.sin(2 * math.pi * t / 9.0 + variant)
            noise = (rng.random() - 0.5) * 0.006
            sample = (pad * slow + bell + noise) * 0.36
            fade = min(1.0, t / 1.2, (duration - t) / 1.2)
            value = int(max(-1.0, min(1.0, sample * fade)) * 32767)
            wav.writeframesraw(value.to_bytes(2, "little", signed=True) * 2)


def render_video(card_path: Path, music_path: Path, output_path: Path, duration: float, force: bool) -> None:
    if output_path.exists() and not force:
        return
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        f"{duration:.2f}",
        "-i",
        str(card_path),
        "-stream_loop",
        "-1",
        "-i",
        str(music_path),
        "-shortest",
        "-c:v",
        "libx264",
        "-tune",
        "stillimage",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    subprocess.run(cmd, check=True)


def title_for(quote: str, author: str) -> str:
    title = quote.replace("\n", " ")
    if len(title) > 68:
        title = title[:67].rstrip() + "…"
    return f"{title} — {author}"


def next_ids(count: int, start_id: int | None) -> list[int]:
    videos = load_json(VIDEOS_JSON, [])
    existing = []
    for item in videos:
        match = re.match(r"q(\d+)\.mp4$", item.get("file", ""))
        if match:
            existing.append(int(match.group(1)))
    first = start_id if start_id is not None else max(existing, default=0) + 1
    return list(range(first, first + count))


def make_contact_sheets(card_paths: list[Path], per_sheet: int = 30) -> list[Path]:
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    sheets: list[Path] = []
    thumb_w, thumb_h = 216, 384
    cols = 5
    for sheet_index, start in enumerate(range(0, len(card_paths), per_sheet), start=1):
        subset = card_paths[start : start + per_sheet]
        rows = math.ceil(len(subset) / cols)
        sheet = Image.new("RGB", (cols * thumb_w, rows * thumb_h), (18, 18, 18))
        for i, path in enumerate(subset):
            img = Image.open(path).convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
            x = (i % cols) * thumb_w
            y = (i // cols) * thumb_h
            sheet.paste(img, (x, y))
        out = CONTACT_DIR / f"quotes-de-contact-{sheet_index:02d}.jpg"
        sheet.save(out, quality=88)
        sheets.append(out)
    return sheets


def update_deck(items: list[dict[str, Any]]) -> None:
    videos = load_json(VIDEOS_JSON, [])
    by_file = {item["file"]: item for item in videos}
    for item in items:
        by_file[item["file"]] = {
            "file": item["file"],
            "title": title_for(item["quote"], item["author"]),
            "text": f"„{item['quote']}“\n— {item['author']}",
            "author": item["author"],
        }
    merged = list(by_file.values())
    merged.sort(key=lambda x: int(re.match(r"q(\d+)\.mp4$", x["file"]).group(1)) if re.match(r"q(\d+)\.mp4$", x["file"]) else 999999)
    write_json(VIDEOS_JSON, merged)
    ids = [int(re.match(r"q(\d+)\.mp4$", item["file"]).group(1)) for item in merged if re.match(r"q(\d+)\.mp4$", item["file"])]
    write_json(
        INDEX_JSON,
        {
            "total": len(merged),
            "packs": 1,
            "packSize": len(merged),
            "range": [min(ids), max(ids)],
        },
    )


def merge_sources(new_items: list[dict[str, Any]], portrait_sources: dict[str, dict[str, Any]]) -> None:
    existing = load_json(SOURCES_JSON, {"items": []})
    by_file = {item["file"]: item for item in existing.get("items", [])}
    for item in new_items:
        by_file[item["file"]] = item
    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "quoteSource": {
            "name": "German Wikiquote",
            "license": "CC BY-SA",
            "note": "Each item records the source Wikiquote page and source bullet used for attribution review.",
        },
        "portraitSource": {
            "name": "Wikimedia Commons via Wikidata P18",
            "note": "Per-author Commons file, license and artist metadata are stored under portraitSources.",
        },
        "musicSource": {
            "name": "Procedural local synthesis",
            "license": "No external audio source",
            "generator": "scripts/build-quotes-de-cards.py",
        },
        "portraitSources": portrait_sources,
        "items": [by_file[k] for k in sorted(by_file)],
    }
    write_json(SOURCES_JSON, data)


def verify_outputs(items: list[dict[str, Any]], metrics: list[dict[str, Any]]) -> None:
    missing = [item["file"] for item in items if not (ASSET_DIR / item["file"]).exists()]
    if missing:
        raise RuntimeError(f"missing videos: {missing[:10]}")
    too_small = [m for m in metrics if m["fontSize"] < 40]
    if too_small:
        raise RuntimeError(f"text fit too small: {too_small[:5]}")
    risk = [(item["file"], blocked_reason(item["quote"])) for item in items if blocked_reason(item["quote"])]
    risk = [r for r in risk if r[1]]
    if risk:
        raise RuntimeError(f"policy blocklist hits: {risk[:10]}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=300)
    parser.add_argument("--start-id", type=int, default=None)
    parser.add_argument("--fetch-wait", type=float, default=3.5)
    parser.add_argument("--max-per-author", type=int, default=12)
    parser.add_argument("--hard-max-per-author", type=int, default=24)
    parser.add_argument("--min-authors", type=int, default=20)
    parser.add_argument("--extra-candidates", type=int, default=40)
    parser.add_argument("--authors-json", type=Path, default=AUTHORS_JSON)
    parser.add_argument("--allow-attribution-portraits", action="store_true")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-video", action="store_true")
    args = parser.parse_args()

    for path in [DECK_DIR, ASSET_DIR, TEMP_CARD_DIR, MUSIC_DIR, PORTRAIT_DIR]:
        path.mkdir(parents=True, exist_ok=True)

    args.authors = load_authors(args.authors_json)
    if args.authors_json.exists():
        print(f"loaded {len(args.authors)} authors from {display_path(args.authors_json)}")
    else:
        print(f"loaded {len(args.authors)} built-in authors; {display_path(args.authors_json)} not found")

    requested_count = args.count
    candidate_args = copy.copy(args)
    candidate_args.count = args.count + max(0, args.extra_candidates)
    candidate_args.replace_count = requested_count
    candidate_args.allow_short_pool = True
    candidate_args.min_needed = requested_count
    selected_pool = collect_candidates(candidate_args)
    portrait_sources = prepare_portraits(args, {item.author for item in selected_pool})
    selected = [item for item in selected_pool if item.author in portrait_sources]
    if len(selected) < args.count:
        raise RuntimeError(f"only {len(selected)} selected quotes have portraits; need {args.count}")
    selected = selected[:requested_count]
    selected_author_count = len({item.author for item in selected})
    if selected_author_count < args.min_authors:
        raise RuntimeError(f"only {selected_author_count} selected authors after portrait filtering; need {args.min_authors}")

    ids = next_ids(len(selected), args.start_id)
    rendered_items: list[dict[str, Any]] = []
    metrics: list[dict[str, Any]] = []
    card_paths: list[Path] = []

    for index, (numeric_id, candidate) in enumerate(zip(ids, selected), start=1):
        qid = f"q{numeric_id:03d}"
        filename = f"{qid}.mp4"
        template_index = (index - 1) % (len(TEMPLATES) * 3)
        item = {
            "id": qid,
            "file": filename,
            "author": candidate.author,
            "quote": candidate.quote,
            "wikiquoteTitle": candidate.wikiquote,
            "wikiquoteUrl": f"https://de.wikiquote.org/wiki/{requests.utils.quote(candidate.wikiquote.replace(' ', '_'))}",
            "wikiquoteSection": candidate.section,
            "wikiquoteSourceLine": candidate.source_line,
            "template": TEMPLATES[template_index % len(TEMPLATES)]["id"],
            "templateIndex": template_index,
            "music": f"quote-card-bg-{(index - 1) % 12 + 1:02d}.wav",
            "policyReview": "auto-blocklist-pass; manual rule set from data/quotes-de/CONTENT-POLICY.md",
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        portrait_meta = portrait_sources[candidate.author]
        portrait_path = ROOT / portrait_meta["localPath"]
        card_path = TEMP_CARD_DIR / f"{qid}.jpg"
        metric = render_card(item, portrait_path, card_path)
        metric["file"] = filename
        metric["quoteChars"] = len(candidate.quote)
        metrics.append(metric)
        card_paths.append(card_path)

        music_path = MUSIC_DIR / item["music"]
        generate_music_loop(music_path, (index - 1) % 12 + 1)
        duration = max(6.5, min(10.5, 4.8 + len(candidate.quote) / 48))
        item["duration"] = round(duration, 2)
        if not args.no_video:
            render_video(card_path, music_path, ASSET_DIR / filename, duration, args.force)
        rendered_items.append(item)
        if index % 25 == 0:
            print(f"rendered {index}/{len(selected)}")

    write_json(DECK_DIR / "layout-report.json", {"items": metrics})
    sheets = make_contact_sheets(card_paths)
    if not args.no_video:
        update_deck(rendered_items)
        merge_sources(rendered_items, portrait_sources)
        verify_outputs(rendered_items, metrics)
    print(
        json.dumps(
            {
                "rendered": len(rendered_items),
                "first": rendered_items[0]["file"],
                "last": rendered_items[-1]["file"],
                "authors": len({item["author"] for item in rendered_items}),
                "contactSheets": [str(path.relative_to(ROOT)) for path in sheets],
                "minFont": min(m["fontSize"] for m in metrics),
                "maxLines": max(m["lines"] for m in metrics),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

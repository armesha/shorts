#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PACK_ID = "prayers-de"
PACK_TITLE = "Gebete"
OUTPUT_PREFIX = "gebet_de"
WIDTH = 1080
HEIGHT = 1920
DEFAULT_COUNT = 1000
TEMPLATE_COUNT = 25
CHILD_SHARE = 0.25
DEFAULT_CHILD_COUNT = 250
CARD_SECONDS = 10

PACK_DIR = ROOT / "data" / PACK_ID
BACKGROUND_DIR = PACK_DIR / "backgrounds"
OLD_CARD_DIR = PACK_DIR / "cards"
VIDEOS_JSON = PACK_DIR / "videos.json"
INDEX_JSON = PACK_DIR / "index.json"
SOURCES_JSON = PACK_DIR / "sources.json"
LAYOUT_REPORT = PACK_DIR / "layout-report.json"

FACT_DIR = ROOT / "assets" / "fact-videos" / PACK_ID
ADMIN_DIR = ROOT / "data" / "output" / "admin-demos"
MANIFEST_JSON = ADMIN_DIR / "manifest.json"
CONTACT_DIR = ROOT / "tmp" / PACK_ID
FFMPEG = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg"

FONT_SERIF_BOLD = "/usr/share/fonts/truetype/noto/NotoSerifDisplay-Bold.ttf"
FONT_SERIF = "/usr/share/fonts/truetype/noto/NotoSerifDisplay-Regular.ttf"
FONT_SANS_BOLD = "/usr/share/fonts/truetype/noto/NotoSansDisplay-Bold.ttf"
FONT_SANS = "/usr/share/fonts/truetype/noto/NotoSansDisplay-Regular.ttf"


@dataclass(frozen=True)
class Subject:
    slug: str
    label: str
    acc: str
    dat: str
    pron_acc: str
    heart: str
    steps: str
    faith: str
    title_label: str


@dataclass(frozen=True)
class GeneralTheme:
    slug: str
    headings: tuple[str, ...]
    openings: tuple[str, ...]
    protections: tuple[str, ...]
    blessings: tuple[str, ...]
    closings: tuple[str, ...]


@dataclass(frozen=True)
class Card:
    id: str
    title: str
    heading: str
    body: list[str]
    cta: str
    subject_slug: str
    template_id: int


CHILD_SUBJECTS = [
    Subject("kind", "mein Kind", "mein Kind", "ihm", "es", "sein Herz", "seine Schritte", "seinen Glauben", "mein Kind"),
    Subject("tochter", "meine Tochter", "meine Tochter", "ihr", "sie", "ihr Herz", "ihre Schritte", "ihren Glauben", "meine Tochter"),
    Subject("sohn", "mein Sohn", "meinen Sohn", "ihm", "ihn", "sein Herz", "seine Schritte", "seinen Glauben", "meinen Sohn"),
    Subject("kinder", "meine Kinder", "meine Kinder", "ihnen", "sie", "ihre Herzen", "ihre Schritte", "ihren Glauben", "meine Kinder"),
    Subject("enkelkind", "mein Enkelkind", "mein Enkelkind", "ihm", "es", "sein Herz", "seine Schritte", "seinen Glauben", "mein Enkelkind"),
]

CHILD_HEADING_PATTERNS = [
    "Gebet für {title}",
    "Segen für {title}",
    "Schutz für {title}",
    "Herr, behüte {title}",
    "Für {title} bete ich",
    "Gottes Licht für {title}",
    "Ein stilles Gebet",
    "Segne {title}",
    "Bewahre {title}",
    "Frieden für {title}",
    "Gnade für {title}",
    "Himmlischer Schutz",
    "Gebet am Morgen",
    "Gebet am Abend",
    "Segen auf allen Wegen",
    "Ein Herz voller Glauben",
    "Unter Gottes Hand",
    "Liebe, Schutz und Frieden",
    "Gott ist nah",
    "Ein Segen für heute",
    "Stärke für {title}",
    "Hoffnung für {title}",
    "Engel auf dem Weg",
    "Geborgen in Gottes Liebe",
    "Amen für {title}",
]

GENERAL_THEMES = [
    GeneralTheme(
        "morgen",
        ("Gebet am Morgen", "Segen für diesen Tag", "Herr, begleite meinen Tag", "Licht für den neuen Morgen"),
        (
            "Herr, ich lege diesen neuen Tag in Deine Hände.",
            "Guter Gott, öffne mir heute einen ruhigen und klaren Weg.",
            "Vater im Himmel, sei bei mir vom ersten Schritt an.",
            "Herr Jesus, erfülle diesen Morgen mit Deinem Frieden.",
        ),
        (
            "Bewahre meine Gedanken vor Angst und unnötiger Sorge.",
            "Halte harte Worte, falsche Eile und dunkle Wege fern.",
            "Lass mich nicht in Unruhe handeln, sondern in Liebe.",
            "Schütze mich vor allem, was Frieden und Vertrauen raubt.",
        ),
        (
            "Gib mir Kraft, Geduld und ein waches Herz.",
            "Schenke mir Augen für das Gute und Hände, die helfen.",
            "Lass kleine Dinge heute zu einem Segen werden.",
            "Fülle mein Herz mit Dankbarkeit, Mut und Hoffnung.",
        ),
        (
            "Führe mich Schritt für Schritt und bleibe nahe.",
            "Lass Dein Licht stärker sein als jede Sorge.",
            "Segne diesen Tag und alles, was vor mir liegt.",
            "Amen, Herr, begleite mich heute.",
        ),
    ),
    GeneralTheme(
        "abend",
        ("Gebet am Abend", "Segen für die Nacht", "Ruhe unter Gottes Hand", "Abendgebet"),
        (
            "Herr, ich bringe Dir diesen Tag mit allem, was war.",
            "Guter Gott, lege Deine Ruhe über diesen Abend.",
            "Vater, nimm meine Müdigkeit und halte mein Herz fest.",
            "Herr Jesus, bleibe bei mir, wenn es still wird.",
        ),
        (
            "Nimm schwere Gedanken, Streit und alte Sorgen von mir.",
            "Bewahre mein Herz vor Unruhe in der Nacht.",
            "Lass nichts Dunkles stärker sein als Deine Nähe.",
            "Schließe, was wehgetan hat, in Deine Barmherzigkeit ein.",
        ),
        (
            "Schenke Frieden, Vergebung und einen ruhigen Schlaf.",
            "Fülle die Nacht mit Schutz, Trost und neuer Kraft.",
            "Lass Dankbarkeit bleiben, auch wenn der Tag schwer war.",
            "Gib mir ein Herz, das loslassen und vertrauen kann.",
        ),
        (
            "Wache über mich und über alle, die ich liebe.",
            "Morgen wecke mich mit Hoffnung und Licht.",
            "In Deine Hände lege ich diese Nacht.",
            "Amen, Herr, gib mir Frieden.",
        ),
    ),
    GeneralTheme(
        "schutz",
        ("Gebet um Schutz", "Himmlischer Schutz", "Unter Gottes Hand", "Bewahrt auf allen Wegen"),
        (
            "Allmächtiger Gott, stelle Deinen Schutz um mein Leben.",
            "Herr, gehe vor mir her und bleibe an meiner Seite.",
            "Vater im Himmel, halte Deine Hand über meine Wege.",
            "Guter Gott, ich suche Zuflucht in Deiner Nähe.",
        ),
        (
            "Halte Gefahr, falsche Stimmen und böse Absichten fern.",
            "Bewahre mich vor Wegen, die Herz und Seele verletzen.",
            "Lass Angst, Neid und Bitterkeit keinen Raum gewinnen.",
            "Schließe Türen, die schaden, und öffne Türen, die heilen.",
        ),
        (
            "Gib mir Weisheit, klare Augen und ein mutiges Herz.",
            "Schenke Schutzengel auf jedem Schritt.",
            "Stärke mein Vertrauen, wenn ich nicht alles sehen kann.",
            "Gib Frieden, der tiefer reicht als jede Furcht.",
        ),
        (
            "Bewahre mich heute, morgen und alle Tage.",
            "Lass Dein Licht meinen Weg hell machen.",
            "Ich gehe weiter unter Deiner schützenden Hand.",
            "Amen, Herr, Du bist meine Zuflucht.",
        ),
    ),
    GeneralTheme(
        "frieden",
        ("Gebet um Frieden", "Frieden für mein Herz", "Ruhe in Gottes Nähe", "Herr, schenke Frieden"),
        (
            "Herr, bringe Frieden in mein Herz und in meine Gedanken.",
            "Gott der Liebe, nimm die Unruhe aus meiner Seele.",
            "Vater, wo Streit laut wird, lass Deine Sanftheit wachsen.",
            "Herr Jesus, lehre mich Frieden zu suchen und Frieden zu geben.",
        ),
        (
            "Bewahre mich vor Worten, die verletzen und trennen.",
            "Nimm Bitterkeit, Stolz und alte Lasten von mir.",
            "Lass Angst nicht entscheiden, wo Liebe sprechen soll.",
            "Halte mein Herz fern von Neid, Druck und falscher Härte.",
        ),
        (
            "Schenke Geduld, Verständnis und einen klaren Blick.",
            "Fülle mich mit Ruhe, die andere Menschen spüren können.",
            "Gib mir Mut zur Vergebung und Kraft zum Neubeginn.",
            "Lass Deine Güte tiefer wirken als schwere Tage.",
        ),
        (
            "Mache mich zu einem Werkzeug Deines Friedens.",
            "Segne mein Zuhause mit stiller Hoffnung.",
            "Lass Frieden bleiben, auch wenn der Tag laut wird.",
            "Amen, Herr, gib Frieden.",
        ),
    ),
    GeneralTheme(
        "heilung",
        ("Gebet um Heilung", "Kraft für die Kranken", "Segen für die Gesundheit", "Trost in schwerer Zeit"),
        (
            "Barmherziger Vater, sei nahe bei allen, die krank sind.",
            "Herr, lege Trost und Kraft in müde Herzen.",
            "Guter Gott, halte die Schwachen fest in Deiner Liebe.",
            "Herr Jesus, schenke Hoffnung, wo Schmerzen schwer werden.",
        ),
        (
            "Nimm Angst, Einsamkeit und verzweifelte Gedanken fort.",
            "Bewahre vor Mutlosigkeit und vor Worten ohne Liebe.",
            "Lass niemanden allein bleiben, der heute Trost braucht.",
            "Halte die Seele ruhig, wenn der Körper müde ist.",
        ),
        (
            "Schenke gute Hilfe, Geduld und neue Kraft für jeden Tag.",
            "Fülle die Zimmer mit Frieden und die Herzen mit Hoffnung.",
            "Gib den Helfenden Weisheit und den Kranken Zuversicht.",
            "Lass kleine Zeichen der Besserung groß im Herzen werden.",
        ),
        (
            "In Deine Hände lege ich Heilung, Zeit und Hoffnung.",
            "Bleibe nahe und trage, was Menschen allein nicht tragen können.",
            "Lass Dein Licht stärker sein als Angst und Schmerz.",
            "Amen, Herr, schenke Kraft.",
        ),
    ),
    GeneralTheme(
        "familie",
        ("Gebet für unsere Familie", "Segen für die Familie", "Herr, behüte unser Zuhause", "Liebe in unserer Familie"),
        (
            "Herr, segne unsere Familie und alle, die zu uns gehören.",
            "Gott der Liebe, bringe Wärme in unser Zuhause.",
            "Vater im Himmel, halte unsere Familie in Deiner Hand.",
            "Herr Jesus, lehre uns einander mit Geduld zu begegnen.",
        ),
        (
            "Bewahre uns vor Streit, Stolz und kalten Worten.",
            "Lass alte Verletzungen nicht über Liebe und Wahrheit siegen.",
            "Halte Neid, Ungeduld und falsche Härte fern.",
            "Schütze unser Miteinander vor allem, was Vertrauen zerstört.",
        ),
        (
            "Schenke offene Herzen, ehrliche Gespräche und Frieden.",
            "Gib uns Kraft, zu vergeben und neu anzufangen.",
            "Fülle unser Haus mit Dankbarkeit, Hoffnung und Segen.",
            "Lass Liebe wachsen, auch wenn der Alltag schwer wird.",
        ),
        (
            "Bleibe in unserer Mitte, heute und alle Tage.",
            "Segne jeden Tisch, jedes Gespräch und jeden neuen Anfang.",
            "Lass unser Zuhause ein Ort des Friedens sein.",
            "Amen, Herr, segne unsere Familie.",
        ),
    ),
    GeneralTheme(
        "haus",
        ("Segen für dieses Haus", "Gebet für mein Zuhause", "Herr, segne dieses Haus", "Frieden für dieses Zuhause"),
        (
            "Herr, segne dieses Haus und alle, die darin wohnen.",
            "Guter Gott, lege Deinen Frieden über jedes Zimmer.",
            "Vater im Himmel, wache über dieses Zuhause.",
            "Herr Jesus, fülle diesen Ort mit Licht und Wärme.",
        ),
        (
            "Halte Streit, Neid und harte Worte fern.",
            "Lass Angst, Kälte und schwere Gedanken keinen Raum finden.",
            "Bewahre die Tür vor allem, was Frieden raubt.",
            "Schütze diesen Ort vor Unruhe und falschen Wegen.",
        ),
        (
            "Schenke Freude beim Heimkommen und Frieden beim Ausruhen.",
            "Fülle die Räume mit Liebe, Geduld und Dankbarkeit.",
            "Lass Menschen hier Trost, Schutz und neue Kraft finden.",
            "Gib jedem Gespräch Wahrheit und jedem Herzen Milde.",
        ),
        (
            "Mache dieses Zuhause zu einem Ort des Segens.",
            "Lass Deine Hand über diesem Haus bleiben.",
            "Segne den Eingang, den Abschied und jede Rückkehr.",
            "Amen, Herr, segne dieses Haus.",
        ),
    ),
    GeneralTheme(
        "arbeit",
        ("Gebet für die Arbeit", "Segen für meine Arbeit", "Kraft für den Alltag", "Herr, führe meine Hände"),
        (
            "Herr, ich lege meine Arbeit und meine Mühe vor Dich.",
            "Guter Gott, begleite mich in allem, was heute zu tun ist.",
            "Vater, gib meinen Händen Kraft und meinem Geist Klarheit.",
            "Herr Jesus, bleibe bei mir im Alltag und in jeder Aufgabe.",
        ),
        (
            "Bewahre mich vor Überforderung, Neid und falschem Druck.",
            "Halte Ungeduld, harte Worte und müde Gedanken fern.",
            "Lass Erfolg mein Herz nicht stolz und Fehler nicht bitter machen.",
            "Schütze mich vor Entscheidungen ohne Wahrheit und Liebe.",
        ),
        (
            "Schenke Konzentration, Ausdauer und einen ehrlichen Weg.",
            "Gib Freude an guter Arbeit und Frieden nach getaner Mühe.",
            "Lass meine Arbeit Nutzen bringen und niemandem schaden.",
            "Fülle den Tag mit Weisheit, Respekt und Geduld.",
        ),
        (
            "Segne, was ich beginne, und ordne, was schwer ist.",
            "Führe mich auf geraden Wegen durch diesen Alltag.",
            "Lass meine Mühe unter Deinem Segen stehen.",
            "Amen, Herr, segne meine Arbeit.",
        ),
    ),
    GeneralTheme(
        "entscheidung",
        ("Gebet um Klarheit", "Segen für eine Entscheidung", "Herr, zeige den Weg", "Licht für meine Schritte"),
        (
            "Herr, ich stehe vor einer Entscheidung und suche Dein Licht.",
            "Guter Gott, ordne meine Gedanken und beruhige mein Herz.",
            "Vater im Himmel, zeige mir den Weg, der Frieden bringt.",
            "Herr Jesus, führe mich, wenn viele Stimmen durcheinanderreden.",
        ),
        (
            "Bewahre mich vor Angst, Eile und falschem Stolz.",
            "Lass mich nicht nur dem leichten Weg folgen.",
            "Halte Täuschung, Druck und dunkle Absichten fern.",
            "Nimm Verwirrung fort und gib mir einen klaren Blick.",
        ),
        (
            "Schenke Weisheit, Mut und Geduld zum richtigen Schritt.",
            "Gib mir Menschen, die ehrlich raten und in Liebe sprechen.",
            "Lass Wahrheit, Frieden und Verantwortung zusammenfinden.",
            "Stärke mein Vertrauen, wenn ich noch nicht alles sehe.",
        ),
        (
            "Öffne die Tür, die gut ist, und schließe, was schadet.",
            "Führe mich nicht nach Angst, sondern nach Deinem Frieden.",
            "Segne meinen nächsten Schritt.",
            "Amen, Herr, zeige mir den Weg.",
        ),
    ),
    GeneralTheme(
        "dank",
        ("Dankgebet", "Danke, Herr", "Ein Herz voller Dank", "Segen in kleinen Dingen"),
        (
            "Herr, ich danke Dir für alles Gute, das ich oft übersehe.",
            "Guter Gott, öffne mein Herz für Dankbarkeit.",
            "Vater im Himmel, ich sehe Deine Güte in kleinen Dingen.",
            "Herr Jesus, lehre mich, Segen nicht selbstverständlich zu nennen.",
        ),
        (
            "Bewahre mein Herz vor Undank, Vergleich und Bitterkeit.",
            "Lass Sorgen nicht verdecken, was Du mir schon geschenkt hast.",
            "Halte Neid fern und schenke mir einen freien Blick.",
            "Nimm Klagen, die mein Herz hart machen, von mir.",
        ),
        (
            "Schenke Freude über Brot, Frieden, Menschen und neue Chancen.",
            "Fülle meinen Tag mit stiller Dankbarkeit.",
            "Lass mein Danke andere trösten und ermutigen.",
            "Gib mir ein Herz, das geben kann, weil es empfangen hat.",
        ),
        (
            "Alles Gute lege ich zurück in Deine Hände.",
            "Segne, was ich habe, und lehre mich zu teilen.",
            "Lass Dankbarkeit tiefer werden als Sorge.",
            "Amen, Herr, ich danke Dir.",
        ),
    ),
    GeneralTheme(
        "liebe",
        ("Gebet für meine Liebsten", "Segen für geliebte Menschen", "Herr, behüte meine Liebsten", "Liebe, Schutz und Frieden"),
        (
            "Herr, ich vertraue Dir alle an, die ich liebe.",
            "Gott der Liebe, halte meine Liebsten in Deiner Nähe.",
            "Vater im Himmel, wache über die Menschen, die mir wichtig sind.",
            "Herr Jesus, segne die Wege meiner Liebsten.",
        ),
        (
            "Bewahre sie vor Gefahr, falschen Worten und einsamen Stunden.",
            "Halte Angst, Streit und harte Gedanken fern.",
            "Lass niemanden fallen, der heute Halt braucht.",
            "Schütze ihre Herzen vor Kälte und Mutlosigkeit.",
        ),
        (
            "Schenke ihnen Frieden, Gesundheit, gute Menschen und Hoffnung.",
            "Gib Kraft für schwere Tage und Freude für helle Stunden.",
            "Lass Deine Liebe spürbar werden, auch aus der Ferne.",
            "Fülle ihre Häuser mit Segen und ihre Herzen mit Mut.",
        ),
        (
            "Bleibe bei ihnen, wenn ich nicht bei ihnen sein kann.",
            "Lege Deine Hand über jeden ihrer Schritte.",
            "Segne sie heute und alle Tage.",
            "Amen, Herr, behüte meine Liebsten.",
        ),
    ),
    GeneralTheme(
        "einsam",
        ("Gebet für Einsame", "Trost für ein müdes Herz", "Gott ist nah", "Nicht allein"),
        (
            "Herr, sei nahe bei allen, die sich einsam fühlen.",
            "Guter Gott, halte müde Herzen in Deiner Liebe.",
            "Vater, finde die Menschen, die heute niemand sieht.",
            "Herr Jesus, komm leise zu denen, die Trost brauchen.",
        ),
        (
            "Nimm das Gefühl fort, vergessen und wertlos zu sein.",
            "Bewahre vor dunklen Gedanken und stiller Verzweiflung.",
            "Lass Einsamkeit nicht das letzte Wort behalten.",
            "Halte Kälte, Scham und Hoffnungslosigkeit fern.",
        ),
        (
            "Schenke Begegnungen, die wärmen, und Worte, die aufrichten.",
            "Gib Mut, Hilfe anzunehmen und wieder zu vertrauen.",
            "Fülle die Stille mit Deiner Nähe und Deinem Frieden.",
            "Lass ein kleines Licht heute groß genug sein.",
        ),
        (
            "Zeige: Kein Herz ist vor Dir verborgen.",
            "Bleibe nah, bis neue Hoffnung wächst.",
            "Segne alle, die heute Trost suchen.",
            "Amen, Herr, Du bist nah.",
        ),
    ),
    GeneralTheme(
        "trauer",
        ("Gebet in Trauer", "Trost in schwerer Zeit", "Licht in der Trauer", "Herr, halte mein Herz"),
        (
            "Herr, halte mein Herz, wenn Trauer schwer auf mir liegt.",
            "Guter Gott, sei nahe, wenn Worte nicht mehr reichen.",
            "Vater im Himmel, trage, was ich heute nicht tragen kann.",
            "Herr Jesus, komm mit Trost in meine stillen Tränen.",
        ),
        (
            "Nimm Bitterkeit, Schuld und dunkle Gedanken von mir.",
            "Lass Schmerz nicht alles Licht in meinem Herzen löschen.",
            "Bewahre mich vor Einsamkeit, die keine Hilfe zulässt.",
            "Halte schwere Erinnerungen in Deiner Barmherzigkeit.",
        ),
        (
            "Schenke Atem, Geduld und kleine Zeichen der Hoffnung.",
            "Gib Menschen, die schweigen können und trotzdem nahe sind.",
            "Lass Liebe bleiben, auch wenn Abschied weh tut.",
            "Fülle leere Stunden mit Trost und stiller Kraft.",
        ),
        (
            "In Deine Hände lege ich Verlust, Liebe und Erinnerung.",
            "Bleibe bei mir, bis mein Herz wieder freier atmet.",
            "Lass Dein Licht durch die Trauer scheinen.",
            "Amen, Herr, tröste mich.",
        ),
    ),
    GeneralTheme(
        "reise",
        ("Gebet für die Reise", "Segen auf dem Weg", "Behütet unterwegs", "Herr, begleite diesen Weg"),
        (
            "Herr, begleite mich auf diesem Weg und bei jeder Reise.",
            "Guter Gott, stelle Deinen Schutz vor und hinter mich.",
            "Vater im Himmel, segne jeden Kilometer und jede Ankunft.",
            "Herr Jesus, bleibe bei mir unterwegs.",
        ),
        (
            "Bewahre vor Gefahr, Unachtsamkeit und falschen Entscheidungen.",
            "Halte Unruhe, Eile und Angst fern.",
            "Schütze alle, die unterwegs sind, vor Schaden.",
            "Lass jeden Schritt unter Deinem Frieden stehen.",
        ),
        (
            "Schenke klare Sinne, Geduld und sichere Wege.",
            "Gib Hilfe, wenn etwas anders kommt als geplant.",
            "Lass Begegnungen freundlich und die Rückkehr gesegnet sein.",
            "Fülle den Weg mit Ruhe, Schutz und Dankbarkeit.",
        ),
        (
            "Führe mich sicher hin und wieder zurück.",
            "Segne den Weg, das Ziel und die Heimkehr.",
            "Deine Hand bleibe über allen Reisenden.",
            "Amen, Herr, begleite diesen Weg.",
        ),
    ),
    GeneralTheme(
        "mut",
        ("Gebet um Mut", "Kraft für heute", "Stärke mein Herz", "Herr, gib mir Kraft"),
        (
            "Herr, gib mir Mut für das, was heute vor mir liegt.",
            "Guter Gott, stärke mein Herz in dieser schweren Stunde.",
            "Vater, wenn ich schwach bin, halte mich fest.",
            "Herr Jesus, richte meinen Blick wieder auf Hoffnung.",
        ),
        (
            "Bewahre mich vor Angst, die mich klein macht.",
            "Nimm Zweifel, Scham und müde Gedanken von mir.",
            "Lass Rückschläge nicht stärker sein als Deine Gnade.",
            "Halte mich fern von Stimmen, die Hoffnung zerstören.",
        ),
        (
            "Schenke Kraft für den nächsten Schritt, nicht für alle Sorgen auf einmal.",
            "Gib mir Ausdauer, Wahrheit und ein ruhiges Herz.",
            "Lass mich aufstehen, auch wenn der Tag schwer beginnt.",
            "Fülle mich mit Vertrauen, das nicht sofort aufgibt.",
        ),
        (
            "Ich gehe weiter, weil Du mit mir gehst.",
            "Segne meinen Mut und ordne meinen Weg.",
            "Lass Deine Kraft in meiner Schwäche sichtbar werden.",
            "Amen, Herr, gib mir Kraft.",
        ),
    ),
]

OPENINGS = [
    "Herr, lege Deine schützende Hand über {acc}.",
    "Vater im Himmel, ich vertraue Dir {acc} an.",
    "Guter Gott, sei heute nahe bei {dat}.",
    "Herr Jesus, begleite {acc} durch diesen Tag.",
    "Allmächtiger Gott, schenke {dat} Frieden und Licht.",
    "Barmherziger Vater, halte {acc} fest in Deiner Liebe.",
    "Herr, wo meine Augen nicht reichen, wache Du über {acc}.",
    "Gott der Liebe, öffne {dat} einen sicheren Weg.",
    "Herr, erfülle {heart} mit Ruhe und Vertrauen.",
    "Himmlischer Vater, lass {acc} Deine Nähe spüren.",
    "Herr, geh vor {dat} her und bleibe ganz nah.",
    "Gott, schenke {dat} heute einen hellen Gedanken.",
    "Herr, nimm {acc} unter Deinen Schutz.",
    "Vater, segne {steps} und bewahre jeden Weg.",
    "Herr, stelle gute Menschen auf diesen Weg.",
    "Gott, lass Deine Güte über {acc} leuchten.",
    "Herr, gib {dat} ein ruhiges Herz in unruhigen Zeiten.",
    "Vater, lass {acc} nicht allein, wenn der Tag schwer wird.",
    "Herr, umhülle {acc} mit Frieden, Mut und Hoffnung.",
    "Gott, höre mein stilles Gebet für {acc}.",
]

PROTECTIONS = [
    "Bewahre {heart} vor Angst, Neid und falschen Wegen.",
    "Halte Unglück, böse Gedanken und harte Worte fern.",
    "Schütze {acc} vor Menschen, die Frieden rauben.",
    "Lass keinen Schatten stärker sein als Dein Licht.",
    "Bewahre {steps}, wenn Entscheidungen schwer werden.",
    "Nimm Sorge, Druck und Zweifel von {heart}.",
    "Schließe Türen, die schaden, und öffne Türen, die heilen.",
    "Halte Gefahr fern und schenke einen klaren Blick.",
    "Bewahre {heart} vor Kälte und die Worte vor Härte.",
    "Lass {acc} nicht in falsche Stimmen vertrauen.",
    "Schütze {acc} in der Schule, auf der Straße und zu Hause.",
    "Gib Schutz vor Streit, Einsamkeit und Bitterkeit.",
    "Bewahre {acc} vor Wegen, die das Herz dunkel machen.",
    "Lass Dein Licht stärker sein als jede Sorge.",
    "Halte {acc} fern von allem, was Seele und Hoffnung verletzt.",
    "Schenke Schutz in der Nacht und Kraft am Morgen.",
    "Nimm Unruhe aus {heart} und lege Frieden hinein.",
    "Bewahre {acc} vor Stolz, Angst und falschem Mut.",
    "Lass {acc} sicher bleiben, auch wenn ich nicht dabei bin.",
    "Schütze {acc} vor Worten, die klein machen.",
]

BLESSINGS = [
    "Gib Weisheit, Mut und ein freundliches Herz.",
    "Stärke {faith} und lass die Hoffnung wachsen.",
    "Schenke Geduld, Freude und Menschen mit ehrlichen Herzen.",
    "Fülle {heart} mit Liebe, Dankbarkeit und Vertrauen.",
    "Gib Kraft, nach einem Fehler wieder aufzustehen.",
    "Lass {acc} das Gute erkennen und das Richtige wählen.",
    "Schenke helle Gedanken, gute Freunde und ruhige Nächte.",
    "Lass Freude in {heart} wohnen und Frieden im Zuhause.",
    "Gib offene Augen für Segen und offene Hände für Hilfe.",
    "Stärke den Mut, Nein zum Bösen und Ja zum Guten zu sagen.",
    "Lass aus kleinen Sorgen große Hoffnung werden.",
    "Schenke ein Lächeln, das andere tröstet.",
    "Gib Klarheit, wenn viele Stimmen durcheinanderreden.",
    "Lass {acc} spüren, dass Liebe stärker ist als Furcht.",
    "Schenke Schutzengel auf jedem Schritt.",
    "Gib ein Herz, das vergibt, aber nicht zerbricht.",
    "Lass {acc} in Frieden wachsen und in Liebe handeln.",
    "Schenke Gnade für heute und Hoffnung für morgen.",
    "Gib ruhige Worte, wenn der Tag laut wird.",
    "Lass {acc} jeden Tag ein kleines Wunder sehen.",
]

CLOSINGS = [
    "Führe {acc} auf geraden Wegen und halte {pron} in Deiner Liebe.",
    "Bleibe bei {dat}, wenn Freude kommt und wenn Tränen fallen.",
    "Lass {dat} niemals vergessen: Du bist nah.",
    "Segne das Zuhause, die Gedanken und jeden neuen Anfang.",
    "Gib Frieden, der tiefer ist als jede Sorge.",
    "Lass Deine Hand über {acc} bleiben, heute und alle Tage.",
    "Schenke einen Weg, auf dem Liebe, Wahrheit und Mut zusammengehen.",
    "Bewahre {acc} im Schlaf und wecke {pron} mit neuer Kraft.",
    "Lass {acc} ein Segen sein und Segen empfangen.",
    "Führe {acc} Schritt für Schritt in Deinen Frieden.",
    "Wenn ich loslassen muss, halte Du {acc} fest.",
    "Lege Deine Gnade über diesen Tag.",
    "Schenke Hoffnung, die nicht müde wird.",
    "Lass Dein Licht den Weg zeigen, auch im Dunkeln.",
    "Bewahre {acc} unter Deinem Himmel.",
    "Mach {heart} stark, weich und voller Vertrauen.",
    "Halte {acc} fern von Verzweiflung und nah bei Deiner Liebe.",
    "Segne jeden Ort auf diesem Weg.",
    "Lass gute Worte tiefer wirken als schwere Tage.",
    "Gib Frieden im Herzen und Schutz auf allen Wegen.",
]

CTAS = [
    "Schreibe „Amen“.",
    "Sage „Amen“.",
    "Amen.",
    "Bete still mit.",
    "Sprich: Amen.",
    "Ein Amen für diesen Segen.",
    "Schicke dieses Gebet weiter.",
    "Bewahre dieses Gebet.",
    "Teile den Segen.",
    "Heute: Amen.",
]

PALETTES = [
    ("#92243a", "#fff2cf", "#11100f", "#a35b25", (252, 246, 218, 156), (116, 132, 82, 148)),
    ("#7c2330", "#fff7dc", "#15120f", "#94612b", (255, 248, 225, 168), (130, 120, 78, 142)),
    ("#873025", "#fff3d8", "#14110f", "#b06d2e", (255, 246, 220, 150), (100, 126, 92, 150)),
    ("#6f3340", "#fff5dc", "#171311", "#8c6b36", (250, 242, 222, 160), (120, 116, 92, 145)),
    ("#8a2436", "#fff0ce", "#101010", "#a35d36", (255, 250, 232, 150), (104, 132, 92, 138)),
]

PANEL_VARIANTS = [
    (78, 118, 1002, 1260, 34),
    (86, 136, 994, 1248, 28),
    (74, 150, 1006, 1295, 30),
    (96, 124, 984, 1215, 24),
    (82, 110, 998, 1310, 38),
]

TINTS = [
    (255, 235, 199, 18),
    (245, 224, 188, 30),
    (250, 242, 215, 22),
    (232, 238, 220, 24),
    (255, 226, 210, 24),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build the German prayer-card preFact pack.")
    parser.add_argument("--count", type=int, default=DEFAULT_COUNT, help="Number of cards/videos to generate.")
    parser.add_argument("--jobs", type=int, default=max(2, min(6, (os.cpu_count() or 4) // 2)), help="Parallel ffmpeg jobs.")
    parser.add_argument("--resume", action="store_true", help="Keep existing posters/videos and build only missing artifacts.")
    parser.add_argument("--skip-video", action="store_true", help="Render cards/JPG/JSON only; do not encode MP4.")
    parser.add_argument("--video-limit", type=int, default=0, help="Encode only first N videos, for quick local tests.")
    parser.add_argument("--preview-only", action="store_true", help="Render posters/contact sheet only; do not sync JSON or manifest.")
    return parser.parse_args()


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def fmt(text: str, subject: Subject) -> str:
    return text.format(
        acc=subject.acc,
        dat=subject.dat,
        pron=subject.pron_acc,
        heart=subject.heart,
        steps=subject.steps,
        faith=subject.faith,
        title=subject.title_label,
    )


def title_case(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def child_card(index: int, seq: int, used_texts: set[str]) -> Card:
    subject = CHILD_SUBJECTS[index % len(CHILD_SUBJECTS)]
    heading_pattern = CHILD_HEADING_PATTERNS[index % len(CHILD_HEADING_PATTERNS)]
    opening = OPENINGS[(index * 3 + index // 7) % len(OPENINGS)]
    protection = PROTECTIONS[(index * 5 + index // 11) % len(PROTECTIONS)]
    blessing = BLESSINGS[(index * 7 + index // 13) % len(BLESSINGS)]
    closing = CLOSINGS[(index * 11 + index // 17) % len(CLOSINGS)]
    cta = CTAS[(index * 13 + index // 19) % len(CTAS)]
    heading_text = fmt(heading_pattern, subject)
    heading = heading_text.upper()
    body = [
        f"{fmt(opening, subject)} {fmt(protection, subject)}",
        f"{fmt(blessing, subject)} {fmt(closing, subject)}",
    ]
    text_key = "\n".join([heading, *body, cta])
    if text_key in used_texts:
        body[1] = f"{body[1]} Heute lege ich dieses Gebet neu in Gottes Hand."
    used_texts.add("\n".join([heading, *body, cta]))
    return Card(
        id=f"{OUTPUT_PREFIX}_{seq:04d}_{subject.slug}",
        title=title_case(heading_text),
        heading=heading,
        body=body,
        cta=cta,
        subject_slug=subject.slug,
        template_id=((seq - 1) % TEMPLATE_COUNT) + 1,
    )


def general_card(index: int, seq: int, used_texts: set[str]) -> Card:
    theme = GENERAL_THEMES[index % len(GENERAL_THEMES)]
    heading_text = theme.headings[(index * 3 + index // 5) % len(theme.headings)]
    opening = theme.openings[(index * 5 + index // 7) % len(theme.openings)]
    protection = theme.protections[(index * 7 + index // 11) % len(theme.protections)]
    blessing = theme.blessings[(index * 11 + index // 13) % len(theme.blessings)]
    closing = theme.closings[(index * 13 + index // 17) % len(theme.closings)]
    cta = CTAS[(index * 17 + index // 19) % len(CTAS)]
    heading = heading_text.upper()
    body = [f"{opening} {protection}", f"{blessing} {closing}"]
    text_key = "\n".join([heading, *body, cta])
    if text_key in used_texts:
        body[1] = f"{body[1]} Heute vertraue ich dieses Gebet neu Gott an."
    used_texts.add("\n".join([heading, *body, cta]))
    return Card(
        id=f"{OUTPUT_PREFIX}_{seq:04d}_{theme.slug}",
        title=title_case(heading_text),
        heading=heading,
        body=body,
        cta=cta,
        subject_slug=theme.slug,
        template_id=((seq - 1) % TEMPLATE_COUNT) + 1,
    )


def child_card_count(count: int) -> int:
    return min(DEFAULT_CHILD_COUNT, round(count * CHILD_SHARE))


def build_cards(count: int) -> list[Card]:
    cards: list[Card] = []
    used_texts: set[str] = set()
    child_total = child_card_count(count)
    general_total = count - child_total
    child_index = 0
    general_index = 0
    for index in range(count):
        seq = index + 1
        use_child = child_index < child_total and (general_index >= general_total or (index + 1) % 4 == 0)
        if use_child:
            cards.append(child_card(child_index, seq, used_texts))
            child_index += 1
            continue
        cards.append(general_card(general_index, seq, used_texts))
        general_index += 1
    return cards


def text_size(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, stroke: int = 0) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if text_size(draw, candidate, fnt, 2)[0] <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def wrapped_block(
    draw: ImageDraw.ImageDraw,
    paragraphs: list[str],
    fnt: ImageFont.FreeTypeFont,
    max_width: int,
) -> list[str | None]:
    lines: list[str | None] = []
    for paragraph in paragraphs:
        if lines:
            lines.append(None)
        lines.extend(wrap_text(draw, paragraph, fnt, max_width))
    return lines


def block_height(lines: list[str | None], size: int) -> int:
    line_h = int(size * 1.16)
    gap = int(size * 0.48)
    return sum(gap if line is None else line_h for line in lines)


def fit_body(draw: ImageDraw.ImageDraw, paragraphs: list[str], max_width: int, max_height: int):
    for size in range(49, 31, -1):
        fnt = font(FONT_SANS_BOLD, size)
        lines = wrapped_block(draw, paragraphs, fnt, max_width)
        if block_height(lines, size) <= max_height:
            return fnt, size, lines
    size = 31
    fnt = font(FONT_SANS_BOLD, size)
    return fnt, size, wrapped_block(draw, paragraphs, fnt, max_width)


def fit_title(draw: ImageDraw.ImageDraw, heading: str, max_width: int, template_id: int):
    start = 66 if len(heading) <= 22 else 58
    if template_id % 5 in (2, 3):
        start -= 4
    for size in range(start, 40, -2):
        fnt = font(FONT_SERIF_BOLD, size)
        if text_size(draw, heading, fnt, 3)[0] <= max_width:
            return fnt, size
    return font(FONT_SERIF_BOLD, 40), 40


def draw_centered(
    draw: ImageDraw.ImageDraw,
    text: str,
    y: int,
    fnt: ImageFont.FreeTypeFont,
    fill: str,
    stroke_fill: str,
    stroke_width: int,
    shadow: bool = False,
) -> int:
    w, h = text_size(draw, text, fnt, stroke_width)
    x = (WIDTH - w) // 2
    if shadow:
        draw.text((x + 4, y + 5), text, font=fnt, fill=(50, 28, 18, 105), stroke_width=stroke_width, stroke_fill=(50, 28, 18, 80))
    draw.text((x, y), text, font=fnt, fill=fill, stroke_width=stroke_width, stroke_fill=stroke_fill)
    return y + h


def draw_leaf_divider(draw: ImageDraw.ImageDraw, y: int, color: tuple[int, int, int, int], variant: int) -> None:
    cx = WIDTH // 2
    if variant % 3 == 0:
        draw.line((230, y, 850, y), fill=color, width=3)
        for side in (-1, 1):
            for i in range(8):
                x = cx + side * (44 + i * 31)
                draw.ellipse((x - 11, y - 18, x + 11, y - 2), fill=color)
                draw.ellipse((x - 11, y + 2, x + 11, y + 18), fill=color)
        draw.ellipse((cx - 9, y - 9, cx + 9, y + 9), fill=color)
        return
    if variant % 3 == 1:
        draw.line((280, y, 800, y), fill=color, width=4)
        for offset in (-210, -150, -90, 90, 150, 210):
            draw.polygon([(cx + offset, y), (cx + offset + 18, y - 10), (cx + offset + 36, y), (cx + offset + 18, y + 10)], fill=color)
        draw.ellipse((cx - 14, y - 14, cx + 14, y + 14), outline=color, width=4)
        return
    draw.line((260, y, 820, y), fill=color, width=2)
    for offset in range(-240, 241, 60):
        draw.arc((cx + offset - 22, y - 18, cx + offset + 22, y + 18), 200, 340, fill=color, width=3)


def template_spec(template_id: int, backgrounds: list[Path]) -> dict[str, object]:
    idx = template_id - 1
    bg = backgrounds[idx % len(backgrounds)]
    palette = PALETTES[idx % len(PALETTES)]
    panel = PANEL_VARIANTS[(idx // 5) % len(PANEL_VARIANTS)]
    center_x = 0.46 + 0.04 * ((idx % 5) / 4)
    center_y = 0.48 + 0.06 * (((idx // 5) % 5) / 4)
    return {
        "id": template_id,
        "name": f"prayer-template-{template_id:02d}",
        "background": bg,
        "palette": palette,
        "panel": panel,
        "tint": TINTS[idx % len(TINTS)],
        "brightness": 0.98 + 0.015 * (idx % 5),
        "contrast": 1.0 + 0.018 * ((idx // 5) % 5),
        "center": (center_x, center_y),
    }


def fit_background(path: Path, center: tuple[float, float], brightness: float, contrast: float, tint: tuple[int, int, int, int]) -> Image.Image:
    src = Image.open(path).convert("RGB")
    img = ImageOps.fit(src, (WIDTH, HEIGHT), method=Image.Resampling.LANCZOS, centering=center)
    img = ImageEnhance.Brightness(img).enhance(brightness)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), tint)
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    return img.filter(ImageFilter.UnsharpMask(radius=1.1, percent=112, threshold=3))


def add_panel(base: Image.Image, spec: dict[str, object]) -> Image.Image:
    title_color, title_stroke, _body_fill, _cta_color, panel_fill, _divider = spec["palette"]  # type: ignore[misc]
    x1, y1, x2, y2, radius = spec["panel"]  # type: ignore[misc]
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.rounded_rectangle((x1, y1, x2, y2), radius=radius, fill=panel_fill, outline=(116, 90, 48, 88), width=3)
    d.rounded_rectangle((x1 + 22, y1 + 28, x2 - 22, y2 - 24), radius=max(18, radius - 8), outline=(255, 255, 245, 85), width=2)
    # Subtle title glow keeps the red serif heading readable over floral corners.
    d.rounded_rectangle((x1 + 18, y1 + 58, x2 - 18, y1 + 198), radius=22, fill=(255, 249, 225, 68))
    return Image.alpha_composite(base.convert("RGBA"), overlay)


def render_card(card: Card, spec: dict[str, object]) -> dict[str, object]:
    title_color, title_stroke, body_fill, cta_color, _panel_fill, divider = spec["palette"]  # type: ignore[misc]
    x1, y1, x2, y2, _radius = spec["panel"]  # type: ignore[misc]
    bg_path = spec["background"]  # type: ignore[assignment]
    base = fit_background(
        bg_path,
        spec["center"],  # type: ignore[arg-type]
        spec["brightness"],  # type: ignore[arg-type]
        spec["contrast"],  # type: ignore[arg-type]
        spec["tint"],  # type: ignore[arg-type]
    )
    img = add_panel(base, spec)
    draw = ImageDraw.Draw(img)

    max_width = int((x2 - x1) - 96)
    title_font, title_size = fit_title(draw, card.heading, max_width, card.template_id)
    title_y = int(y1 + 90)
    y = draw_centered(draw, card.heading, title_y, title_font, title_color, title_stroke, 3, shadow=True)
    draw_leaf_divider(draw, y + 48, divider, card.template_id)

    body_top = y + 104
    body_bottom = int(y2 - 170)
    body_font, body_size, lines = fit_body(draw, card.body, max_width, body_bottom - body_top)
    line_h = int(body_size * 1.16)
    gap = int(body_size * 0.48)
    cursor = body_top
    for line in lines:
        if line is None:
            cursor += gap
            continue
        w, _ = text_size(draw, line, body_font, 2)
        draw.text(
            ((WIDTH - w) // 2, cursor),
            line,
            font=body_font,
            fill=body_fill,
            stroke_width=2,
            stroke_fill="#fff8e5",
        )
        cursor += line_h

    cta_size = 47 if len(card.cta) < 18 else 40
    cta_font = font(FONT_SERIF_BOLD, cta_size)
    draw_centered(draw, card.cta, min(cursor + 48, int(y2 - 115)), cta_font, cta_color, "#fff4d5", 2, shadow=True)

    jpg_path = ADMIN_DIR / f"{card.id}.jpg"
    ADMIN_DIR.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(jpg_path, quality=90)
    return {
        "id": card.id,
        "template": spec["name"],
        "background": str(bg_path.relative_to(ROOT)),
        "poster": str(jpg_path.relative_to(ROOT)),
        "titleFontSize": title_size,
        "bodyFontSize": body_size,
        "bodyLines": len([line for line in lines if line]),
    }


def rendered_stub(card: Card, spec: dict[str, object]) -> dict[str, object]:
    bg_path = spec["background"]  # type: ignore[assignment]
    return {
        "id": card.id,
        "template": spec["name"],
        "background": str(bg_path.relative_to(ROOT)),
        "poster": str((ADMIN_DIR / f"{card.id}.jpg").relative_to(ROOT)),
        "resumedFromExistingPoster": True,
    }


def build_video(card_id: str) -> None:
    src = ADMIN_DIR / f"{card_id}.jpg"
    fact_out = FACT_DIR / f"{card_id}.mp4"
    admin_out = ADMIN_DIR / f"{card_id}.mp4"
    FACT_DIR.mkdir(parents=True, exist_ok=True)
    if not FFMPEG.exists():
        raise FileNotFoundError(f"ffmpeg-static binary not found: {FFMPEG}")
    cmd = [
        str(FFMPEG),
        "-y",
        "-loglevel",
        "error",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        str(CARD_SECONDS),
        "-i",
        str(src),
        "-f",
        "lavfi",
        "-t",
        str(CARD_SECONDS),
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-vf",
        "scale=1080:1920,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "stillimage",
        "-crf",
        "24",
        "-c:a",
        "aac",
        "-b:a",
        "48k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(fact_out),
    ]
    subprocess.run(cmd, check=True)
    shutil.copy2(fact_out, admin_out)


def clean_outputs() -> None:
    shutil.rmtree(OLD_CARD_DIR, ignore_errors=True)
    FACT_DIR.mkdir(parents=True, exist_ok=True)
    ADMIN_DIR.mkdir(parents=True, exist_ok=True)
    for path in FACT_DIR.glob(f"{OUTPUT_PREFIX}_*.mp4"):
        path.unlink()
    for pattern in (f"{OUTPUT_PREFIX}_*.mp4", f"{OUTPUT_PREFIX}_*.jpg"):
        for path in ADMIN_DIR.glob(pattern):
            path.unlink()


def sync_json(cards: list[Card], rendered: list[dict[str, object]]) -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    child_total = child_card_count(len(cards))
    videos = []
    rendered_by_id = {r["id"]: r for r in rendered}
    for card in cards:
        text = f"{card.heading}\n\n{card.body[0]}\n\n{card.body[1]}\n\n{card.cta}"
        videos.append(
            {
                "file": f"{PACK_ID}/{card.id}.mp4",
                "title": card.title,
                "text": text,
                "theme": "german-prayer-card",
                "template": rendered_by_id[card.id]["template"],
            }
        )
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    VIDEOS_JSON.write_text(json.dumps(videos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    INDEX_JSON.write_text(
        json.dumps(
            {
                "total": len(videos),
                "packs": 1,
                "packSize": len(videos),
                "range": [1, len(videos)],
                "childRelated": child_total,
                "generalPrayer": len(videos) - child_total,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    backgrounds = sorted(BACKGROUND_DIR.glob("bg_*.png"))
    templates = [
        {
            "id": i,
            "name": f"prayer-template-{i:02d}",
            "background": str(backgrounds[(i - 1) % len(backgrounds)].relative_to(ROOT)),
        }
        for i in range(1, TEMPLATE_COUNT + 1)
    ]
    SOURCES_JSON.write_text(
        json.dumps(
            {
                "packId": PACK_ID,
                "title": PACK_TITLE,
                "generatedAt": now,
                "generator": "scripts/build-prayers-de-pack.py",
                "count": len(cards),
                "childRelated": child_total,
                "generalPrayer": len(cards) - child_total,
                "templateCount": TEMPLATE_COUNT,
                "backgroundSource": "OpenAI built-in image_gen backgrounds generated for this pack; no external image URLs; no watermark/tag added.",
                "textSource": "Original deterministic German devotional templates generated locally: about 25% child-related cards and 75% general prayer themes.",
                "templates": templates,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    LAYOUT_REPORT.write_text(json.dumps(rendered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    manifest = {"packs": []}
    if MANIFEST_JSON.exists():
        manifest = json.loads(MANIFEST_JSON.read_text(encoding="utf-8"))
    existing_pack = next((p for p in manifest.get("packs", []) if p.get("id") == PACK_ID), None)
    old_items = {it.get("id"): it for it in (existing_pack or {}).get("items", [])}
    pack = {
        "id": PACK_ID,
        "title": PACK_TITLE,
        "lang": "de",
        "items": [
            {
                "id": card.id,
                "title": card.title,
                "theme": "german-prayer-card",
                "template": f"prayer-template-{card.template_id:02d}",
                "dur": "0:10",
                "createdAt": old_items.get(card.id, {}).get("createdAt", now),
                "updatedAt": now,
            }
            for card in cards
        ],
    }
    packs = [p for p in manifest.get("packs", []) if p.get("id") != PACK_ID]
    packs.append(pack)
    manifest["packs"] = packs
    MANIFEST_JSON.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def make_contact_sheet(cards: list[Card], *, sample: int = TEMPLATE_COUNT) -> None:
    CONTACT_DIR.mkdir(parents=True, exist_ok=True)
    selected = cards[:sample]
    thumb_w, thumb_h = 180, 320
    cols = 5
    rows = math.ceil(len(selected) / cols)
    sheet = Image.new("RGB", (thumb_w * cols, thumb_h * rows), (24, 24, 24))
    for idx, card in enumerate(selected):
        im = Image.open(ADMIN_DIR / f"{card.id}.jpg").convert("RGB")
        im.thumbnail((thumb_w, thumb_h))
        canvas = Image.new("RGB", (thumb_w, thumb_h), (30, 30, 30))
        canvas.paste(im, ((thumb_w - im.width) // 2, (thumb_h - im.height) // 2))
        sheet.paste(canvas, ((idx % cols) * thumb_w, (idx // cols) * thumb_h))
    sheet.save(CONTACT_DIR / "contact.jpg", quality=92)


def encode_videos(cards: list[Card], jobs: int, limit: int = 0, skip_existing: bool = False) -> None:
    targets = cards[:limit] if limit else cards
    if skip_existing:
        targets = [
            card
            for card in targets
            if not (FACT_DIR / f"{card.id}.mp4").exists() or not (ADMIN_DIR / f"{card.id}.mp4").exists()
        ]
        print(json.dumps({"encodeMissing": len(targets), "totalCards": len(cards)}, ensure_ascii=False), flush=True)
    if not targets:
        return
    done = 0
    with ThreadPoolExecutor(max_workers=max(1, jobs)) as pool:
        futures = {pool.submit(build_video, card.id): card.id for card in targets}
        for future in as_completed(futures):
            card_id = futures[future]
            future.result()
            done += 1
            if done % 50 == 0 or done == len(targets):
                print(json.dumps({"encoded": done, "total": len(targets), "last": card_id}, ensure_ascii=False), flush=True)


def main() -> None:
    args = parse_args()
    if args.count < 1:
        raise SystemExit("--count must be positive")
    backgrounds = sorted(BACKGROUND_DIR.glob("bg_*.png"))
    if len(backgrounds) < 5:
        raise SystemExit(f"Need at least 5 background PNGs in {BACKGROUND_DIR}, found {len(backgrounds)}")
    if not args.resume:
        clean_outputs()
    cards = build_cards(args.count)
    specs = [template_spec(i, backgrounds) for i in range(1, TEMPLATE_COUNT + 1)]
    rendered = []
    for idx, card in enumerate(cards, start=1):
        poster = ADMIN_DIR / f"{card.id}.jpg"
        if args.resume and poster.exists():
            rendered.append(rendered_stub(card, specs[card.template_id - 1]))
        else:
            rendered.append(render_card(card, specs[card.template_id - 1]))
        if idx % 100 == 0 or idx == len(cards):
            print(json.dumps({"rendered": idx, "total": len(cards)}, ensure_ascii=False), flush=True)
    if args.preview_only:
        make_contact_sheet(cards)
        print(
            json.dumps(
                {
                    "packId": PACK_ID,
                    "cards": len(cards),
                    "childRelated": child_card_count(len(cards)),
                    "generalPrayer": len(cards) - child_card_count(len(cards)),
                    "templates": TEMPLATE_COUNT,
                    "contact": str((CONTACT_DIR / "contact.jpg").relative_to(ROOT)),
                    "previewOnly": True,
                },
                ensure_ascii=False,
            )
        )
        return
    if not args.skip_video:
        encode_videos(cards, args.jobs, args.video_limit, skip_existing=args.resume)
    sync_json(cards, rendered)
    make_contact_sheet(cards)
    print(
        json.dumps(
            {
                "packId": PACK_ID,
                "cards": len(cards),
                "childRelated": child_card_count(len(cards)),
                "generalPrayer": len(cards) - child_card_count(len(cards)),
                "templates": TEMPLATE_COUNT,
                "videosJson": str(VIDEOS_JSON.relative_to(ROOT)),
                "factDir": str(FACT_DIR.relative_to(ROOT)),
                "adminManifest": str(MANIFEST_JSON.relative_to(ROOT)),
                "contact": str((CONTACT_DIR / "contact.jpg").relative_to(ROOT)),
                "skipVideo": bool(args.skip_video),
                "videoLimit": args.video_limit,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

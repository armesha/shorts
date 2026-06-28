import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const BASE_PACK = resolve(ROOT, "data/packs/psychology-ru-superadmin.json");
const OUT_PACK = resolve(ROOT, "data/packs/psychology-de-superadmin.json");
const PACK_ID = "psychology-de-superadmin";
const CREATED_AT = "2026-06-28T00:00:00.000Z";

const labelMap = new Map([
  ["ЗАМЕТКА", "MERKLISTE"],
  ["ПРОВЕРКА", "CHECK-IN"],
  ["НА КАЖДЫЙ ДЕНЬ", "ALLTAG"],
  ["РЕФЛЕКСИЯ", "REFLEXION"],
  ["ПАУЗА", "RUHE"],
  ["ГРАНИЦЫ", "GRENZEN"],
  ["ВОПРОС К СЕБЕ", "FRAGE AN DICH"],
  ["ПАУЗА ДЛЯ МЫСЛИ", "DENKPAUSE"],
  ["САМОПРОВЕРКА", "SELBSTCHECK"],
  ["ЧЕСТНО?", "EHRLICH?"],
  ["ДНЕВНИК", "JOURNAL"],
  ["ВНУТРЕННИЙ ВЗГЛЯД", "INNENBLICK"],
  ["МИФ / ФАКТ", "MYTHOS / FAKT"],
  ["ПЕРЕОСМЫСЛИТЬ", "UMDENKEN"],
  ["НОВЫЙ ВЗГЛЯД", "NEUER BLICK"],
  ["НОВАЯ РАМКА", "REFRAME"],
  ["ВМЕСТО / ЛУЧШЕ", "STATT / LIEBER"],
  ["ЯСНЕЕ МЫСЛИТЬ", "KLARER DENKEN"],
  ["МИКРО-ПРИВЫЧКА", "MIKRO-GEWOHNHEIT"],
  ["3 МИНУТЫ", "3 MINUTEN"],
  ["МАЛЕНЬКИЙ ШАГ", "KLEINER SCHRITT"],
  ["СБРОС", "RESET"],
  ["СЕГОДНЯ", "HEUTE"],
  ["МИНИ-ИНСТРУМЕНТ", "MINI-TOOL"],
  ["В ГОЛОВЕ", "KOPFSACHE"],
  ["ЭМОЦИЯ", "EMOTION"],
  ["ПСИХОЛОГИЯ", "PSYCHOLOGIE"],
  ["ШАБЛОН МЫСЛИ", "DENKMUSTER"],
  ["ТИХИЙ ВЫБОР", "LEISE WAHL"],
  ["ОПОРА", "HALT"],
]);

const topics = [
  "Selbstkritik",
  "ängstliche Gedanken",
  "persönliche Grenzen",
  "soziale Müdigkeit",
  "Angst vor Ablehnung",
  "es allen recht machen",
  "Aufschieben",
  "Reizbarkeit",
  "Vergleichen mit anderen",
  "Schuldgefühle",
  "Perfektionismus",
  "Kränkung",
  "Unsicherheit",
  "ein schwieriges Gespräch",
  "Morgenmüdigkeit",
  "Fokusverlust",
  "innere Anspannung",
  "Eile",
  "Angst vor Fehlern",
  "emotionale Verschlossenheit",
  "Grübeln",
  "zu viele Aufgaben",
  "fremde Meinungen",
  "die Pause vor der Antwort",
  "Erschöpfung",
  "Ärger über Nähe",
  "eine unausgesprochene Bitte",
  "zu hohe Erwartungen",
  "das Bedürfnis nach Zustimmung",
  "schweres Abschalten",
  "Konflikt nach Schweigen",
  "Selbstabwertung",
  "ein Plan ohne Kraft",
  "Vertrauen in dich",
  "ein emotionaler Rückfall",
];

const starts = [
  "Wenn",
  "Sobald",
  "Wenn dich",
  "Wenn wieder",
  "Wenn im Kopf",
  "Falls",
  "Wenn heute",
];

function sentence(topic, seed) {
  const rows = [
    "benenne es als Zustand, nicht als deinen Charakter",
    "prüfe, was dein Körper gerade braucht: Pause, Wasser, Stille oder einen klaren Plan",
    "verkleinere die Aufgabe auf den ersten Zwei-Minuten-Schritt",
    "trenne Fakt und Vermutung: was ist passiert, was hast du ergänzt",
    "frage dich, ob eine Reaktion wirklich sofort nötig ist",
    "wähle eine ruhige Grenze statt einer langen Rechtfertigung",
    "achte auf den Ton in deinem inneren Dialog und mach ihn sachlicher",
    "erwarte keine perfekte Version von dir, wenn du müde bist",
    "schreibe einen Satz auf, den du einfacher sagen kannst",
    "erlaube dir später zu antworten, wenn es innerlich laut ist",
    "prüfe, ob du gerade versuchst, Ruhe zu verdienen",
    "mach einen kleinen Schritt, der keine Motivation braucht",
  ];
  return rows[(seed + topic.length) % rows.length];
}

function cardVariants(topic, index) {
  const lead = starts[index % starts.length];
  return [
    {
      title: `${lead} ${topic} auftaucht`,
      text: [
        sentence(topic, 0),
        "setze eine Pause zwischen Gedanken und Handlung",
        "vergleiche dich mit deinem Gestern, nicht mit fremden Bildern",
        "lasse einen einfachen nächsten Schritt stehen",
        "wenn die Emotion stark ist, senke zuerst das Tempo",
      ],
    },
    {
      title: `Kurzer Check: ${topic}`,
      text: [
        "was weiß ich sicher, und was vermute ich nur",
        "welches Bedürfnis wurde noch nicht ausgesprochen",
        "wo trage ich gerade zu viel Verantwortung",
        "welche Antwort wäre ehrlich und ruhig",
        "was kann ohne Schaden warten",
      ],
    },
    {
      title: "Statt Kampf mit dir",
      text: [
        `bemerke ${topic}, ohne daraus ein Urteil über dich zu machen`,
        "sprich kürzer und freundlicher mit dir",
        "streiche ein unnötiges Müssen aus dem Plan",
        "bitte um Konkretes, statt alles zu erraten",
        "beende den Tag mit einem Fakt, nicht mit einem Urteil",
      ],
    },
    {
      title: "Ein kleiner Schritt heute",
      text: [
        "eine Notiz auf Papier entlastet den Kopf",
        "ein ehrliches Nein ist besser als zehn gereizte Ja",
        "eine Pause vor einer Nachricht verändert den Ton",
        "ein kurzer Spaziergang löst oft etwas Druck aus dem Körper",
        `ein Satz über ${topic} macht den Zustand greifbarer`,
      ],
    },
    {
      title: "Mythos und Fakt",
      text: [
        "Mythos: Ruhe kommt erst, wenn alles kontrolliert ist",
        "Fakt: Kontrolle wächst oft aus kleiner Klarheit",
        "Mythos: starke Menschen zweifeln nie",
        "Fakt: Zweifel kann man prüfen, statt ihm automatisch zu folgen",
        `Mythos: ${topic} muss mit Härte besiegt werden`,
      ],
    },
    {
      title: "Fragen an dich",
      text: [
        "was versuche ich gerade zu beweisen",
        "wem antworte ich innerlich",
        "welche Bitte habe ich durch Ärger ersetzt",
        "was wäre gut genug, nicht perfekt",
        "welche Wahl spart mir morgen Kraft",
      ],
    },
    {
      title: "Was bei Anspannung hilft",
      text: [
        "langsamer sprechen, als du möchtest",
        "zuerst den Fakt nennen, dann das Gefühl",
        "nicht mit jedem Gedanken diskutieren",
        "im Kalender Platz für Erholung lassen",
        "eine unnötige Lärmquelle aus dem Tag nehmen",
        `${topic} früher bemerken, bevor es laut wird`,
      ],
    },
    {
      title: "Ruhige Erinnerung",
      text: [
        "du musst nicht alles an einem Abend lösen",
        "eine Pause macht dich nicht schwach",
        "eine Grenze braucht keine perfekte Erklärung",
        "Ehrlichkeit klingt besser mit weniger Verteidigung",
        "kleine Klarheit ist mehr wert als ein großes inneres Gericht",
      ],
    },
  ];
}

function localizeTemplates(templates) {
  return templates.map((template, index) => {
    const copy = JSON.parse(JSON.stringify(template));
    copy.name = `psychology-de-${String(index + 1).padStart(2, "0")}-${String(copy.name || "").split("-").slice(3).join("-") || "card"}`;
    for (const el of copy.elements || []) {
      if (el.type === "image" && typeof el.src === "string") {
        el.src = el.src
          .replace("assets/template-packs/psychology-ru/backgrounds/", "assets/template-packs/psychology-de/backgrounds/")
          .replace("psychology-ru-bg-", "psychology-de-bg-");
      }
      if (typeof el.text === "string" && labelMap.has(el.text)) el.text = labelMap.get(el.text);
    }
    return copy;
  });
}

function buildCards() {
  const cards = [];
  for (const [topicIndex, topic] of topics.entries()) {
    for (const variant of cardVariants(topic, topicIndex)) {
      cards.push({
        values: {
          title: variant.title,
          text: variant.text,
        },
        addedAt: CREATED_AT,
      });
    }
  }
  return cards;
}

if (!existsSync(BASE_PACK)) throw new Error(`Missing base super-admin RU pack: ${BASE_PACK}`);
const base = JSON.parse(readFileSync(BASE_PACK, "utf8"));
const pack = {
  id: PACK_ID,
  owners: [1],
  createdBy: 1,
  name: "Psychologie jeden Tag",
  lang: "de",
  templates: localizeTemplates(base.templates || []),
  cards: buildCards(),
  createdAt: CREATED_AT,
  grants: [],
};

mkdirSync(resolve(ROOT, "data/packs"), { recursive: true });
writeFileSync(OUT_PACK, `${JSON.stringify(pack, null, 2)}\n`);
console.log(`wrote ${OUT_PACK}: templates=${pack.templates.length}, cards=${pack.cards.length}`);

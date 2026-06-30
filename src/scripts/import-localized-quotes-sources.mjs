import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const INPUT_DIR = "temp/localization-input";
const IMPORTED_AT = process.env.IMPORT_TIMESTAMP || "2026-06-30T12:00:00.000Z";

const FACT_LANGS = ["de", "it", "fr", "pt"];

const PSYCHOLOGY_PACKS = {
  en: {
    name: "Psychology Every Day",
    labels: {
      "ЗАМЕТКА": "NOTE",
      "ПРОВЕРКА": "CHECK-IN",
      "НА КАЖДЫЙ ДЕНЬ": "EVERYDAY",
      "РЕФЛЕКСИЯ": "REFLECTION",
      "ПАУЗА": "PAUSE",
      "ГРАНИЦЫ": "BOUNDARIES",
      "ВОПРОС К СЕБЕ": "QUESTION TO SELF",
      "ПАУЗА ДЛЯ МЫСЛИ": "THOUGHT PAUSE",
      "САМОПРОВЕРКА": "SELF-CHECK",
      "ЧЕСТНО?": "HONESTLY?",
      "ДНЕВНИК": "JOURNAL",
      "ВНУТРЕННИЙ ВЗГЛЯД": "INNER VIEW",
      "МИФ / ФАКТ": "MYTH / FACT",
      "ПЕРЕОСМЫСЛИТЬ": "REFRAME",
      "НОВЫЙ ВЗГЛЯД": "NEW VIEW",
      "НОВАЯ РАМКА": "NEW FRAME",
      "ВМЕСТО / ЛУЧШЕ": "INSTEAD / BETTER",
      "ЯСНЕЕ МЫСЛИТЬ": "THINK CLEARER",
      "МИКРО-ПРИВЫЧКА": "MICRO-HABIT",
      "3 МИНУТЫ": "3 MINUTES",
      "МАЛЕНЬКИЙ ШАГ": "SMALL STEP",
      "СБРОС": "RESET",
      "СЕГОДНЯ": "TODAY",
      "МИНИ-ИНСТРУМЕНТ": "MINI-TOOL",
      "В ГОЛОВЕ": "IN THE MIND",
      "ЭМОЦИЯ": "EMOTION",
      "ПСИХОЛОГИЯ": "PSYCHOLOGY",
      "ШАБЛОН МЫСЛИ": "THOUGHT PATTERN",
      "ТИХИЙ ВЫБОР": "QUIET CHOICE",
      "ОПОРА": "SUPPORT",
    },
  },
  it: {
    name: "Psicologia ogni giorno",
    labels: {
      "ЗАМЕТКА": "NOTA",
      "ПРОВЕРКА": "CONTROLLO",
      "НА КАЖДЫЙ ДЕНЬ": "OGNI GIORNO",
      "РЕФЛЕКСИЯ": "RIFLESSIONE",
      "ПАУЗА": "PAUSA",
      "ГРАНИЦЫ": "CONFINI",
      "ВОПРОС К СЕБЕ": "DOMANDA A TE",
      "ПАУЗА ДЛЯ МЫСЛИ": "PAUSA MENTALE",
      "САМОПРОВЕРКА": "AUTO-CHECK",
      "ЧЕСТНО?": "ONESTO?",
      "ДНЕВНИК": "DIARIO",
      "ВНУТРЕННИЙ ВЗГЛЯД": "SGUARDO INTERIORE",
      "МИФ / ФАКТ": "MITO / FATTO",
      "ПЕРЕОСМЫСЛИТЬ": "RIFORMULA",
      "НОВЫЙ ВЗГЛЯД": "NUOVO SGUARDO",
      "НОВАЯ РАМКА": "NUOVA CORNICE",
      "ВМЕСТО / ЛУЧШЕ": "INVECE / MEGLIO",
      "ЯСНЕЕ МЫСЛИТЬ": "PENSARE CHIARO",
      "МИКРО-ПРИВЫЧКА": "MICRO-ABITUDINE",
      "3 МИНУТЫ": "3 MINUTI",
      "МАЛЕНЬКИЙ ШАГ": "PICCOLO PASSO",
      "СБРОС": "RESET",
      "СЕГОДНЯ": "OGGI",
      "МИНИ-ИНСТРУМЕНТ": "MINI-STRUMENTO",
      "В ГОЛОВЕ": "NELLA MENTE",
      "ЭМОЦИЯ": "EMOZIONE",
      "ПСИХОЛОГИЯ": "PSICOLOGIA",
      "ШАБЛОН МЫСЛИ": "SCHEMA DI PENSIERO",
      "ТИХИЙ ВЫБОР": "SCELTA CALMA",
      "ОПОРА": "SOSTEGNO",
    },
  },
  es: {
    name: "Psicologia cada dia",
    labels: {
      "ЗАМЕТКА": "NOTA",
      "ПРОВЕРКА": "CHEQUEO",
      "НА КАЖДЫЙ ДЕНЬ": "CADA DIA",
      "РЕФЛЕКСИЯ": "REFLEXION",
      "ПАУЗА": "PAUSA",
      "ГРАНИЦЫ": "LIMITES",
      "ВОПРОС К СЕБЕ": "PREGUNTA PARA TI",
      "ПАУЗА ДЛЯ МЫСЛИ": "PAUSA MENTAL",
      "САМОПРОВЕРКА": "AUTO-CHEQUEO",
      "ЧЕСТНО?": "HONESTO?",
      "ДНЕВНИК": "DIARIO",
      "ВНУТРЕННИЙ ВЗГЛЯД": "MIRADA INTERIOR",
      "МИФ / ФАКТ": "MITO / HECHO",
      "ПЕРЕОСМЫСЛИТЬ": "REPLANTEAR",
      "НОВЫЙ ВЗГЛЯД": "NUEVA MIRADA",
      "НОВАЯ РАМКА": "NUEVO MARCO",
      "ВМЕСТО / ЛУЧШЕ": "EN VEZ DE / MEJOR",
      "ЯСНЕЕ МЫСЛИТЬ": "PENSAR MAS CLARO",
      "МИКРО-ПРИВЫЧКА": "MICRO-HABITO",
      "3 МИНУТЫ": "3 MINUTOS",
      "МАЛЕНЬКИЙ ШАГ": "PEQUENO PASO",
      "СБРОС": "REINICIO",
      "СЕГОДНЯ": "HOY",
      "МИНИ-ИНСТРУМЕНТ": "MINI-HERRAMIENTA",
      "В ГОЛОВЕ": "EN LA MENTE",
      "ЭМОЦИЯ": "EMOCION",
      "ПСИХОЛОГИЯ": "PSICOLOGIA",
      "ШАБЛОН МЫСЛИ": "PATRON MENTAL",
      "ТИХИЙ ВЫБОР": "ELECCION TRANQUILA",
      "ОПОРА": "APOYO",
    },
  },
  fr: {
    name: "Psychologie au quotidien",
    labels: {
      "ЗАМЕТКА": "NOTE",
      "ПРОВЕРКА": "VERIFICATION",
      "НА КАЖДЫЙ ДЕНЬ": "CHAQUE JOUR",
      "РЕФЛЕКСИЯ": "REFLEXION",
      "ПАУЗА": "PAUSE",
      "ГРАНИЦЫ": "LIMITES",
      "ВОПРОС К СЕБЕ": "QUESTION A SOI",
      "ПАУЗА ДЛЯ МЫСЛИ": "PAUSE MENTALE",
      "САМОПРОВЕРКА": "AUTO-CHECK",
      "ЧЕСТНО?": "HONNETEMENT?",
      "ДНЕВНИК": "JOURNAL",
      "ВНУТРЕННИЙ ВЗГЛЯД": "REGARD INTERIEUR",
      "МИФ / ФАКТ": "MYTHE / FAIT",
      "ПЕРЕОСМЫСЛИТЬ": "RECADRER",
      "НОВЫЙ ВЗГЛЯД": "NOUVEAU REGARD",
      "НОВАЯ РАМКА": "NOUVEAU CADRE",
      "ВМЕСТО / ЛУЧШЕ": "AU LIEU DE / MIEUX",
      "ЯСНЕЕ МЫСЛИТЬ": "PENSER PLUS CLAIR",
      "МИКРО-ПРИВЫЧКА": "MICRO-HABITUDE",
      "3 МИНУТЫ": "3 MINUTES",
      "МАЛЕНЬКИЙ ШАГ": "PETIT PAS",
      "СБРОС": "RESET",
      "СЕГОДНЯ": "AUJOURD'HUI",
      "МИНИ-ИНСТРУМЕНТ": "MINI-OUTIL",
      "В ГОЛОВЕ": "DANS LA TETE",
      "ЭМОЦИЯ": "EMOTION",
      "ПСИХОЛОГИЯ": "PSYCHOLOGIE",
      "ШАБЛОН МЫСЛИ": "SCHEMA DE PENSEE",
      "ТИХИЙ ВЫБОР": "CHOIX CALME",
      "ОПОРА": "APPUI",
    },
  },
  pt: {
    name: "Psicologia todo dia",
    labels: {
      "ЗАМЕТКА": "NOTA",
      "ПРОВЕРКА": "CHECAGEM",
      "НА КАЖДЫЙ ДЕНЬ": "TODO DIA",
      "РЕФЛЕКСИЯ": "REFLEXAO",
      "ПАУЗА": "PAUSA",
      "ГРАНИЦЫ": "LIMITES",
      "ВОПРОС К СЕБЕ": "PERGUNTA PARA SI",
      "ПАУЗА ДЛЯ МЫСЛИ": "PAUSA MENTAL",
      "САМОПРОВЕРКА": "AUTO-CHECK",
      "ЧЕСТНО?": "HONESTO?",
      "ДНЕВНИК": "DIARIO",
      "ВНУТРЕННИЙ ВЗГЛЯД": "OLHAR INTERIOR",
      "МИФ / ФАКТ": "MITO / FATO",
      "ПЕРЕОСМЫСЛИТЬ": "REENQUADRAR",
      "НОВЫЙ ВЗГЛЯД": "NOVO OLHAR",
      "НОВАЯ РАМКА": "NOVA MOLDURA",
      "ВМЕСТО / ЛУЧШЕ": "EM VEZ DE / MELHOR",
      "ЯСНЕЕ МЫСЛИТЬ": "PENSAR MAIS CLARO",
      "МИКРО-ПРИВЫЧКА": "MICRO-HABITO",
      "3 МИНУТЫ": "3 MINUTOS",
      "МАЛЕНЬКИЙ ШАГ": "PEQUENO PASSO",
      "СБРОС": "RESET",
      "СЕГОДНЯ": "HOJE",
      "МИНИ-ИНСТРУМЕНТ": "MINI-FERRAMENTA",
      "В ГОЛОВЕ": "NA MENTE",
      "ЭМОЦИЯ": "EMOCAO",
      "ПСИХОЛОГИЯ": "PSICOLOGIA",
      "ШАБЛОН МЫСЛИ": "PADRAO DE PENSAMENTO",
      "ТИХИЙ ВЫБОР": "ESCOLHA CALMA",
      "ОПОРА": "APOIO",
    },
  },
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validateFactRows(lang, rows, sourceRows) {
  assert(Array.isArray(rows), `${lang} fact input is not an array`);
  assert(rows.length === sourceRows.length, `${lang} fact length mismatch: ${rows.length} != ${sourceRows.length}`);
  rows.forEach((row, index) => {
    const source = sourceRows[index];
    assert(row.localization === lang, `${lang} fact row ${index} has localization=${row.localization}`);
    assert(row.sourceDeck === "fact-en", `${lang} fact row ${index} sourceDeck mismatch`);
    assert(row.sourceIndex === index, `${lang} fact row ${index} sourceIndex mismatch`);
    assert(row.file === source.file, `${lang} fact row ${index} file mismatch`);
    assert(row.series === source.series, `${lang} fact row ${index} series mismatch`);
    assert(row.sourceTitle === source.title, `${lang} fact row ${index} sourceTitle mismatch`);
    assert(row.sourceText === source.text, `${lang} fact row ${index} sourceText mismatch`);
    assert(typeof row.title === "string" && row.title.trim(), `${lang} fact row ${index} empty title`);
    assert(typeof row.text === "string" && row.text.trim(), `${lang} fact row ${index} empty text`);
  });
}

function localizeTemplate(template, lang, labels) {
  const next = clone(template);
  next.name = next.name.replace(/^psychology-ru-/, `psychology-${lang}-`);
  for (const element of next.elements ?? []) {
    if (typeof element.text === "string" && labels[element.text]) {
      element.text = labels[element.text];
    }
  }
  return next;
}

function validatePsychologyRows(lang, rows, sourceCards) {
  assert(Array.isArray(rows), `${lang} psychology input is not an array`);
  assert(rows.length === sourceCards.length, `${lang} psychology length mismatch: ${rows.length} != ${sourceCards.length}`);
  rows.forEach((row, index) => {
    const source = sourceCards[index]?.values;
    assert(row.localization === lang, `${lang} psychology row ${index} has localization=${row.localization}`);
    assert(row.sourceIndex === index, `${lang} psychology row ${index} sourceIndex mismatch`);
    assert(row.sourceTitle === source?.title, `${lang} psychology row ${index} sourceTitle mismatch`);
    assert(JSON.stringify(row.sourceText) === JSON.stringify(source?.text), `${lang} psychology row ${index} sourceText mismatch`);
    assert(typeof row.values?.title === "string" && row.values.title.trim(), `${lang} psychology row ${index} empty title`);
    assert(Array.isArray(row.values?.text) && row.values.text.length > 0, `${lang} psychology row ${index} empty text`);
    for (const line of row.values.text) {
      assert(typeof line === "string" && line.trim(), `${lang} psychology row ${index} has empty text line`);
    }
  });
}

function importFacts() {
  const sourceRows = readJson("data/fact-videos/videos.json");
  for (const lang of FACT_LANGS) {
    const rows = readJson(`${INPUT_DIR}/fact-videos-${lang}.json`);
    validateFactRows(lang, rows, sourceRows);
    const dir = `data/fact-videos-${lang}`;
    writeJson(`${dir}/videos.json`, rows);
    writeJson(`${dir}/index.json`, {
      total: rows.length,
      packs: 1,
      packSize: rows.length,
      sourceDeck: "fact-en",
      localization: lang,
      mediaReuse: "source-footage",
    });
    writeJson(`${dir}/sources.json`, {
      generatedAt: IMPORTED_AT,
      deck: `fact-${lang}`,
      sourceDeck: "fact-en",
      sourceFile: "data/fact-videos/videos.json",
      translationFile: `${INPUT_DIR}/fact-videos-${lang}.json`,
      localization: lang,
      note: `${lang.toUpperCase()} title/text localization of the existing Interesting Facts corpus. Generation reuses local source footage and rebuilds localized overlay/voiceover.`,
      rights:
        "Uses existing local pre-built videos as source footage. Live generation rebuilds the selected video with localized overlay text and edge-tts voiceover. No external web images or AP/news imagery are imported by this localization step.",
    });
    console.log(`fact-${lang}: ${rows.length} rows`);
  }
}

function importPsychologyPacks() {
  const base = readJson("data/packs/psychology-ru-superadmin.json");
  for (const [lang, config] of Object.entries(PSYCHOLOGY_PACKS)) {
    const rows = readJson(`${INPUT_DIR}/psychology-${lang}-cards.json`);
    validatePsychologyRows(lang, rows, base.cards ?? []);
    const pack = {
      id: `psychology-${lang}-superadmin`,
      owners: [1],
      createdBy: 1,
      name: config.name,
      lang,
      templates: (base.templates ?? []).map((template) => localizeTemplate(template, lang, config.labels)),
      cards: rows.map((row) => ({
        values: row.values,
        addedAt: IMPORTED_AT,
      })),
      createdAt: IMPORTED_AT,
      grants: [],
    };
    writeJson(`data/packs/${pack.id}.json`, pack);
    console.log(`pack:${pack.id}: ${pack.cards.length} cards`);
  }
}

importFacts();
importPsychologyPacks();

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

const ROOT = process.cwd();
const INPUT_DIR = resolve(ROOT, "temp/localization-input");
const FACT_SOURCE = resolve(ROOT, "data/fact-videos/videos.json");
const PSYCHOLOGY_BASE_PACK = resolve(ROOT, "data/packs/psychology-ru-superadmin.json");
const CREATED_AT = "2026-06-30T00:00:00.000Z";

const FACT_LANGS = {
  de: {
    deck: "fact-de",
    label: "German",
    note:
      "German title/text localization of Interesting Facts. Generation rebuilds the chosen source video with German overlay and edge-tts voiceover.",
  },
  it: {
    deck: "fact-it",
    label: "Italian",
    note:
      "Italian title/text localization of Interesting Facts. Generation rebuilds the chosen source video with Italian overlay and edge-tts voiceover.",
  },
  fr: {
    deck: "fact-fr",
    label: "French",
    note:
      "French title/text localization of Interesting Facts. Generation rebuilds the chosen source video with French overlay and edge-tts voiceover.",
  },
  pt: {
    deck: "fact-pt",
    label: "Portuguese",
    note:
      "Portuguese title/text localization of Interesting Facts. Generation rebuilds the chosen source video with Portuguese overlay and edge-tts voiceover.",
  },
};

const PSYCHOLOGY_LANGS = {
  en: { packId: "psychology-en-superadmin", name: "Psychology Every Day" },
  it: { packId: "psychology-it-superadmin", name: "Psicologia ogni giorno" },
  es: { packId: "psychology-es-superadmin", name: "Psicología cada día" },
  fr: { packId: "psychology-fr-superadmin", name: "Psychologie au quotidien" },
  pt: { packId: "psychology-pt-superadmin", name: "Psicologia todos os dias" },
};

const TEMPLATE_LABELS = {
  en: {
    "ЗАМЕТКА": "NOTE",
    "ПРОВЕРКА": "CHECK-IN",
    "НА КАЖДЫЙ ДЕНЬ": "DAILY",
    "РЕФЛЕКСИЯ": "REFLECTION",
    "ПАУЗА": "PAUSE",
    "ГРАНИЦЫ": "BOUNDARIES",
    "ВОПРОС К СЕБЕ": "SELF-QUESTION",
    "ПАУЗА ДЛЯ МЫСЛИ": "THOUGHT PAUSE",
    "САМОПРОВЕРКА": "SELF-CHECK",
    "ЧЕСТНО?": "HONEST?",
    "ДНЕВНИК": "JOURNAL",
    "ВНУТРЕННИЙ ВЗГЛЯД": "INNER VIEW",
    "МИФ / ФАКТ": "MYTH / FACT",
    "ПЕРЕОСМЫСЛИТЬ": "RETHINK",
    "НОВЫЙ ВЗГЛЯД": "NEW VIEW",
    "НОВАЯ РАМКА": "NEW FRAME",
    "ВМЕСТО / ЛУЧШЕ": "INSTEAD / BETTER",
    "ЯСНЕЕ МЫСЛИТЬ": "CLEARER THINKING",
    "МИКРО-ПРИВЫЧКА": "MICRO-HABIT",
    "3 МИНУТЫ": "3 MINUTES",
    "МАЛЕНЬКИЙ ШАГ": "SMALL STEP",
    "СБРОС": "RESET",
    "СЕГОДНЯ": "TODAY",
    "МИНИ-ИНСТРУМЕНТ": "MINI-TOOL",
    "В ГОЛОВЕ": "IN YOUR HEAD",
    "ЭМОЦИЯ": "EMOTION",
    "ПСИХОЛОГИЯ": "PSYCHOLOGY",
    "ШАБЛОН МЫСЛИ": "THOUGHT PATTERN",
    "ТИХИЙ ВЫБОР": "QUIET CHOICE",
    "ОПОРА": "SUPPORT",
  },
  it: {
    "ЗАМЕТКА": "NOTA",
    "ПРОВЕРКА": "CHECK-IN",
    "НА КАЖДЫЙ ДЕНЬ": "OGNI GIORNO",
    "РЕФЛЕКСИЯ": "RIFLESSIONE",
    "ПАУЗА": "PAUSA",
    "ГРАНИЦЫ": "CONFINI",
    "ВОПРОС К СЕБЕ": "DOMANDA A TE",
    "ПАУЗА ДЛЯ МЫСЛИ": "PAUSA MENTALE",
    "САМОПРОВЕРКА": "AUTO-CHECK",
    "ЧЕСТНО?": "ONESTO?",
    "ДНЕВНИК": "DIARIO",
    "ВНУТРЕННИЙ ВЗГЛЯД": "SGUARDO INTERNO",
    "МИФ / ФАКТ": "MITO / FATTO",
    "ПЕРЕОСМЫСЛИТЬ": "RIPENSARE",
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
    "В ГОЛОВЕ": "NELLA TESTA",
    "ЭМОЦИЯ": "EMOZIONE",
    "ПСИХОЛОГИЯ": "PSICOLOGIA",
    "ШАБЛОН МЫСЛИ": "SCHEMA MENTALE",
    "ТИХИЙ ВЫБОР": "SCELTA CALMA",
    "ОПОРА": "APPOGGIO",
  },
  es: {
    "ЗАМЕТКА": "NOTA",
    "ПРОВЕРКА": "REVISIÓN",
    "НА КАЖДЫЙ ДЕНЬ": "CADA DÍA",
    "РЕФЛЕКСИЯ": "REFLEXIÓN",
    "ПАУЗА": "PAUSA",
    "ГРАНИЦЫ": "LÍMITES",
    "ВОПРОС К СЕБЕ": "PREGUNTA INTERNA",
    "ПАУЗА ДЛЯ МЫСЛИ": "PAUSA MENTAL",
    "САМОПРОВЕРКА": "AUTO-CHECK",
    "ЧЕСТНО?": "¿HONESTO?",
    "ДНЕВНИК": "DIARIO",
    "ВНУТРЕННИЙ ВЗГЛЯД": "MIRADA INTERIOR",
    "МИФ / ФАКТ": "MITO / HECHO",
    "ПЕРЕОСМЫСЛИТЬ": "REPENSAR",
    "НОВЫЙ ВЗГЛЯД": "NUEVA MIRADA",
    "НОВАЯ РАМКА": "NUEVO MARCO",
    "ВМЕСТО / ЛУЧШЕ": "EN VEZ / MEJOR",
    "ЯСНЕЕ МЫСЛИТЬ": "PENSAR CLARO",
    "МИКРО-ПРИВЫЧКА": "MICRO-HÁBITO",
    "3 МИНУТЫ": "3 MINUTOS",
    "МАЛЕНЬКИЙ ШАГ": "PASO PEQUEÑO",
    "СБРОС": "RESET",
    "СЕГОДНЯ": "HOY",
    "МИНИ-ИНСТРУМЕНТ": "MINI-HERRAMIENTA",
    "В ГОЛОВЕ": "EN LA CABEZA",
    "ЭМОЦИЯ": "EMOCIÓN",
    "ПСИХОЛОГИЯ": "PSICOLOGÍA",
    "ШАБЛОН МЫСЛИ": "PATRÓN MENTAL",
    "ТИХИЙ ВЫБОР": "ELECCIÓN CALMA",
    "ОПОРА": "APOYO",
  },
  fr: {
    "ЗАМЕТКА": "NOTE",
    "ПРОВЕРКА": "POINT PERSO",
    "НА КАЖДЫЙ ДЕНЬ": "AU QUOTIDIEN",
    "РЕФЛЕКСИЯ": "RÉFLEXION",
    "ПАУЗА": "PAUSE",
    "ГРАНИЦЫ": "LIMITES",
    "ВОПРОС К СЕБЕ": "QUESTION À SOI",
    "ПАУЗА ДЛЯ МЫСЛИ": "PAUSE MENTALE",
    "САМОПРОВЕРКА": "AUTO-CHECK",
    "ЧЕСТНО?": "HONNÊTE ?",
    "ДНЕВНИК": "JOURNAL",
    "ВНУТРЕННИЙ ВЗГЛЯД": "REGARD INTÉRIEUR",
    "МИФ / ФАКТ": "MYTHE / FAIT",
    "ПЕРЕОСМЫСЛИТЬ": "REPENSER",
    "НОВЫЙ ВЗГЛЯД": "NOUVEAU REGARD",
    "НОВАЯ РАМКА": "NOUVEAU CADRE",
    "ВМЕСТО / ЛУЧШЕ": "AU LIEU / MIEUX",
    "ЯСНЕЕ МЫСЛИТЬ": "PENSER CLAIR",
    "МИКРО-ПРИВЫЧКА": "MICRO-HABITUDE",
    "3 МИНУТЫ": "3 MINUTES",
    "МАЛЕНЬКИЙ ШАГ": "PETIT PAS",
    "СБРОС": "RESET",
    "СЕГОДНЯ": "AUJOURD'HUI",
    "МИНИ-ИНСТРУМЕНТ": "MINI-OUTIL",
    "В ГОЛОВЕ": "EN TÊTE",
    "ЭМОЦИЯ": "ÉMOTION",
    "ПСИХОЛОГИЯ": "PSYCHOLOGIE",
    "ШАБЛОН МЫСЛИ": "SCHÉMA MENTAL",
    "ТИХИЙ ВЫБОР": "CHOIX CALME",
    "ОПОРА": "APPUI",
  },
  pt: {
    "ЗАМЕТКА": "NOTA",
    "ПРОВЕРКА": "CHECK-IN",
    "НА КАЖДЫЙ ДЕНЬ": "TODO DIA",
    "РЕФЛЕКСИЯ": "REFLEXÃO",
    "ПАУЗА": "PAUSA",
    "ГРАНИЦЫ": "LIMITES",
    "ВОПРОС К СЕБЕ": "PERGUNTA INTERNA",
    "ПАУЗА ДЛЯ МЫСЛИ": "PAUSA MENTAL",
    "САМОПРОВЕРКА": "AUTO-CHECK",
    "ЧЕСТНО?": "HONESTO?",
    "ДНЕВНИК": "DIÁRIO",
    "ВНУТРЕННИЙ ВЗГЛЯД": "OLHAR INTERNO",
    "МИФ / ФАКТ": "MITO / FATO",
    "ПЕРЕОСМЫСЛИТЬ": "REPENSAR",
    "НОВЫЙ ВЗГЛЯД": "NOVO OLHAR",
    "НОВАЯ РАМКА": "NOVA MOLDURA",
    "ВМЕСТО / ЛУЧШЕ": "EM VEZ / MELHOR",
    "ЯСНЕЕ МЫСЛИТЬ": "PENSAR CLARO",
    "МИКРО-ПРИВЫЧКА": "MICRO-HÁBITO",
    "3 МИНУТЫ": "3 MINUTOS",
    "МАЛЕНЬКИЙ ШАГ": "PEQUENO PASSO",
    "СБРОС": "RESET",
    "СЕГОДНЯ": "HOJE",
    "МИНИ-ИНСТРУМЕНТ": "MINI-FERRAMENTA",
    "В ГОЛОВЕ": "NA CABEÇA",
    "ЭМОЦИЯ": "EMOÇÃO",
    "ПСИХОЛОГИЯ": "PSICOLOGIA",
    "ШАБЛОН МЫСЛИ": "PADRÃO MENTAL",
    "ТИХИЙ ВЫБОР": "ESCOLHA CALMA",
    "ОПОРА": "APOIO",
  },
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateFactRows(lang, rows, sourceRows) {
  assert(Array.isArray(rows), `${lang}: facts input is not an array`);
  assert(rows.length === sourceRows.length, `${lang}: expected ${sourceRows.length} facts, got ${rows.length}`);
  return rows.map((row, index) => {
    const source = sourceRows[index];
    assert(row && typeof row === "object", `${lang}: row ${index} is not an object`);
    assert(row.file === source.file, `${lang}: row ${index} file mismatch`);
    assert(row.series === source.series, `${lang}: row ${index} series mismatch`);
    assert(row.sourceDeck === "fact-en", `${lang}: row ${index} sourceDeck mismatch`);
    assert(Number(row.sourceIndex) === index, `${lang}: row ${index} sourceIndex mismatch`);
    assert(row.sourceTitle === source.title, `${lang}: row ${index} sourceTitle mismatch`);
    assert(row.sourceText === source.text, `${lang}: row ${index} sourceText mismatch`);
    assert(row.localization === lang, `${lang}: row ${index} localization mismatch`);
    assert(isNonEmptyString(row.title), `${lang}: row ${index} empty title`);
    assert(isNonEmptyString(row.text), `${lang}: row ${index} empty text`);
    return {
      file: source.file,
      title: row.title.trim(),
      text: row.text.trim(),
      series: source.series,
      sourceDeck: "fact-en",
      sourceIndex: index,
      sourceTitle: source.title,
      sourceText: source.text,
      localization: lang,
    };
  });
}

function importFacts() {
  const sourceRows = readJson(FACT_SOURCE);
  assert(Array.isArray(sourceRows), "source facts are not an array");
  for (const [lang, info] of Object.entries(FACT_LANGS)) {
    const input = resolve(INPUT_DIR, `fact-videos-${lang}.json`);
    const rows = validateFactRows(lang, readJson(input), sourceRows);
    const dir = resolve(ROOT, `data/fact-videos-${lang}`);
    writeJson(resolve(dir, "videos.json"), rows);
    writeJson(resolve(dir, "index.json"), {
      total: rows.length,
      packs: 1,
      packSize: rows.length,
      sourceDeck: "fact-en",
      localization: lang,
      mediaReuse: "source-footage",
    });
    writeJson(resolve(dir, "sources.json"), {
      generatedAt: CREATED_AT,
      deck: info.deck,
      sourceDeck: "fact-en",
      sourceFile: "data/fact-videos/videos.json",
      note: info.note,
      rights:
        "Uses existing local pre-built videos as source footage. Live generation rebuilds the selected video with localized overlay text and edge-tts voiceover instead of publishing the English audio/caption track.",
    });
    console.log(`facts ${lang}: ${rows.length} -> data/fact-videos-${lang}/videos.json`);
  }
}

function templateSuffix(name, fallback) {
  const parts = String(name || "").split("-");
  return parts.length > 3 ? parts.slice(3).join("-") : fallback;
}

function localizeTemplates(templates, lang) {
  const labels = TEMPLATE_LABELS[lang] || {};
  return templates.map((template, index) => {
    const copy = JSON.parse(JSON.stringify(template));
    copy.name = `psychology-${lang}-${String(index + 1).padStart(2, "0")}-${templateSuffix(copy.name, "card")}`;
    for (const el of copy.elements || []) {
      if (el.type === "image" && typeof el.src === "string") {
        el.src = el.src
          .replace("assets/template-packs/psychology-ru/backgrounds/", `assets/template-packs/psychology-${lang}/backgrounds/`)
          .replace("psychology-ru-bg-", `psychology-${lang}-bg-`);
      }
      if (typeof el.text === "string" && Object.prototype.hasOwnProperty.call(labels, el.text)) {
        el.text = labels[el.text];
      }
    }
    return copy;
  });
}

function validatePsychologyCards(lang, rows, baseCards) {
  assert(Array.isArray(rows), `${lang}: psychology input is not an array`);
  assert(rows.length === baseCards.length, `${lang}: expected ${baseCards.length} psychology cards, got ${rows.length}`);
  return rows.map((row, index) => {
    const source = baseCards[index];
    assert(row && typeof row === "object", `${lang}: card ${index} is not an object`);
    assert(Number(row.sourceIndex) === index, `${lang}: card ${index} sourceIndex mismatch`);
    assert(row.sourceTitle === source?.values?.title, `${lang}: card ${index} sourceTitle mismatch`);
    assert(JSON.stringify(row.sourceText) === JSON.stringify(source?.values?.text), `${lang}: card ${index} sourceText mismatch`);
    assert(row.localization === lang, `${lang}: card ${index} localization mismatch`);
    assert(isNonEmptyString(row.values?.title), `${lang}: card ${index} empty title`);
    assert(Array.isArray(row.values?.text) && row.values.text.every(isNonEmptyString), `${lang}: card ${index} invalid text`);
    return {
      values: {
        title: row.values.title.trim(),
        text: row.values.text.map((line) => line.trim()),
      },
      addedAt: CREATED_AT,
    };
  });
}

function copyPsychologyAssets(lang) {
  const sourceDir = resolve(ROOT, "assets/template-packs/psychology-ru/backgrounds");
  const targetRoot = resolve(ROOT, `assets/template-packs/psychology-${lang}`);
  const targetDir = resolve(targetRoot, "backgrounds");
  mkdirSync(targetDir, { recursive: true });
  const copied = [];
  for (const file of readdirSync(sourceDir).filter((name) => /^psychology-ru-bg-\d+\.jpg$/i.test(name)).sort()) {
    const targetFile = file.replace("psychology-ru-bg-", `psychology-${lang}-bg-`);
    copyFileSync(resolve(sourceDir, file), resolve(targetDir, targetFile));
    copied.push(`assets/template-packs/psychology-${lang}/backgrounds/${targetFile}`);
  }
  writeJson(resolve(targetRoot, "sources.json"), {
    updatedAt: CREATED_AT,
    status: "project_owned_ai_generated_backgrounds",
    tool: "built-in image generation",
    note:
      "Backgrounds are copied from the project-owned super-admin psychology background set and renamed for an independent localized psychology pack. This pack does not use MGS templates or MGS content. Assets contain no real or identifiable people/faces, logos, watermarks, or readable text; abstract side silhouettes are allowed only when they do not compete with text.",
    files: copied,
    rules: [
      "Do not use MGS packs/templates as a donor or fallback.",
      "Keep these assets as background imagery behind readable psychology cards.",
      "Do not add real/identifiable faces, logos, readable in-image text, social handles, or watermarks.",
      "Abstract silhouettes or interior figures are acceptable only when they are generic, non-identifiable, and outside the main text area.",
    ],
  });
  return copied.length;
}

function importPsychologyPacks() {
  const base = readJson(PSYCHOLOGY_BASE_PACK);
  assert(Array.isArray(base.templates) && base.templates.length > 0, "base psychology pack has no templates");
  assert(Array.isArray(base.cards) && base.cards.length > 0, "base psychology pack has no cards");
  for (const [lang, info] of Object.entries(PSYCHOLOGY_LANGS)) {
    const input = resolve(INPUT_DIR, `psychology-${lang}-cards.json`);
    const cards = validatePsychologyCards(lang, readJson(input), base.cards);
    const assetCount = copyPsychologyAssets(lang);
    const pack = {
      id: info.packId,
      owners: [1],
      createdBy: 1,
      name: info.name,
      lang,
      templates: localizeTemplates(base.templates, lang),
      cards,
      createdAt: CREATED_AT,
      grants: [],
    };
    writeJson(resolve(ROOT, "data/packs", `${info.packId}.json`), pack);
    console.log(`psychology ${lang}: templates=${pack.templates.length}, cards=${pack.cards.length}, assets=${assetCount}`);
  }
}

assert(existsSync(INPUT_DIR), `missing input dir: ${INPUT_DIR}`);
importFacts();
importPsychologyPacks();
console.log(`import complete from ${basename(INPUT_DIR)}`);

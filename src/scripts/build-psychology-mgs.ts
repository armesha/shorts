// Сборка ручного пака «психология mgs» (немецкий): 10 цветовых шаблонов в стиле примера
// (📌 + подсвеченный заголовок Inter + список-буллеты, равномерно заполняющий кадр) и 10 карточек.
// Пишет шаблоны/карточки в assets/template-packs/psychology-mgs/ и рендерит превью в data/output/.
// Запуск: node --import tsx src/scripts/build-psychology-mgs.ts
import puppeteer from "puppeteer-core";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromePath } from "../render.ts";
import { renderTemplateCard, type TemplateDoc } from "../template/render.ts";

// 10 уникальных цветовых тем (цвет маркера + фон + цвет тела). Заголовок всегда тёмный — он на ярком маркере.
const THEMES = [
  { key: "lime", hl: "#aaff00", bg: "#fefff5", ink: "#141414" },
  { key: "yellow", hl: "#ffe000", bg: "#fffdf0", ink: "#16140a" },
  { key: "pink", hl: "#ff8fc4", bg: "#fff5fa", ink: "#2a0f1d" },
  { key: "cyan", hl: "#5fe6f0", bg: "#eefdff", ink: "#06303a" },
  { key: "orange", hl: "#ffa63d", bg: "#fff8f0", ink: "#2a1500" },
  { key: "violet", hl: "#c3a0ff", bg: "#f8f5ff", ink: "#1e0d3a" },
  { key: "mint", hl: "#7bffb0", bg: "#f1fff7", ink: "#06301c" },
  { key: "sky", hl: "#85bcff", bg: "#f3f9ff", ink: "#07204a" },
  { key: "coral", hl: "#ff7d6e", bg: "#fff6f4", ink: "#2a0a06" },
  { key: "dark", hl: "#c6ff00", bg: "#16171b", ink: "#f1f1ec" }, // тёмная вариация
];

// Базовый шаблон стиля «психология mgs» под тему. Геометрия ≈ из document.json, масштаб ×2.667 → 1080×1920.
function makeTemplate(theme: (typeof THEMES)[number]): TemplateDoc {
  return {
    version: 1,
    name: `psychology-mgs-${theme.key}`,
    canvas: { w: 1080, h: 1920, bg: theme.bg },
    elements: [
      // 📌 — эмодзи-булавка слева сверху
      {
        id: "pin", type: "text", x: 70, y: 140, w: 130, h: 130, rot: 0,
        text: "📌", align: "left",
        font: { family: "Inter", size: 104, weight: 400, color: theme.ink, lineHeight: 1 },
      },
      // Заголовок — Inter 800, подсвечен маркером (плашка на каждой строке), подчёркнут, тёмный текст
      {
        id: "title", type: "killbox", x: 70, y: 290, w: 940, h: 340, rot: 0,
        role: "title", padX: 4, padY: 0, align: "left", valign: "top",
        font: { family: "Inter", size: 96, weight: 800, color: "#141414", lineHeight: 1.5 },
        fitMin: 54, fitMax: 108, maxChars: 52,
        highlight: theme.hl, underline: true,
        placeholder: "Заголовок",
      },
      // Тело — список-буллеты Inter, равномерно заполняет низ кадра
      {
        id: "body", type: "killbox", x: 84, y: 690, w: 912, h: 1150, rot: 0,
        role: "text", padX: 6, padY: 0, align: "left", valign: "top",
        font: { family: "Inter", size: 52, weight: 500, color: theme.ink, lineHeight: 1.5 },
        fitMin: 32, fitMax: 60, maxChars: 640, bullet: true,
        placeholder: "Список",
      },
    ],
  } as TemplateDoc;
}

// 10 немецких карточек (Du-форма): заголовок (2 строки) + список «признаков/ошибок».
const CARDS: Array<{ title: string; items: string[] }> = [
  { title: "Anzeichen versteckter Erschöpfung", items: [
    "Ständige Gereiztheit", "Kleinigkeiten überfordern dich", "Schlaf erholt dich nicht mehr",
    "Freude fühlt sich gedämpft an", "Du sagst Treffen immer öfter ab", "Konzentration fällt dir schwer",
    "Du vergisst alltägliche Dinge", "Dein Körper fühlt sich schwer an", "Du funktionierst nur noch",
    "Eine innere Leere bleibt", "Lärm überfordert dich schnell", "Selbst Hobbys strengen dich an",
    "Du hast kaum Geduld mit dir" ] },
  { title: "Stille Zeichen von innerem Stress", items: [
    "Verspannte Schultern und Kiefer", "Flache, schnelle Atmung", "Du grübelst nachts stundenlang",
    "Ständiges Gefühl von Eile", "Dein Appetit verändert sich", "Du kannst schlecht abschalten",
    "Kleine Geräusche nerven dich", "Dir fehlt die innere Ruhe", "Du vergisst zu essen und trinken",
    "Aufschieben trotz Zeitdruck", "Häufige Kopfschmerzen", "Entspannung fühlt sich falsch an" ] },
  { title: "Gewohnheiten, die Angst verstärken", items: [
    "Ständig Nachrichten checken", "Zu wenig Schlaf", "Alles im Kopf durchspielen",
    "Koffein am späten Nachmittag", "Gefühle ständig unterdrücken", "Sich mit anderen vergleichen",
    "Perfektionismus bei allem", "Hilfe nie annehmen", "Pausen als Faulheit sehen",
    "Probleme nur allein lösen", "Negatives immer wiederholen", "Bewegung komplett meiden",
    "Die Zukunft schwarzmalen" ] },
  { title: "Anzeichen emotionaler Reife", items: [
    "Du übernimmst Verantwortung", "Du entschuldigst dich ehrlich", "Kritik wirft dich nicht um",
    "Du setzt klare Grenzen", "Du hörst wirklich zu", "Gefühle benennen statt verdrängen",
    "Du musst nicht recht haben", "Geduld mit anderen", "Du reagierst, statt zu explodieren",
    "Du gönnst anderen Erfolg", "Fehler sind für dich normal", "Du bittest um Hilfe" ] },
  { title: "Fehler, die Selbstwert zerstören", items: [
    "Dich ständig vergleichen", "Auf jedem Fehler herumreiten", "Lob nicht annehmen können",
    "Dich nur über Leistung definieren", "Dauernd „Ja\" sagen", "Eigene Bedürfnisse ignorieren",
    "Toxische Menschen behalten", "Ein harter innerer Kritiker", "Erfolge sofort kleinreden",
    "Auf Bestätigung warten", "Alte Fehler nicht loslassen", "Dich für Gefühle schämen" ] },
  { title: "Zeichen, dass du eine Pause brauchst", items: [
    "Du bist ständig müde", "Nichts macht mehr Freude", "Du wirst schnell zynisch",
    "Einfache Aufgaben überfordern", "Du bist oft gereizt", "Schlaf hilft nicht mehr",
    "Du fühlst dich abgestumpft", "Konzentration bricht weg", "Dein Körper schmerzt",
    "Du zweifelst an allem", "Selbst Erholung stresst dich", "Du zählst nur bis Feierabend" ] },
  { title: "Toxische Denkmuster", items: [
    "„Alles oder nichts\"", "Gedanken lesen wollen", "Immer das Schlimmste annehmen",
    "Dich für alles verantwortlich fühlen", "Gefühle als Fakten sehen", "„Ich muss perfekt sein\"",
    "Positives ausblenden", "Ständige Vergleiche", "Dich selbst beschimpfen",
    "„Ich schaffe das nie\"", "Komplimente abwerten", "In Endlosschleifen grübeln" ] },
  { title: "Anzeichen emotionaler Intelligenz", items: [
    "Du erkennst deine Gefühle", "Du benennst sie genau", "Empathie für andere",
    "Du hörst aktiv zu", "Pause vor der Reaktion", "Du nimmst Kritik an",
    "Grenzen ohne Schuldgefühl", "Du liest Stimmungen im Raum", "Konflikte ruhig lösen",
    "Du fragst nach, statt zu urteilen", "Eigene Auslöser kennen", "Mitgefühl mit dir selbst" ] },
  { title: "Zeichen innerer Stärke", items: [
    "Du bittest um Hilfe", "Du sagst „Nein\" ohne Schuld", "Ruhe im Sturm bewahren",
    "Du gibst Fehler zu", "Geduld mit dem Prozess", "Du hältst Unsicherheit aus",
    "Du lebst deine Werte", "Du brauchst keine Bestätigung", "Nach Rückschlägen weitermachen",
    "Gefühle zulassen", "Allein sein können", "Du schützt deine Energie" ] },
  { title: "Anzeichen, dass du zu viel denkst", items: [
    "Du zerdenkst jede Entscheidung", "Einfache Fragen werden riesig", "Du planst Gespräche vorab",
    "„Was, wenn\" hört nie auf", "Du liest in alles etwas hinein", "Entscheidungen lähmen dich",
    "Du suchst versteckte Bedeutungen", "Schlaf durch Gedankenkreisen", "Du bereust Gesagtes lange",
    "Du suchst die perfekte Lösung", "Du analysierst jede Reaktion", "Du vertraust deinem Bauch nicht" ] },
];

const PACK_DIR = resolve("assets/template-packs/psychology-mgs");
const OUT_DIR = resolve("data/output/psychology-mgs");

async function main() {
  await mkdir(resolve(PACK_DIR, "templates"), { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  // карточки (контент по role) + манифест пака
  const cards = CARDS.map((c, i) => ({ id: i + 1, theme: THEMES[i].key, title: c.title, text: c.items }));
  await writeFile(resolve(PACK_DIR, "cards.json"), JSON.stringify(cards, null, 2) + "\n");

  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  try {
    for (let i = 0; i < CARDS.length; i++) {
      const theme = THEMES[i];
      const tpl = makeTemplate(theme);
      const nn = String(i + 1).padStart(2, "0");
      await writeFile(resolve(PACK_DIR, "templates", `${nn}-${theme.key}.json`), JSON.stringify(tpl, null, 2) + "\n");
      const out = resolve(OUT_DIR, `${nn}-${theme.key}.png`);
      const t0 = Date.now();
      await renderTemplateCard(tpl, { title: CARDS[i].title, text: CARDS[i].items }, out, browser);
      console.log(`${nn} ${theme.key.padEnd(7)} ${CARDS[i].title.slice(0, 34).padEnd(34)} ${Date.now() - t0}ms`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\nшаблоны → ${PACK_DIR}/templates/  карточки → ${PACK_DIR}/cards.json  превью → ${OUT_DIR}/`);
}
main();

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const OUT_DIR = resolve(ROOT, "data/packs");
const CREATED_AT = "2026-06-27T20:00:00.000Z";
const BACKGROUNDS = Array.from({ length: 15 }, (_, index) =>
  `assets/template-packs/motivation/backgrounds/motivation-bg-${String(index + 1).padStart(2, "0")}.jpg`,
);

const LOCALES = {
  en: {
    id: "motivation-en-superadmin",
    name: "Motivation",
    labels: ["FOCUS", "DISCIPLINE", "RESET", "GROWTH", "STRENGTH", "MINDSET"],
    titleNouns: [
      "Rules for a Stronger Mind",
      "Habits That Change Your Week",
      "Quiet Wins to Build Today",
      "Things to Stop Chasing",
      "Reminders for Hard Days",
      "Ways to Protect Your Focus",
      "Lessons That Make You Calmer",
      "Small Choices With Big Returns",
      "Rules for Self-Respect",
      "Signals You Are Getting Stronger",
      "Things Worth Doing Alone",
      "Habits of People Who Keep Going",
      "Promises to Make to Yourself",
      "Moves That Build Confidence",
      "Truths About Discipline",
    ],
    points: [
      "Keep one promise to yourself before you ask for more motivation.",
      "Do the useful thing while it is still small.",
      "Protect your mornings from noise, rushing and other people's urgency.",
      "Let discipline be quiet; you do not need to announce every change.",
      "Choose the habit that makes tomorrow easier, not the shortcut that makes today louder.",
      "Stop explaining your goals to people who only understand results.",
      "Rest before you collapse; consistency needs recovery, not drama.",
      "If the plan feels heavy, reduce it to the next ten minutes.",
      "Spend less energy proving yourself and more energy preparing yourself.",
      "Do not confuse attention with respect.",
      "Leave conversations that make you smaller just to keep peace.",
      "Train your attention like a muscle: short reps, every day.",
      "Save your best energy for work that actually moves your life.",
      "A slow clean step beats a perfect plan you never start.",
      "Stop negotiating with the version of you that wants to quit early.",
      "Make your room, calendar and phone support the person you are becoming.",
      "When your mood drops, keep the standard but lower the volume.",
      "The right people will not need you to shrink to stay close.",
      "Do one uncomfortable honest thing before the day ends.",
      "A private routine is stronger than a public promise.",
      "You do not need a new identity; you need repeated evidence.",
      "If it costs your peace every week, it is not a small problem.",
      "Let boredom do its job; focus often begins after the first boring minute.",
      "Stop collecting advice and start collecting completed reps.",
      "Your future will not be built by the loudest part of your day.",
      "Choose calm confidence over constant performance.",
      "Write the task down; your mind is for thinking, not storage.",
      "If you keep waiting to feel ready, readiness becomes another excuse.",
      "Say no early, before resentment starts writing the script.",
      "Make the next right action visible and easy to begin.",
      "Do not let one bad hour vote on the whole day.",
      "The habit is working even when nobody can see it yet.",
      "You can outgrow a pattern without hating who you were.",
      "Build a life that does not require applause to feel real.",
      "If you want self-respect, keep your own boundaries when nobody is watching.",
      "Your attention is a budget; spend it like it matters.",
      "Do the basic things with uncommon patience.",
      "A clean environment will not solve everything, but it removes one fight.",
      "When you feel behind, return to the process, not the panic.",
      "The person you become is mostly made of small repeated choices.",
      "Walk away from easy approval that costs long-term respect.",
      "Make progress boring enough to repeat.",
      "Let your actions be more specific than your excuses.",
      "You are allowed to improve without turning your life into a performance.",
      "Choose the conversation that clears the air, not the silence that stores pressure.",
      "Use envy as a signal, not a home.",
      "If it matters, schedule it before the day gets crowded.",
      "Keep the promise small enough that tired you can still keep it.",
      "Every reset counts when you return faster than before.",
      "Do not make permanent choices from temporary exhaustion.",
      "The strongest move is often to stop feeding the distraction.",
      "Treat your standards like a direction, not a weapon.",
      "Take the simple step until simple becomes powerful.",
      "You will trust yourself more when your actions stop surprising you.",
      "Stop asking comfort to approve your growth.",
      "Give your goals a place in the calendar, not just in your head.",
      "Confidence grows when evidence grows.",
      "If you cannot do the whole thing, do the honest version of it.",
      "The day changes when you stop giving your first hour away.",
      "Private discipline eventually becomes public clarity.",
    ],
  },
  ru: {
    id: "motivation-ru-superadmin",
    name: "Мотивация",
    labels: ["ФОКУС", "ДИСЦИПЛИНА", "СБРОС", "РОСТ", "СИЛА", "ХАРАКТЕР"],
    titleNouns: [
      "Правила сильного фокуса",
      "Привычки, которые меняют неделю",
      "Тихие победы на сегодня",
      "Вещи, за которыми пора перестать гнаться",
      "Напоминания для трудных дней",
      "Как защитить внимание",
      "Уроки, которые делают спокойнее",
      "Маленькие решения с большим эффектом",
      "Правила самоуважения",
      "Признаки, что ты становишься сильнее",
      "Что полезно делать в одиночку",
      "Привычки людей, которые не сдаются",
      "Обещания самому себе",
      "Шаги, которые дают уверенность",
      "Правда о дисциплине",
    ],
    points: [
      "Сначала сдержи одно обещание себе, потом проси больше мотивации.",
      "Сделай полезное, пока оно ещё маленькое.",
      "Защищай утро от шума, спешки и чужой срочности.",
      "Пусть дисциплина будет тихой; не каждое изменение нужно объявлять.",
      "Выбирай привычку, которая облегчит завтра, а не шумный короткий путь сегодня.",
      "Не объясняй цели тем, кто понимает только готовый результат.",
      "Отдыхай до срыва; постоянству нужен ресурс, а не драма.",
      "Если план тяжёлый, уменьши его до ближайших десяти минут.",
      "Меньше доказывай, больше готовься.",
      "Не путай внимание с уважением.",
      "Выходи из разговоров, где тебе нужно становиться меньше ради мира.",
      "Тренируй внимание как мышцу: коротко, но каждый день.",
      "Лучшие силы оставляй на то, что реально двигает жизнь.",
      "Медленный чистый шаг сильнее идеального плана без старта.",
      "Не торгуйся с той версией себя, которая хочет сдаться раньше времени.",
      "Сделай комнату, календарь и телефон союзниками нового себя.",
      "Когда настроение падает, сохраняй стандарт, но снизь громкость.",
      "Своим людям не нужно, чтобы ты уменьшался рядом с ними.",
      "Сделай одну неудобную честную вещь до конца дня.",
      "Приватная рутина сильнее публичного обещания.",
      "Тебе нужна не новая личность, а повторяющиеся доказательства.",
      "Если это каждую неделю забирает спокойствие, это не мелочь.",
      "Позволь скуке сделать работу: фокус часто приходит после первой скучной минуты.",
      "Хватит собирать советы, начни собирать выполненные повторения.",
      "Будущее не строится самой громкой частью дня.",
      "Выбирай спокойную уверенность вместо постоянного выступления.",
      "Запиши задачу; голова нужна для мышления, а не хранения.",
      "Если ждать готовности, готовность станет ещё одной отговоркой.",
      "Говори нет рано, пока раздражение не написало сценарий.",
      "Сделай следующий правильный шаг видимым и лёгким.",
      "Не позволяй одному плохому часу голосовать за весь день.",
      "Привычка работает даже тогда, когда её ещё никто не видит.",
      "Можно перерасти старый шаблон и не ненавидеть прежнего себя.",
      "Строй жизнь, которой не нужны аплодисменты, чтобы быть настоящей.",
      "Самоуважение растёт, когда ты держишь границы без зрителей.",
      "Внимание — это бюджет; трать его как важный ресурс.",
      "Делай базовые вещи с необычным терпением.",
      "Чистая среда не решит всё, но уберёт одну лишнюю борьбу.",
      "Когда кажется, что отстал, возвращайся к процессу, а не к панике.",
      "Человек, которым ты станешь, складывается из маленьких повторений.",
      "Уходи от лёгкого одобрения, которое стоит долгого уважения.",
      "Сделай прогресс достаточно простым, чтобы повторять.",
      "Пусть действия будут конкретнее оправданий.",
      "Можно расти, не превращая жизнь в спектакль.",
      "Выбирай разговор, который проясняет, а не молчание, которое копит давление.",
      "Используй зависть как сигнал, а не как дом.",
      "Если важно, поставь это в расписание до того, как день переполнится.",
      "Обещание должно быть таким маленьким, чтобы усталый ты всё равно смог его выполнить.",
      "Каждый сброс засчитан, если ты возвращаешься быстрее, чем раньше.",
      "Не принимай постоянные решения из временной усталости.",
      "Иногда сильнейший шаг — перестать кормить отвлечение.",
      "Относись к стандартам как к направлению, а не как к оружию.",
      "Повторяй простой шаг, пока простой не станет сильным.",
      "Ты начнёшь больше доверять себе, когда действия перестанут тебя удивлять.",
      "Не проси комфорт одобрить твой рост.",
      "Дай целям место в календаре, а не только в голове.",
      "Уверенность растёт там, где растут доказательства.",
      "Если не можешь сделать всё, сделай честную версию.",
      "День меняется, когда ты перестаёшь отдавать первый час.",
      "Личная дисциплина со временем становится видимой ясностью.",
    ],
  },
  de: {
    id: "motivation-de-superadmin",
    name: "Motivation",
    labels: ["FOKUS", "DISZIPLIN", "RESET", "WACHSTUM", "STÄRKE", "MINDSET"],
    titleNouns: [
      "Regeln für einen stärkeren Fokus",
      "Gewohnheiten, die deine Woche verändern",
      "Stille Siege für heute",
      "Dinge, denen du nicht mehr nachlaufen musst",
      "Erinnerungen für schwere Tage",
      "Wege, deinen Fokus zu schützen",
      "Lektionen, die ruhiger machen",
      "Kleine Entscheidungen mit großer Wirkung",
      "Regeln für Selbstrespekt",
      "Zeichen, dass du stärker wirst",
      "Dinge, die man allein tun sollte",
      "Gewohnheiten von Menschen, die weitermachen",
      "Versprechen an dich selbst",
      "Schritte, die Vertrauen aufbauen",
      "Wahrheiten über Disziplin",
    ],
    points: [
      "Halte zuerst ein kleines Versprechen an dich selbst.",
      "Tu das Nützliche, solange es noch klein ist.",
      "Schütze deinen Morgen vor Lärm, Eile und fremder Dringlichkeit.",
      "Disziplin darf leise sein; du musst nicht jede Veränderung ankündigen.",
      "Wähle die Gewohnheit, die morgen leichter macht, nicht den lauten Abkürzungsweg.",
      "Erkläre deine Ziele nicht Menschen, die nur fertige Ergebnisse verstehen.",
      "Ruh dich aus, bevor du zusammenklappst; Beständigkeit braucht Erholung.",
      "Wenn der Plan schwer wirkt, reduziere ihn auf die nächsten zehn Minuten.",
      "Verwende weniger Energie aufs Beweisen und mehr aufs Vorbereiten.",
      "Verwechsle Aufmerksamkeit nicht mit Respekt.",
      "Verlasse Gespräche, in denen du kleiner werden musst, um Frieden zu halten.",
      "Trainiere Aufmerksamkeit wie einen Muskel: kurz, aber täglich.",
      "Bewahre deine beste Energie für Arbeit auf, die dein Leben wirklich bewegt.",
      "Ein langsamer sauberer Schritt schlägt einen perfekten Plan ohne Start.",
      "Verhandle nicht mit der Version von dir, die zu früh aufgeben will.",
      "Mach Zimmer, Kalender und Handy zu Verbündeten deines nächsten Ichs.",
      "Wenn die Stimmung sinkt, halte den Standard, aber senke die Lautstärke.",
      "Die richtigen Menschen brauchen nicht, dass du dich kleiner machst.",
      "Tu heute eine unbequeme ehrliche Sache.",
      "Eine private Routine ist stärker als ein öffentliches Versprechen.",
      "Du brauchst keine neue Identität, sondern wiederholte Beweise.",
      "Wenn es jede Woche deinen Frieden kostet, ist es kein kleines Problem.",
      "Lass Langeweile arbeiten; Fokus beginnt oft nach der ersten langweiligen Minute.",
      "Sammle weniger Ratschläge und mehr erledigte Wiederholungen.",
      "Deine Zukunft entsteht nicht aus dem lautesten Teil deines Tages.",
      "Wähle ruhiges Vertrauen statt ständiger Selbstdarstellung.",
      "Schreib die Aufgabe auf; dein Kopf ist zum Denken da, nicht zum Speichern.",
      "Wenn du wartest, bis du dich bereit fühlst, wird Bereitschaft zur Ausrede.",
      "Sag früh Nein, bevor Ärger das Drehbuch schreibt.",
      "Mach den nächsten richtigen Schritt sichtbar und leicht.",
      "Lass eine schlechte Stunde nicht über den ganzen Tag abstimmen.",
      "Die Gewohnheit wirkt, auch wenn sie noch niemand sieht.",
      "Du darfst ein altes Muster hinter dir lassen, ohne dein früheres Ich zu hassen.",
      "Baue ein Leben, das keinen Applaus braucht, um echt zu sein.",
      "Selbstrespekt wächst, wenn du Grenzen auch ohne Publikum hältst.",
      "Aufmerksamkeit ist ein Budget; gib sie aus, als wäre sie wichtig.",
      "Tu die einfachen Dinge mit ungewöhnlicher Geduld.",
      "Eine klare Umgebung löst nicht alles, aber sie entfernt einen Kampf.",
      "Wenn du dich zurück fühlst, geh zum Prozess zurück, nicht zur Panik.",
      "Die Person, die du wirst, besteht aus kleinen wiederholten Entscheidungen.",
      "Geh weg von leichter Zustimmung, die langfristigen Respekt kostet.",
      "Mach Fortschritt schlicht genug, um ihn zu wiederholen.",
      "Lass deine Handlungen konkreter sein als deine Ausreden.",
      "Du darfst wachsen, ohne dein Leben zur Bühne zu machen.",
      "Wähle das Gespräch, das klärt, nicht das Schweigen, das Druck speichert.",
      "Nutze Neid als Signal, nicht als Zuhause.",
      "Wenn es wichtig ist, plane es ein, bevor der Tag voll wird.",
      "Das Versprechen muss klein genug sein, dass auch dein müdes Ich es halten kann.",
      "Jeder Neustart zählt, wenn du schneller zurückkommst als früher.",
      "Triff keine dauerhaften Entscheidungen aus vorübergehender Erschöpfung.",
      "Manchmal ist der stärkste Schritt, die Ablenkung nicht mehr zu füttern.",
      "Behandle Standards als Richtung, nicht als Waffe.",
      "Wiederhole den einfachen Schritt, bis einfach stark wird.",
      "Du vertraust dir mehr, wenn deine Handlungen dich nicht mehr überraschen.",
      "Bitte Komfort nicht um Erlaubnis für dein Wachstum.",
      "Gib deinen Zielen einen Platz im Kalender, nicht nur im Kopf.",
      "Vertrauen wächst, wenn Beweise wachsen.",
      "Wenn du nicht alles tun kannst, tu die ehrliche Version davon.",
      "Der Tag verändert sich, wenn du die erste Stunde nicht verschenkst.",
      "Private Disziplin wird irgendwann zu sichtbarer Klarheit.",
    ],
  },
};

function textElement(id, x, y, w, h, text, color, size, weight = 800, align = "left") {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    rot: 0,
    text,
    align,
    font: { family: "Inter", size, weight, color, lineHeight: 1.05 },
  };
}

function box(id, x, y, w, h, bg, opts = {}) {
  return {
    id,
    type: "text",
    x,
    y,
    w,
    h,
    rot: 0,
    text: "",
    align: "left",
    bg,
    border: opts.border ?? "none",
    radius: opts.radius ?? 0,
    shadow: opts.shadow ?? "none",
    font: { family: "Inter", size: 1, weight: 400, color: "#00000000", lineHeight: 1 },
  };
}

function image(id, src, opacity = 1) {
  return { id, type: "image", x: 0, y: 0, w: 1080, h: 1920, rot: 0, src, fit: "cover", opacity };
}

function killbox(id, role, x, y, w, h, opts = {}) {
  return {
    id,
    type: "killbox",
    x,
    y,
    w,
    h,
    rot: 0,
    role,
    padX: opts.padX ?? 0,
    padY: opts.padY ?? 0,
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    font: {
      family: "Inter",
      size: opts.size ?? 46,
      weight: opts.weight ?? 760,
      color: opts.color ?? "#ffffff",
      lineHeight: opts.lineHeight ?? 1.24,
    },
    fitMin: opts.fitMin ?? 26,
    fitMax: opts.fitMax ?? opts.size ?? 46,
    maxChars: opts.maxChars ?? 760,
    bullet: !!opts.bullet,
    placeholder: role,
    ...(opts.bg ? { bg: opts.bg } : {}),
    ...(opts.border ? { border: opts.border } : {}),
    ...(opts.radius ? { radius: opts.radius } : {}),
    ...(opts.shadow ? { shadow: opts.shadow } : {}),
    ...(opts.highlight ? { highlight: opts.highlight } : {}),
    ...(opts.underline ? { underline: true } : {}),
  };
}

const LAYOUTS = [
  { bg: 0, mode: "left", accent: "#ffe45c", overlay: "rgba(2,7,14,.54)" },
  { bg: 1, mode: "center", accent: "#ffd15c", overlay: "rgba(5,6,12,.58)" },
  { bg: 2, mode: "panel", accent: "#f7d256", overlay: "rgba(2,6,12,.48)" },
  { bg: 3, mode: "left", accent: "#ffc857", overlay: "rgba(0,0,0,.62)" },
  { bg: 4, mode: "bottom", accent: "#f7d76a", overlay: "rgba(3,7,13,.58)" },
  { bg: 5, mode: "center", accent: "#ffe26a", overlay: "rgba(2,8,9,.50)" },
  { bg: 6, mode: "left", accent: "#ffe670", overlay: "rgba(4,9,12,.56)" },
  { bg: 7, mode: "panel", accent: "#91d8ff", overlay: "rgba(1,5,12,.60)" },
  { bg: 8, mode: "bottom", accent: "#ffb86b", overlay: "rgba(9,5,3,.54)" },
  { bg: 9, mode: "left", accent: "#e6f0ff", overlay: "rgba(2,5,10,.56)" },
  { bg: 10, mode: "center", accent: "#ffc857", overlay: "rgba(0,0,0,.65)" },
  { bg: 11, mode: "panel", accent: "#bde0ff", overlay: "rgba(1,8,14,.60)" },
  { bg: 12, mode: "left", accent: "#fcefb4", overlay: "rgba(5,8,4,.50)" },
  { bg: 13, mode: "bottom", accent: "#ffd166", overlay: "rgba(2,8,12,.55)" },
  { bg: 14, mode: "center", accent: "#f5f7fb", overlay: "rgba(0,4,10,.62)" },
];

function templateFor(locale, layout, index) {
  const label = locale.labels[index % locale.labels.length];
  const bg = BACKGROUNDS[layout.bg];
  const common = [
    image("bg", bg),
    box("dark-overlay", 0, 0, 1080, 1920, layout.overlay),
    box(
      "edge-gradient",
      0,
      0,
      1080,
      1920,
      "linear-gradient(180deg, rgba(0,0,0,.28) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,.34) 100%)",
    ),
  ];

  if (layout.mode === "center") {
    return {
      version: 1,
      name: `motivation-${locale.id}-${String(index + 1).padStart(2, "0")}-center`,
      canvas: { w: 1080, h: 1920, bg: "#05070d" },
      elements: [
        ...common,
        textElement("label", 90, 186, 900, 54, label, layout.accent, 30, 850, "center"),
        killbox("title", "title", 102, 274, 876, 210, {
          size: 66,
          fitMin: 39,
          fitMax: 74,
          maxChars: 96,
          color: "#ffffff",
          weight: 870,
          lineHeight: 1.06,
          align: "center",
          highlight: "rgba(255,224,82,.22)",
        }),
        box("list-panel", 94, 560, 892, 898, "rgba(0,0,0,.25)", {
          border: "1px solid rgba(255,255,255,.14)",
          radius: 32,
          shadow: "0 28px 90px rgba(0,0,0,.34)",
        }),
        killbox("points", "points", 150, 628, 780, 760, {
          size: 45,
          fitMin: 27,
          fitMax: 49,
          maxChars: 780,
          color: "#ffffff",
          weight: 760,
          lineHeight: 1.27,
          align: "left",
        }),
      ],
    };
  }

  if (layout.mode === "panel") {
    return {
      version: 1,
      name: `motivation-${locale.id}-${String(index + 1).padStart(2, "0")}-panel`,
      canvas: { w: 1080, h: 1920, bg: "#05070d" },
      elements: [
        ...common,
        box("main-panel", 72, 158, 936, 1370, "rgba(5,8,14,.48)", {
          border: "1px solid rgba(255,255,255,.16)",
          radius: 38,
          shadow: "0 34px 110px rgba(0,0,0,.42)",
        }),
        textElement("label", 120, 218, 360, 48, label, layout.accent, 28, 850),
        box("accent-line", 120, 288, 260, 8, layout.accent, { radius: 8 }),
        killbox("title", "title", 120, 354, 828, 230, {
          size: 68,
          fitMin: 38,
          fitMax: 76,
          maxChars: 96,
          color: "#ffffff",
          weight: 870,
          lineHeight: 1.06,
        }),
        killbox("points", "points", 126, 668, 812, 710, {
          size: 44,
          fitMin: 27,
          fitMax: 49,
          maxChars: 780,
          color: "#f9fbff",
          weight: 760,
          lineHeight: 1.28,
        }),
      ],
    };
  }

  if (layout.mode === "bottom") {
    return {
      version: 1,
      name: `motivation-${locale.id}-${String(index + 1).padStart(2, "0")}-bottom`,
      canvas: { w: 1080, h: 1920, bg: "#05070d" },
      elements: [
        ...common,
        textElement("label", 86, 210, 420, 48, label, layout.accent, 28, 850),
        killbox("title", "title", 84, 302, 900, 220, {
          size: 66,
          fitMin: 38,
          fitMax: 74,
          maxChars: 96,
          color: "#ffffff",
          weight: 870,
          lineHeight: 1.07,
        }),
        box("bottom-panel", 58, 648, 964, 790, "rgba(0,0,0,.32)", {
          border: "1px solid rgba(255,255,255,.15)",
          radius: 28,
          shadow: "0 26px 88px rgba(0,0,0,.40)",
        }),
        killbox("points", "points", 104, 708, 872, 650, {
          size: 45,
          fitMin: 27,
          fitMax: 50,
          maxChars: 780,
          color: "#ffffff",
          weight: 760,
          lineHeight: 1.27,
        }),
      ],
    };
  }

  return {
    version: 1,
    name: `motivation-${locale.id}-${String(index + 1).padStart(2, "0")}-left`,
    canvas: { w: 1080, h: 1920, bg: "#05070d" },
    elements: [
      ...common,
      textElement("label", 74, 196, 390, 52, label, layout.accent, 30, 850),
      killbox("title", "title", 74, 300, 860, 220, {
        size: 68,
        fitMin: 39,
        fitMax: 76,
        maxChars: 96,
        color: layout.accent,
        weight: 870,
        lineHeight: 1.06,
      }),
      killbox("points", "points", 78, 610, 880, 760, {
        size: 45,
        fitMin: 27,
        fitMax: 50,
        maxChars: 780,
        color: "#ffffff",
        weight: 760,
        lineHeight: 1.28,
      }),
    ],
  };
}

function buildTemplates(locale) {
  return LAYOUTS.map((layout, index) => templateFor(locale, layout, index));
}

function pickPoints(pool, cardIndex, count) {
  const out = [];
  const used = new Set();
  let cursor = (cardIndex * 7) % pool.length;
  const step = 11 + (cardIndex % 5);
  for (let i = 0; i < count; i += 1) {
    let value = pool[cursor % pool.length];
    let guard = 0;
    while (used.has(value) && guard < pool.length) {
      cursor += 1;
      value = pool[cursor % pool.length];
      guard += 1;
    }
    used.add(value);
    out.push(`${i + 1}. ${value}`);
    cursor += step;
  }
  return out;
}

function buildCards(locale) {
  const cards = [];
  for (let i = 0; i < 300; i += 1) {
    const count = 5 + (i % 2);
    const baseTitle = locale.titleNouns[i % locale.titleNouns.length];
    const title = `${count} ${baseTitle}`;
    cards.push({
      values: {
        title,
        points: pickPoints(locale.points, i, count),
      },
      addedAt: CREATED_AT,
    });
  }
  return cards;
}

function buildPack(locale) {
  return {
    id: locale.id,
    owners: [1],
    createdBy: 1,
    name: locale.name,
    lang: Object.entries(LOCALES).find(([, value]) => value.id === locale.id)?.[0] ?? "en",
    templates: buildTemplates(locale),
    cards: buildCards(locale),
    createdAt: CREATED_AT,
    grants: [],
    rightsLedger: {
      status: "project_owned_original_text_ai_generated_backgrounds",
      note: "Original project-written motivational list cards. Backgrounds are OpenAI-generated cinematic assets stored under assets/template-packs/motivation/backgrounds. No copied quotes, social handles, logos, AP/news imagery, or channel plaques.",
      sourceLedger: "assets/template-packs/motivation/sources.json",
      audioLedger: "assets/audio/motivation/README.md",
      rules: [
        "Do not add real-person attributed quotes without a source and rights ledger.",
        "Avoid gender hostility, protected-class insults, politics, sexual content, violence, medical claims, and guaranteed success promises.",
        "Keep text short enough for mobile readability.",
      ],
    },
  };
}

mkdirSync(OUT_DIR, { recursive: true });
for (const locale of Object.values(LOCALES)) {
  const pack = buildPack(locale);
  const file = resolve(OUT_DIR, `${pack.id}.json`);
  writeFileSync(file, `${JSON.stringify(pack, null, 2)}\n`);
  console.log(`${pack.id}: templates=${pack.templates.length} cards=${pack.cards.length} -> ${file}`);
}

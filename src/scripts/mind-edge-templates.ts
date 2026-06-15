// Общий билдер шаблонов кастомного пака «The Mind Edge» (тёмная психология, EN-аудитория).
// 6 тёмных фонов (assets/backgrounds/the-mind-edge), графика/лого — в нижней трети, поэтому
// текстовая safe-зона = верхние ~60% холста (y≈220..1160). Каждый шаблон вшивает свой фон в
// canvas.bg как CSS background-shorthand с data-URL (работает и в редакторе, и в мосте рендера,
// см. src/template/render.ts — setContent без base URL, поэтому только data-URL надёжен).
//
// Структура карточки: { title: hook-строка (cyan, жирная), text: тело (светло-серое, проза) }.
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { PackTemplate } from "../packs/store.ts";

const BG_DIR = resolve(process.cwd(), "assets/backgrounds/the-mind-edge");
const CYAN = "#2db4f0"; // фирменный голубой логотипа
const BODY = "#d9e0e8"; // светло-серый для тела

function bgDataUrl(file: string): string {
  const b64 = readFileSync(resolve(BG_DIR, file)).toString("base64");
  return `url(data:image/jpeg;base64,${b64}) center/cover no-repeat, #05070d`;
}

// Низ текстовой зоны (y) для КАЖДОГО фона — чуть выше его графики/лого, чтобы тело тянулось вниз и
// заполняло пустоту, но не наезжало на декор. Выверено рендером (mind-edge-fill-calib.ts).
const BODY_Y = 560;
const BODY_BOTTOM: Record<string, number> = {
  "01-eye.jpg": 1250, // глаз ~y1290
  "02-constellation.jpg": 1210, // сеть созвездия начинается выше всех (~y1245)
  "03-grid.jpg": 1340, // горизонт-сетка низко (~y1380) → тела больше всего
  "04-circles.jpg": 1245, // «цветок» кругов ~y1275
  "05-frame.jpg": 1310, // разделитель рамки ~y1357
  "06-glow.jpg": 1345, // только мягкое свечение, жёсткой графики нет
};

function makeTemplate(file: string): PackTemplate {
  const name = "mind-edge-" + file.replace(/\.jpg$/, "");
  const bodyH = (BODY_BOTTOM[file] ?? 1230) - BODY_Y;
  return {
    version: 1,
    name,
    canvas: { w: 1080, h: 1920, bg: bgDataUrl(file) },
    elements: [
      {
        id: "title",
        type: "killbox",
        x: 90,
        y: 230,
        w: 900,
        h: 330,
        rot: 0,
        role: "title",
        padX: 4,
        padY: 0,
        align: "left",
        valign: "top",
        font: { family: "Inter", size: 96, weight: 800, color: CYAN, lineHeight: 1.12 },
        fitMin: 58,
        fitMax: 112,
        maxChars: 90,
        placeholder: "Hook",
      },
      {
        id: "body",
        type: "killbox",
        x: 90,
        y: BODY_Y,
        w: 900,
        h: bodyH, // высота под каждый фон (BODY_BOTTOM) — тело заполняет пустоту до графики
        rot: 0,
        role: "text",
        padX: 6,
        padY: 0,
        align: "left",
        valign: "top",
        font: { family: "Inter", size: 64, weight: 500, color: BODY, lineHeight: 1.42 },
        fitMin: 38,
        fitMax: 80, // авто-подгон РАСТЁТ под высоту бокса → тот же текст крупнее и заполняет место
        minChars: 320,
        maxChars: 470, // потолок-обрезка «…»; 460 влезает даже в самый низкий бокс при fitMin
        placeholder: "Body",
      },
    ],
  } as PackTemplate;
}

/** 6 шаблонов (по фону на каждый), отсортированы по имени файла. */
export function buildTemplates(): PackTemplate[] {
  return readdirSync(BG_DIR)
    .filter((f) => f.endsWith(".jpg"))
    .sort()
    .map(makeTemplate);
}

/** Пробные карточки для проверки влезаемости текста (≈300–450 симв. тело). */
export const SAMPLE_CARDS: Array<{ title: string; text: string }> = [
  {
    title: "Why confident liars get believed",
    text: "Confidence reads as competence. When someone speaks without a pause, your brain skips the fact-check and assumes they must know. Liars use this: they don't add proof, they remove your doubt. So separate two things that feel identical — how sure someone sounds, and whether what they say is actually true.",
  },
  {
    title: "The favor that buys you",
    text: "When someone does you a small unexpected favor, you feel a quiet pressure to repay it. That's reciprocity, and manipulators trigger it on purpose — a gift, a compliment, a tiny concession — so that saying no later feels rude. The move isn't to refuse kindness. It's to notice when a favor arrives right before a request.",
  },
  {
    title: "Silence makes people talk",
    text: "Most people can't stand a gap in conversation, so they fill it — often with the thing they meant to hide. Skilled interrogators and negotiators know this: after an answer, they just wait. The pause feels like doubt, and the other person rushes to explain. Learn to sit in silence and you'll hear what wasn't meant to be said.",
  },
  {
    title: "You copy who you fear",
    text: "Under pressure, people unconsciously mirror the body language of whoever holds power in the room — posture, pace, even word choice. It's the brain trying to stay safe by blending in. Watch a meeting and you'll spot the real authority instantly: everyone else is quietly syncing to them, not the other way around.",
  },
  {
    title: "Anger is often a mask",
    text: "Loud anger usually hides something softer underneath — fear, shame, or hurt that feels too exposing to show. People attack because vulnerability feels dangerous. When someone explodes, the useful question isn't 'why are they so aggressive' but 'what are they protecting'. Answer that and the conflict often dissolves.",
  },
  {
    title: "The foot in the door",
    text: "Get someone to agree to something tiny, and a bigger yes becomes far easier later. Once people commit to a small action, they quietly rewrite their self-image to match it — and stay consistent. Salespeople and recruiters lean on this hard. Notice the small, harmless first ask; it's often training you for the real one.",
  },
  {
    title: "People reveal themselves in how they treat the powerless",
    text: "Anyone can be charming to someone useful to them. Watch instead how a person treats a waiter, an intern, or a stranger who can do nothing for them. That's where the real character leaks out. Charm aimed upward is a strategy; kindness aimed downward, with nothing to gain, is who they actually are.",
  },
  {
    title: "Why guilt-trips work on good people",
    text: "Guilt-tripping targets your empathy, not your logic. The manipulator frames their problem as something you caused or must fix, so saying no feels like cruelty. Healthy people feel the pull hardest — that's exactly why they're chosen. You can care about someone and still refuse to be responsible for feelings you didn't create.",
  },
];

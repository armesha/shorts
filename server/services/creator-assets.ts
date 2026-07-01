import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { PackTemplate } from "../../src/packs/store.ts";
import { listAudio } from "../../src/video.ts";
import { musicNameFromFile } from "./pack-audio.ts";

export const COMMERCIAL_CREATOR_FEATURE = "commercial-creator";

export interface CreatorPreset {
  id: string;
  name: string;
  templateType: string;
  lang: string;
  templates: PackTemplate[];
  sample: Record<string, string | string[]>;
}

export interface CreatorAsset {
  id: string;
  name: string;
  type: "background" | "motion" | "music";
  group?: string;
  groupName?: string;
  src?: string;
  url?: string;
}

function textTemplate(opts: {
  name: string;
  type: string;
  bg: string;
  accent: string;
  panel: string;
  titleMax: number;
  bodyRole?: string;
  bodyMax: number;
  bullet?: boolean;
}): PackTemplate {
  const bodyRole = opts.bodyRole ?? "text";
  return {
    version: 2,
    name: opts.name,
    canvas: { w: 1080, h: 1920, bg: "#ffffff" },
    elements: [
      { id: "background", type: "image", x: 0, y: 0, w: 1080, h: 1920, rot: 0, src: opts.bg, fit: "cover" },
      {
        id: "veil",
        type: "text",
        x: 0,
        y: 0,
        w: 1080,
        h: 1920,
        rot: 0,
        text: "",
        align: "left",
        bg: "rgba(8,10,16,.34)",
        font: { family: "Inter", size: 1, weight: 400, color: "#ffffff", lineHeight: 1 },
      },
      {
        id: "panel",
        type: "text",
        x: 82,
        y: 274,
        w: 916,
        h: 1150,
        rot: 0,
        text: "",
        align: "left",
        bg: opts.panel,
        border: "1px solid rgba(255,255,255,.55)",
        radius: 7,
        shadow: "0 28px 90px rgba(0,0,0,.24)",
        font: { family: "Inter", size: 1, weight: 400, color: "#111111", lineHeight: 1 },
      },
      {
        id: "title",
        type: "killbox",
        x: 138,
        y: 432,
        w: 804,
        h: 142,
        rot: 0,
        role: "title",
        padX: 0,
        padY: 0,
        align: "left",
        valign: "top",
        font: { family: "Inter", size: 58, weight: 900, color: "#111827", lineHeight: 1.05 },
        fitMin: 34,
        fitMax: 58,
        maxChars: opts.titleMax,
        placeholder: "title",
      },
      {
        id: "body",
        type: "killbox",
        x: 138,
        y: 620,
        w: 804,
        h: 630,
        rot: 0,
        role: bodyRole,
        padX: 0,
        padY: 0,
        align: "left",
        valign: opts.bullet ? "top" : "center",
        bullet: !!opts.bullet,
        font: { family: "Inter", size: 43, weight: 720, color: "#111827", lineHeight: opts.bullet ? 1.18 : 1.2 },
        fitMin: 27,
        fitMax: 43,
        maxChars: opts.bodyMax,
        placeholder: bodyRole,
      },
      {
        id: "source",
        type: "killbox",
        x: 138,
        y: 1284,
        w: 804,
        h: 44,
        rot: 0,
        role: "source",
        padX: 0,
        padY: 0,
        align: "left",
        valign: "center",
        font: { family: "Inter", size: 28, weight: 700, color: opts.accent, lineHeight: 1.05 },
        fitMin: 18,
        fitMax: 28,
        maxChars: 48,
        placeholder: "source",
      },
    ],
  };
}

function fromExistingPacks(): CreatorPreset[] {
  const rows: CreatorPreset[] = [];
  const dataPackCandidates: Array<{ file: string; id: string; name: string; templateType: string; lang: string }> = [
    { file: "data/packs/static-facts-ru-superadmin.json", id: "static-facts-ru", name: "Факты RU", templateType: "facts", lang: "ru" },
    { file: "data/packs/motivation-ru-superadmin.json", id: "motivation-ru", name: "Мотивация RU", templateType: "motivation", lang: "ru" },
    { file: "data/packs/psychology-ru-superadmin.json", id: "psychology-ru", name: "Психология RU", templateType: "psychology", lang: "ru" },
    { file: "data/packs/chistes-es-public-domain.json", id: "jokes-es", name: "Анекдоты ES", templateType: "jokes", lang: "es" },
    { file: "data/packs/curiosaurs-english-facts-mqgt20em.json", id: "kids-facts-en", name: "Kids Facts EN", templateType: "facts", lang: "en" },
  ];
  for (const candidate of dataPackCandidates) {
    const abs = resolve(process.cwd(), candidate.file);
    if (!existsSync(abs)) continue;
    try {
      const pack = JSON.parse(readFileSync(abs, "utf8")) as { templates?: PackTemplate[]; cards?: Array<{ values?: Record<string, string | string[]> }> };
      const templates = (pack.templates ?? []).slice(0, 6);
      if (!templates.length) continue;
      rows.push({
        id: candidate.id,
        name: candidate.name,
        templateType: candidate.templateType,
        lang: candidate.lang,
        templates,
        sample: pack.cards?.[0]?.values ?? sampleForType(candidate.templateType),
      });
    } catch {
      /* optional local packs may be absent or stale */
    }
  }
  return rows;
}

function sampleForType(type: string): Record<string, string | string[]> {
  if (type === "memes") {
    return {
      title: "Когда сказал: «сейчас быстро»",
      text: "и через три часа всё ещё выбираешь идеальный фон",
      source: "мем",
    };
  }
  if (type === "motivation") {
    return { title: "Три правила спокойного дня", points: ["Начни с малого", "Убери лишний шум", "Заверши одно дело"], source: "сервисный шаблон" };
  }
  if (type === "psychology") {
    return { title: "Признаки усталости", text: ["Раздражают мелочи", "Сложно начать", "Нужна пауза"], source: "сервисный шаблон" };
  }
  if (type === "facts") {
    return { title: "Короткий факт", text: "Человеческий мозг лучше запоминает истории, чем сухие списки.", source: "сервисный шаблон" };
  }
  return { title: "Короткий анекдот", text: "Сначала герой всё понял неправильно. Потом оказалось, что именно это и было самым смешным.", source: "сервисный шаблон" };
}

export function creatorPresets(): CreatorPreset[] {
  const fromPacks = fromExistingPacks();
  const builtIn: CreatorPreset[] = [
    {
      id: "meme-reaction-ru",
      name: "Мемный фон",
      templateType: "memes",
      lang: "ru",
      templates: [
        textTemplate({
          name: "creator-meme-reaction-ru",
          type: "memes",
          bg: "assets/template-packs/creator-clean-backgrounds/meme-image.png",
          accent: "#ea580c",
          panel: "rgba(255,255,255,.88)",
          titleMax: 72,
          bodyMax: 420,
        }),
      ],
      sample: sampleForType("memes"),
    },
    {
      id: "joke-short-ru",
      name: "Анекдот короткий",
      templateType: "jokes",
      lang: "ru",
      templates: [
        textTemplate({
          name: "creator-joke-short-ru",
          type: "jokes",
          bg: "assets/template-packs/creator-clean-backgrounds/joke-image.png",
          accent: "#b45309",
          panel: "rgba(255,250,239,.86)",
          titleMax: 72,
          bodyMax: 520,
        }),
      ],
      sample: {
        title: "Встречаются два друга",
        text: "— Ты почему такой довольный?\n— Нашёл кнопку «сделать красиво».\n— И где она?\n— Пока ищу.",
        source: "анекдот",
        cta: "ещё",
      },
    },
    {
      id: "motivation-daily-en",
      name: "English motivation",
      templateType: "motivation",
      lang: "en",
      templates: [
        textTemplate({
          name: "creator-motivation-daily-en",
          type: "motivation",
          bg: "assets/template-packs/creator-clean-backgrounds/motivation-image.png",
          accent: "#15803d",
          panel: "rgba(248,250,252,.90)",
          titleMax: 68,
          bodyRole: "points",
          bodyMax: 650,
          bullet: true,
        }),
      ],
      sample: {
        title: "Keep moving",
        points: ["Small steps count", "Quiet focus wins", "Finish one thing today"],
        source: "daily drive",
        cta: "Start now",
      },
    },
  ];
  const seen = new Set<string>();
  return [...builtIn, ...fromPacks].filter((preset) => {
    if (seen.has(preset.id)) return false;
    seen.add(preset.id);
    return true;
  });
}

export function creatorPresetById(id: string): CreatorPreset | null {
  return creatorPresets().find((preset) => preset.id === id) ?? null;
}

function listFiles(baseRel: string, exts: RegExp, limit: number): CreatorAsset[] {
  const base = resolve(process.cwd(), baseRel);
  if (!existsSync(base)) return [];
  return readdirSync(base, { recursive: true })
    .map((f) => f.toString().replace(/\\/g, "/"))
    .filter((f) => exts.test(extname(f)))
    .sort()
    .slice(0, limit)
    .map((file) => ({
      id: `${baseRel}/${file}`,
      name: file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "),
      type: "background" as const,
      src: `${baseRel}/${file}`,
    }));
}

export function creatorBackgrounds(): CreatorAsset[] {
  return [
    ...listFiles("assets/template-packs/static-facts/backgrounds", /\.(png|jpe?g|webp|svg)$/i, 16),
    ...listFiles("assets/template-packs/motivation/backgrounds", /\.(png|jpe?g|webp|svg)$/i, 16),
    ...listFiles("assets/template-packs/spanish-jokes/backgrounds", /\.(png|jpe?g|webp|svg)$/i, 16),
    ...listFiles("assets/template-packs/curiosaurs-english/backgrounds", /\.(png|jpe?g|webp|svg)$/i, 12),
  ];
}

export function creatorMotionOverlays(): CreatorAsset[] {
  const baseRel = "assets/creator/motion";
  const base = resolve(process.cwd(), baseRel);
  if (!existsSync(base)) return [];
  const groups: Record<string, { id: string; name: string }> = {
    reaction: { id: "reaction", name: "Реакции" },
    meme: { id: "meme", name: "Мемы" },
    gesture: { id: "gesture", name: "Жесты" },
    love: { id: "love", name: "Любовь" },
  };
  const groupOrder = ["reaction", "meme", "gesture", "love"];
  const fileOrder = [
    "reaction-joy.gif",
    "reaction-rofl.gif",
    "reaction-laughing.gif",
    "reaction-grin-sweat.gif",
    "reaction-grin.gif",
    "reaction-smile.gif",
    "reaction-sunglasses.gif",
    "reaction-thinking.gif",
    "reaction-mouth-open.gif",
    "reaction-melting.gif",
    "reaction-loudly-crying.gif",
    "reaction-screaming.gif",
    "reaction-mind-blown.gif",
    "reaction-skull.gif",
    "reaction-poop.gif",
    "meme-star-struck.gif",
    "meme-partying-face.gif",
    "meme-fire.gif",
    "meme-100.gif",
    "meme-sparkles.gif",
    "meme-party-popper.gif",
    "meme-rocket.gif",
    "gesture-thumbs-up.gif",
    "gesture-thumbs-down.gif",
    "gesture-clap.gif",
    "gesture-raising-hands.gif",
    "gesture-ok.gif",
    "gesture-heart-hands.gif",
    "love-heart-eyes.gif",
    "love-heart-face.gif",
    "love-red-heart.gif",
    "love-sparkling-heart.gif",
    "love-growing-heart.gif",
  ];
  const names: Record<string, string> = {
    "reaction-joy.gif": "Смех до слез",
    "reaction-rofl.gif": "Катается от смеха",
    "reaction-laughing.gif": "Смеется",
    "reaction-grin-sweat.gif": "Смеется с потом",
    "reaction-grin.gif": "Широкая улыбка",
    "reaction-smile.gif": "Улыбка",
    "reaction-sunglasses.gif": "Круто",
    "reaction-thinking.gif": "Думает",
    "reaction-mouth-open.gif": "Удивление",
    "reaction-melting.gif": "Растаял",
    "reaction-loudly-crying.gif": "Плачет",
    "reaction-screaming.gif": "Шок",
    "reaction-mind-blown.gif": "Взрыв мозга",
    "reaction-skull.gif": "Смешно до смерти",
    "reaction-poop.gif": "Ну такое",
    "meme-star-struck.gif": "В восторге",
    "meme-partying-face.gif": "Праздник",
    "meme-fire.gif": "Огонь",
    "meme-100.gif": "Сто процентов",
    "meme-sparkles.gif": "Искры",
    "meme-party-popper.gif": "Конфетти",
    "meme-rocket.gif": "Ракета",
    "gesture-thumbs-up.gif": "Лайк",
    "gesture-thumbs-down.gif": "Дизлайк",
    "gesture-clap.gif": "Аплодисменты",
    "gesture-raising-hands.gif": "Руки вверх",
    "gesture-ok.gif": "Окей",
    "gesture-heart-hands.gif": "Сердце руками",
    "love-heart-eyes.gif": "Глаза-сердца",
    "love-heart-face.gif": "Влюблен",
    "love-red-heart.gif": "Сердце",
    "love-sparkling-heart.gif": "Сияющее сердце",
    "love-growing-heart.gif": "Растущее сердце",
  };
  const groupFor = (file: string) => {
    const key = Object.keys(groups).find((prefix) => file.startsWith(`${prefix}-`)) ?? "reaction";
    return groups[key] ?? groups.reaction;
  };
  return readdirSync(base)
    .map((f) => f.toString())
    .filter((f) => /\.gif$/i.test(f))
    .sort((a, b) => {
      const groupA = groupFor(a).id;
      const groupB = groupFor(b).id;
      const orderA = groupOrder.indexOf(groupA);
      const orderB = groupOrder.indexOf(groupB);
      const fileOrderA = fileOrder.indexOf(a);
      const fileOrderB = fileOrder.indexOf(b);
      return (orderA === -1 ? 99 : orderA) - (orderB === -1 ? 99 : orderB)
        || (fileOrderA === -1 ? 999 : fileOrderA) - (fileOrderB === -1 ? 999 : fileOrderB)
        || a.localeCompare(b);
    })
    .map((file) => {
      const group = groupFor(file);
      return {
        id: file,
        name: names[file] ?? file.replace(/\.gif$/i, "").replace(/[-_]+/g, " "),
        type: "motion" as const,
        group: group.id,
        groupName: group.name,
        src: `${baseRel}/${file}`,
      };
    });
}

export function creatorMusicTracks(): CreatorAsset[] {
  const fromAudioDir = (dir: string, limit: number) => {
    const abs = resolve(process.cwd(), "assets/audio", dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs)
      .map((file) => file.toString())
      .filter((file) => /\.(mp3|m4a|aac|wav|ogg|opus)$/i.test(file))
      .sort()
      .slice(0, limit)
      .map((file) => `${dir}/${file}`);
  };
  const tracks = [...new Set([
    ...fromAudioDir("anekdoty", 20),
    ...fromAudioDir("memes", 80),
    ...fromAudioDir("motivation", 30),
    ...listAudio().slice(0, 20),
  ])];
  return tracks
    .filter((id) => existsSync(resolve(process.cwd(), "assets/audio", id)))
    .map((id) => ({ id, name: musicNameFromFile(id), type: "music" as const, url: `/audio/${id.split("/").map(encodeURIComponent).join("/")}` }));
}

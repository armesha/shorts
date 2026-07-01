import type { TemplatePreset, TextBoxRect, TextLayout, TextStyle } from "./types";

export const FALLBACK_PRESETS: TemplatePreset[] = [
  {
    id: "meme-reaction-ru",
    label: "Мемный фон",
    templateType: "memes",
    lang: "ru",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/meme-image.png",
    templates: [],
    defaults: {
      badge: "мем",
      heading: "Когда сказал: «сейчас быстро»",
      body: "и через три часа всё ещё выбираешь идеальный фон",
      text: "",
      cta: "жиза",
    },
  },
  {
    id: "joke-short-ru",
    label: "Анекдот короткий",
    templateType: "jokes",
    lang: "ru",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/joke-image.png",
    templates: [],
    defaults: {
      badge: "анекдот",
      heading: "Встречаются два друга",
      body: "— Ты почему такой довольный?\n— Нашёл кнопку «сделать красиво».\n— И где она?\n— Пока ищу.",
      text: "",
      cta: "ещё",
    },
  },
  {
    id: "motivation-daily-en",
    label: "English motivation",
    templateType: "motivation",
    lang: "en",
    previewSrc: "assets/template-packs/creator-clean-backgrounds/motivation-image.png",
    templates: [],
    defaults: {
      badge: "daily drive",
      heading: "Keep moving",
      body: "Small steps count\nQuiet focus wins\nFinish one thing today",
      text: "",
      cta: "Start now",
    },
  },
];

export const CHAR_LIMITS = {
  heading: 72,
  body: 300,
};

export const TEMPLATE_W = 1080;
export const TEMPLATE_H = 1920;

export const DEFAULT_TEXT_LAYOUT: TextLayout = {
  heading: { x: 116, y: 420, w: 848, h: 180 },
  body: { x: 116, y: 660, w: 848, h: 560 },
};

export const DEFAULT_STICKER_BOX: TextBoxRect = { x: 776, y: 1180, w: 160, h: 160 };
export const DEFAULT_MOTION_BOX: TextBoxRect = { x: 736, y: 1240, w: 220, h: 220 };

export const DEFAULT_TEXT_STYLE: TextStyle = {
  color: "#111827",
  outline: "#ffffff",
  background: 44,
};

export const TEXT_COLOR_CHOICES = ["#111827", "#ffffff", "#facc15", "#ef4444", "#2563eb"];
export const OUTLINE_COLOR_CHOICES = ["none", "#111827", "#ffffff"];
export const MOVEABLE_CLASS_NAME = "creator-moveable";

export const EMOJI_GROUPS = [
  {
    id: "reactions",
    labelKey: "creator.emojiGroupReactions",
    icon: "😂",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑", "😶", "🫥", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "😎", "🥸", "🥳", "😳", "🥺", "🥹", "😱", "😭"],
  },
  {
    id: "hands",
    labelKey: "creator.emojiGroupHands",
    icon: "👍",
    emojis: ["👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦶", "👂", "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁️", "👅", "👄", "🫦", "👶", "🧒", "👦", "👧", "🧑", "👱", "👨", "🧔", "👩", "🧓", "👴", "👵", "🙍", "🙎", "🙅", "🙆", "💁", "🙋", "🧏", "🙇", "🤦", "🤷", "🫶", "🤌", "👌", "🤏", "✌️", "🤞", "🫰", "🤟", "🤘", "🤙", "👋", "☝️", "👇", "👉", "👈"],
  },
  {
    id: "memes",
    labelKey: "creator.emojiGroupMemes",
    icon: "🔥",
    emojis: ["🔥", "✨", "💀", "☠️", "🤡", "👑", "💯", "💥", "💫", "⚡", "🌚", "🌝", "🧠", "🗿", "🚀", "🎯", "🏆", "🥇", "📌", "🔔", "💬", "🫠", "🥴", "🙈", "🙉", "🙊", "💩", "👻", "👽", "🤖", "😈", "👿", "👾", "🥷", "🕺", "💃", "🧌", "🧿", "🎭", "🪩", "🎲", "🃏", "🧨", "🎉", "🎊", "📣", "📢", "🛑", "✅", "❌", "❗", "⁉️", "❓", "🔞", "📈", "📉", "🧯", "🪦", "🧊", "🫧"],
  },
  {
    id: "love",
    labelKey: "creator.emojiGroupLove",
    icon: "❤️",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "🩵", "💜", "🤎", "🖤", "🩶", "🤍", "💔", "❤️‍🔥", "❤️‍🩹", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "😍", "🥰", "😘", "😻", "💋", "🌹", "🥀", "🌺", "🌸", "🌷", "💐", "🫶", "💌", "💍", "🎀", "🧸", "🍓", "🍒", "🍫", "🍰", "🕯️", "🌙", "⭐", "🪐", "🦋", "🕊️", "🎶", "🥂"],
  },
  {
    id: "objects",
    labelKey: "creator.emojiGroupObjects",
    icon: "🎬",
    emojis: ["💰", "💸", "💳", "💎", "🎁", "🎈", "🎉", "🎬", "🎧", "🎤", "🎮", "🕹️", "📱", "💻", "⌨️", "🖥️", "📷", "📹", "🎥", "⏰", "⌛", "🧭", "🔒", "🔓", "🔑", "🧩", "🪄", "🧨", "📝", "📚", "📦", "📎", "✂️", "🧷", "📏", "🖊️", "🖌️", "🔍", "💡", "🔦", "🧯", "🛒", "🛍️", "🎫", "🏷️", "🍿", "☕", "🍕", "🍔", "🌮", "🍟", "🍩", "🍪", "🥤", "🧃"],
  },
] as const;

export const ALL_EMOJIS = Array.from(new Set(EMOJI_GROUPS.flatMap((group) => group.emojis)));
export const ALL_EMOJI_SET = new Set<string>(ALL_EMOJIS);
export const CREATOR_EMOJI_USAGE_KEY = "creator-emoji-usage-v1";
export const CREATOR_GIF_USAGE_KEY = "creator-gif-usage-v1";

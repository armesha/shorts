export interface JokeAnimatedTemplate {
  variant: string;
  gif: string;
  label: string;
  width: number;
  x: string;
  y: string;
}

export const JOKE_ANIMATED_MAX_TEXT_LEN = 320;

export const JOKE_ANIMATED_TEMPLATES = [
  { variant: "v-gif-joy-note", gif: "reaction-joy.gif", label: "Joy Note", width: 178, x: "main_w-overlay_w-78", y: "main_h-overlay_h-242" },
  { variant: "v-gif-rofl-pop", gif: "reaction-rofl.gif", label: "ROFL Pop", width: 182, x: "78", y: "main_h-overlay_h-242" },
  { variant: "v-gif-laughing-ticket", gif: "reaction-laughing.gif", label: "Laughing Ticket", width: 172, x: "main_w-overlay_w-82", y: "main_h-overlay_h-254" },
  { variant: "v-gif-mind-blown", gif: "reaction-mind-blown.gif", label: "Mind Blown", width: 176, x: "82", y: "main_h-overlay_h-250" },
  { variant: "v-gif-star-struck", gif: "meme-star-struck.gif", label: "Star Struck", width: 174, x: "main_w-overlay_w-80", y: "main_h-overlay_h-244" },
  { variant: "v-gif-fire-punchline", gif: "meme-fire.gif", label: "Fire Punchline", width: 164, x: "84", y: "main_h-overlay_h-242" },
  { variant: "v-gif-party-face", gif: "meme-partying-face.gif", label: "Party Face", width: 174, x: "main_w-overlay_w-82", y: "main_h-overlay_h-250" },
  { variant: "v-gif-clap-card", gif: "gesture-clap.gif", label: "Clap Card", width: 172, x: "82", y: "main_h-overlay_h-244" },
  { variant: "v-gif-thumbs-up", gif: "gesture-thumbs-up.gif", label: "Thumbs Up", width: 170, x: "main_w-overlay_w-78", y: "main_h-overlay_h-246" },
  { variant: "v-gif-sparkles", gif: "meme-sparkles.gif", label: "Sparkles", width: 166, x: "86", y: "main_h-overlay_h-240" },
] as const satisfies readonly JokeAnimatedTemplate[];

export const JOKE_ANIMATED_VARIANTS = JOKE_ANIMATED_TEMPLATES.map((template) => template.variant);

export function jokeAnimatedTemplateForVariant(variant?: string | null): JokeAnimatedTemplate | null {
  return JOKE_ANIMATED_TEMPLATES.find((template) => template.variant === variant) ?? null;
}

export function isJokeAnimatedVariant(variant?: string | null): boolean {
  return !!jokeAnimatedTemplateForVariant(variant);
}

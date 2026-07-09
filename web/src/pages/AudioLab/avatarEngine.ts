export type AvatarCommand =
  | "neutral"
  | "smile"
  | "laugh"
  | "surprised"
  | "angry"
  | "sad"
  | "sarcastic"
  | "whisper"
  | "look_left"
  | "look_right"
  | "nod"
  | "blink";

export type TimelineCue = {
  at: number;
  command: AvatarCommand;
  duration: number;
  source: "tag" | "manual";
};

export type AvatarFrame = {
  time: number;
  mouth: number;
  viseme: {
    aa: number;
    ih: number;
    ou: number;
    ee: number;
    oh: number;
  };
  blink: number;
  smile: number;
  surprise: number;
  anger: number;
  sad: number;
  laugh: number;
  whisper: number;
  gazeX: number;
  gazeY: number;
  headTilt: number;
  headBob: number;
};

export type StagePresetId = "studio" | "warm" | "night" | "chroma";

export type StagePreset = {
  id: StagePresetId;
  label: string;
  top: string;
  middle: string;
  bottom: string;
  floor: string;
  grid: string;
};

export const STAGE_PRESETS: StagePreset[] = [
  {
    id: "studio",
    label: "студия",
    top: "#193634",
    middle: "#204844",
    bottom: "#131a22",
    floor: "rgba(0,0,0,0.18)",
    grid: "rgba(255,255,255,0.06)",
  },
  {
    id: "warm",
    label: "тёплый",
    top: "#503021",
    middle: "#6a4b33",
    bottom: "#191615",
    floor: "rgba(0,0,0,0.2)",
    grid: "rgba(255,255,255,0.05)",
  },
  {
    id: "night",
    label: "ночь",
    top: "#141925",
    middle: "#273147",
    bottom: "#080b12",
    floor: "rgba(0,0,0,0.24)",
    grid: "rgba(255,255,255,0.045)",
  },
  {
    id: "chroma",
    label: "chroma",
    top: "#0a7a3c",
    middle: "#0b8f45",
    bottom: "#074e2b",
    floor: "rgba(0,0,0,0.12)",
    grid: "rgba(255,255,255,0.055)",
  },
];

export const COMMANDS: { command: AvatarCommand; label: string }[] = [
  { command: "smile", label: "улыбка" },
  { command: "laugh", label: "смех" },
  { command: "surprised", label: "удивление" },
  { command: "sarcastic", label: "сарказм" },
  { command: "angry", label: "злость" },
  { command: "sad", label: "грусть" },
  { command: "whisper", label: "шёпот" },
  { command: "look_left", label: "влево" },
  { command: "look_right", label: "вправо" },
  { command: "nod", label: "кивок" },
  { command: "blink", label: "моргнуть" },
];

export const TAG_TO_COMMAND: Record<string, AvatarCommand> = {
  "[laughs]": "laugh",
  "[whispers]": "whisper",
  "[sighs]": "sad",
  "[sarcastic]": "sarcastic",
  "[excited]": "smile",
  "[short pause]": "blink",
  "[very fast]": "nod",
  "[very slow]": "neutral",
};

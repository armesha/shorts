export type HairStyle = "parted" | "short" | "bob" | "cropped" | "bald";

export type CharacterAccessories = {
  bandana: boolean;
  bandanaColor: string;
  necktie: boolean;
  necktieColor: string;
  firefighterGear: boolean;
  policeGear: boolean;
};

export type CharacterConfig = {
  id: string;
  name: string;
  role: string;
  quote?: string;
  gender: "male" | "female";
  skinColor: string;
  hairStyle: HairStyle;
  hairColor: string;
  shirtColor: string;
  pantsColor: string;
  shoesColor: string;
  accessories: CharacterAccessories;
};

export type ExpressionId = "neutral" | "heroic" | "panic" | "exhausted" | "shouting";

export type PoseId =
  | "idle-breathe"
  | "hero-point"
  | "carry-piggyback"
  | "carry-receive"
  | "turn-around-stairs"
  | "firefighter-climb"
  | "exhausted-slump"
  | "help-hand"
  | "police-direct"
  | "panic-run"
  | "run-loop";

export type LightingPresetId = "zack-d-studio" | "sky-lobby-fire" | "stairwell-emergency" | "street-daylight";

export type PoseDefinition = {
  id: PoseId;
  nameRu: string;
  timecode: string;
  description: string;
  expression: ExpressionId;
};

export const CHARACTER_PRESETS: CharacterConfig[] = [
  {
    id: "welles-crowther",
    name: "Уэллс Кроутер («Парень в красной бандане»)",
    role: "Главный герой, спасший не менее 18 человек на лестнице А",
    quote: "Stairwell A! Follow me! Go! Go! / There are more people up there!",
    gender: "male",
    skinColor: "#f0c29b",
    hairStyle: "parted",
    hairColor: "#32231b",
    shirtColor: "#f3f5f8",
    pantsColor: "#1e2229",
    shoesColor: "#141517",
    accessories: {
      bandana: true,
      bandanaColor: "#b91c1c",
      necktie: false,
      necktieColor: "#b91c1c",
      firefighterGear: false,
      policeGear: false,
    },
  },
  {
    id: "office-worker-tie",
    name: "Клерк в красном галстуке (Помощник)",
    role: "Офисный сотрудник, помогает эвакуировать раненых по лестнице",
    quote: "Take her! Keep going down! / Yes, you can. Look at me. One step at a time.",
    gender: "male",
    skinColor: "#eabb95",
    hairStyle: "short",
    hairColor: "#2a1e16",
    shirtColor: "#ffffff",
    pantsColor: "#1c2024",
    shoesColor: "#18181b",
    accessories: {
      bandana: false,
      bandanaColor: "#b91c1c",
      necktie: true,
      necktieColor: "#dc2626",
      firefighterGear: false,
      policeGear: false,
    },
  },
  {
    id: "injured-woman",
    name: "Пострадавшая женщина (Эвакуируемая)",
    role: "Сотрудница Скай-Лобби 78, спасённая Уэллсом на закорках",
    quote: "I can't anymore...",
    gender: "female",
    skinColor: "#eed1bc",
    hairStyle: "bob",
    hairColor: "#453225",
    shirtColor: "#d8dee8",
    pantsColor: "#27272a",
    shoesColor: "#18181b",
    accessories: {
      bandana: false,
      bandanaColor: "#b91c1c",
      necktie: false,
      necktieColor: "#dc2626",
      firefighterGear: false,
      policeGear: false,
    },
  },
  {
    id: "firefighter-fdny",
    name: "Пожарный FDNY",
    role: "Боец пожарной охраны Нью-Йорка, поднимающийся навстречу людям",
    quote: "Forty more! Keep going! You're doing great!",
    gender: "male",
    skinColor: "#d89c74",
    hairStyle: "cropped",
    hairColor: "#2a1e16",
    shirtColor: "#18191c",
    pantsColor: "#18191c",
    shoesColor: "#0f1113",
    accessories: {
      bandana: false,
      bandanaColor: "#b91c1c",
      necktie: false,
      necktieColor: "#dc2626",
      firefighterGear: true,
      policeGear: false,
    },
  },
  {
    id: "police-officer",
    name: "Офицер полиции PAPD / NYPD",
    role: "Регулировщик эвакуации в подземном Конкорсе WTC и на улице",
    quote: "This way! Don't look up! Keep moving!",
    gender: "male",
    skinColor: "#dfa983",
    hairStyle: "cropped",
    hairColor: "#231812",
    shirtColor: "#1e293b",
    pantsColor: "#0f172a",
    shoesColor: "#090d16",
    accessories: {
      bandana: false,
      bandanaColor: "#b91c1c",
      necktie: false,
      necktieColor: "#dc2626",
      firefighterGear: false,
      policeGear: true,
    },
  },
  {
    id: "civilian",
    name: "Гражданский / Эвакуирующийся",
    role: "Пешеход или офисный работник башен WTC в паническом беге",
    quote: "It's coming down! RUN! Don't look back!",
    gender: "male",
    skinColor: "#e6b58e",
    hairStyle: "short",
    hairColor: "#3a2c20",
    shirtColor: "#cbd5e1",
    pantsColor: "#334155",
    shoesColor: "#1e293b",
    accessories: {
      bandana: false,
      bandanaColor: "#b91c1c",
      necktie: false,
      necktieColor: "#dc2626",
      firefighterGear: false,
      policeGear: false,
    },
  },
];

export const STORY_POSES: PoseDefinition[] = [
  {
    id: "idle-breathe",
    nameRu: "Дыхание (Базовая стойка)",
    timecode: "00:00",
    description: "Стандартная нейтральная поза с мягкой анимацией дыхания грудной клетки",
    expression: "neutral",
  },
  {
    id: "hero-point",
    nameRu: "«Stairwell A! Follow me!»",
    timecode: "00:13",
    description: "Уэллс в Скай-Лобби 78 указывает правой рукой на вход на лестницу, зовя людей за собой",
    expression: "heroic",
  },
  {
    id: "carry-piggyback",
    nameRu: "«Спуск с раненой на спине»",
    timecode: "00:17",
    description: "Уэллс несет пострадавшую женщину вниз по ступеням лестницы А, руки зафиксированы сзади",
    expression: "heroic",
  },
  {
    id: "carry-receive",
    nameRu: "«Take her! Keep going down!»",
    timecode: "00:20",
    description: "Передача пострадавшей на 61-м этаже: помощник в галстуке вытягивает руки вперед для поддержки",
    expression: "panic",
  },
  {
    id: "turn-around-stairs",
    nameRu: "«There are more people up there!»",
    timecode: "00:25",
    description: "Уэллс разворачивается лицом вверх по лестнице и собирается идти обратно в огонь и дым",
    expression: "heroic",
  },
  {
    id: "firefighter-climb",
    nameRu: "«Forty more! Keep going!»",
    timecode: "00:34",
    description: "Пожарный FDNY поднимается по лестнице навстречу толпе, призывая не сдаваться",
    expression: "shouting",
  },
  {
    id: "exhausted-slump",
    nameRu: "«I can't anymore...»",
    timecode: "00:38",
    description: "Обессилевшая женщина сидит на ступенях 44-го этажа, уронив голову и руки",
    expression: "exhausted",
  },
  {
    id: "help-hand",
    nameRu: "«One step at a time»",
    timecode: "00:41",
    description: "Мужчина в галстуке наклоняется к упавшей женщине и протягивает руку помощи",
    expression: "heroic",
  },
  {
    id: "police-direct",
    nameRu: "«This way! Don't look up!»",
    timecode: "00:51",
    description: "Офицер в Конкорсе WTC машет рукой, указывая эвакуирующимся путь к выходу",
    expression: "shouting",
  },
  {
    id: "panic-run",
    nameRu: "«It's coming down! RUN!»",
    timecode: "00:58",
    description: "Панический бег по улице во время обрушения башни, взгляд назад в ужасе",
    expression: "panic",
  },
  {
    id: "run-loop",
    nameRu: "Спринт (Анимация бега)",
    timecode: "01:02",
    description: "Непрерывный цикл анимации бега персонажа с синхронизацией рук и ног",
    expression: "panic",
  },
];

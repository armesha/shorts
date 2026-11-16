/** Local GTA 6 reaction highlights from a timed transcript. No network and no publishers. */

export const GTA6_CLASSES = ["clothing", "first_look", "graphics"] as const;
export type Gta6Class = (typeof GTA6_CLASSES)[number];

export const GTA6_PAD_SECONDS = 1;
export const GTA6_ANCHOR_CONTEXT_SECONDS = 12;
export const GTA6_WIDTH = 1080;
export const GTA6_HEIGHT = 1920;
/** Banners must end above this row. Below it is the Shorts caption band. */
export const GTA6_BOTTOM_UI_TOP = 1500;
/** Banners must end to the left of this column. The right side is the action rail. */
export const GTA6_RIGHT_COLUMN_LEFT = 880;
export const GTA6_BANNER_SIM = "симка впн";
export const GTA6_BANNER_ROBOT = "шортробот";
export const GTA6_BANNER_TELEGRAM = "тг канал";
export const GTA6_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

export type Gta6Label = { text: string; accept: boolean; class: Gta6Class };
export type Gta6Segment = { start: number; end: number; text: string };
export type Gta6Lexicon = {
  anchors: string[];
  cues: Record<Gta6Class, string[]>;
  phrases: Record<Gta6Class, string[]>;
  blocked: string[];
  vetoes: string[];
};
export type Gta6Match = { class: Gta6Class; via: "phrase" | "cue"; evidence: string };
export type Gta6Highlight = {
  sourceId: string;
  class: Gta6Class;
  text: string;
  triggerStart: number;
  triggerEnd: number;
  start: number;
  end: number;
};
export type Gta6Chunk = {
  sourceId: string;
  index: number;
  offsetSeconds?: number;
  segments: Gta6Segment[];
  closed: boolean;
};
export type Gta6Banner = { text: string; x: number; y: number; fontSize: number };

const BASE_CUES: Record<Gta6Class, string[]> = {
  first_look: [
    "первый взгляд",
    "впервые вижу",
    "первый раз вижу",
    "впервые смотрю",
    "first look",
    "first time seeing",
    "first glimpse",
    "seeing it for the first time",
  ],
  graphics: ["график", "детализац", "graphics", "visuals", "ray tracing"],
  clothing: ["одежд", "шмот", "прикид", "outfit", "clothes", "clothing", "costume"],
};

const BASE_VETOES = [
  "промокод",
  "скидка",
  "спонсор",
  "реклама",
  "подпишись",
  "подписывайся",
  "ссылка в описании",
  "ссылка в био",
  "используй код",
  "мой мерч",
  "promo code",
  "use code",
  "discount code",
  "sponsored",
  "subscribe",
  "link in bio",
  "link in description",
  "check out my",
];

function sortedUnique(values: readonly string[]) {
  return [...new Set(values.filter((value) => value.length > 0))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function replaceGameName(text: string, pattern: RegExp, name: string) {
  return text.replace(pattern, (match) => `${match.startsWith(" ") ? " " : ""}${name}`);
}

export function normalizeSpeech(text: string) {
  const folded = text
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/[’'`]/gu, "")
    .replace(/[^a-z0-9а-я\s]+/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  // JS \\b is ASCII-only, so Cyrillic names use an explicit space boundary.
  return replaceGameName(
    replaceGameName(
      replaceGameName(
        replaceGameName(folded, /(?:^|\s)g\s*t\s*a\s*(?:6|vi|six)(?=\s|$)/gu, "gta 6"),
        /(?:^|\s)gta\s*(?:vi|six|6)(?=\s|$)/gu,
        "gta 6",
      ),
      /(?:^|\s)г\s*т\s*а\s*(?:6|vi|шесть)(?=\s|$)/gu,
      "гта 6",
    ),
    /(?:^|\s)гта\s*(?:vi|6|шесть)(?=\s|$)/gu,
    "гта 6",
  ).replace(/\s+/gu, " ").trim();
}

export function baseGta6Lexicon(): Gta6Lexicon {
  return {
    anchors: sortedUnique(["gta 6", "гта 6"]),
    cues: {
      clothing: sortedUnique(BASE_CUES.clothing),
      first_look: sortedUnique(BASE_CUES.first_look),
      graphics: sortedUnique(BASE_CUES.graphics),
    },
    phrases: { clothing: [], first_look: [], graphics: [] },
    blocked: [],
    vetoes: sortedUnique(BASE_VETOES),
  };
}

function cloneLexicon(lexicon: Gta6Lexicon): Gta6Lexicon {
  return {
    anchors: [...lexicon.anchors],
    cues: {
      clothing: [...lexicon.cues.clothing],
      first_look: [...lexicon.cues.first_look],
      graphics: [...lexicon.cues.graphics],
    },
    phrases: {
      clothing: [...lexicon.phrases.clothing],
      first_look: [...lexicon.phrases.first_look],
      graphics: [...lexicon.phrases.graphics],
    },
    blocked: [...lexicon.blocked],
    vetoes: [...lexicon.vetoes],
  };
}

export function calibrateGta6(labels: readonly Gta6Label[], base: Gta6Lexicon = baseGta6Lexicon()): Gta6Lexicon {
  const next = cloneLexicon(base);
  const ordered = labels.map((label, index) => ({ label, index })).sort((a, b) => {
    const left = normalizeSpeech(a.label.text);
    const right = normalizeSpeech(b.label.text);
    if (left !== right) return left < right ? -1 : 1;
    if (a.label.class !== b.label.class) return a.label.class < b.label.class ? -1 : 1;
    if (a.label.accept !== b.label.accept) return a.label.accept ? 1 : -1;
    return a.index - b.index;
  });
  const decided = new Set<string>();
  for (const { label } of ordered) {
    if (!GTA6_CLASSES.includes(label.class) || typeof label.accept !== "boolean") continue;
    const text = normalizeSpeech(label.text);
    if (text.length < 8) continue;
    const key = `${text}\0${label.class}`;
    if (decided.has(key)) continue;
    decided.add(key);
    if (!label.accept) {
      next.blocked.push(text);
      for (const name of GTA6_CLASSES) next.phrases[name] = next.phrases[name].filter((phrase) => phrase !== text);
    } else if (!next.blocked.includes(text)) next.phrases[label.class].push(text);
  }
  next.blocked = sortedUnique(next.blocked);
  next.anchors = sortedUnique(next.anchors);
  next.vetoes = sortedUnique(next.vetoes);
  for (const name of GTA6_CLASSES) {
    next.cues[name] = sortedUnique(next.cues[name]);
    next.phrases[name] = sortedUnique(next.phrases[name]);
  }
  return next;
}

function hasAnchor(text: string, lexicon: Gta6Lexicon) {
  return lexicon.anchors.some((anchor) => text.includes(anchor));
}

export function classifySpeech(text: string, lexicon: Gta6Lexicon = baseGta6Lexicon(), options?: { anchorContext?: string }): Gta6Match | null {
  const normalized = normalizeSpeech(text);
  if (!normalized) return null;
  if (lexicon.blocked.includes(normalized)) return null;
  if (lexicon.vetoes.some((veto) => normalized.includes(veto))) return null;
  let phraseHit: Gta6Match | null = null;
  for (const name of GTA6_CLASSES) {
    for (const phrase of lexicon.phrases[name]) {
      if (!normalized.includes(phrase)) continue;
      if (!phraseHit || phrase.length > phraseHit.evidence.length) phraseHit = { class: name, via: "phrase", evidence: phrase };
    }
  }
  if (phraseHit) return phraseHit;
  const context = normalizeSpeech(options?.anchorContext || "");
  if (!hasAnchor(normalized, lexicon) && !hasAnchor(context, lexicon)) return null;
  let cueHit: (Gta6Match & { index: number }) | null = null;
  for (const name of GTA6_CLASSES) {
    for (const cue of lexicon.cues[name]) {
      const index = normalized.indexOf(cue);
      if (index < 0) continue;
      const better = !cueHit
        || index < cueHit.index
        || (index === cueHit.index && cue.length > cueHit.evidence.length);
      if (better) cueHit = { class: name, via: "cue", evidence: cue, index };
    }
  }
  return cueHit ? { class: cueHit.class, via: "cue", evidence: cueHit.evidence } : null;
}

export function highlightWindow(start: number, end: number, pad = GTA6_PAD_SECONDS) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start) || start < 0) throw new Error("Некорректный интервал реплики.");
  const windowStart = Math.max(0, Math.floor(start - pad));
  const windowEnd = Math.max(Math.ceil(end + pad), Math.ceil(end), windowStart + 1);
  return { start: Math.min(windowStart, Math.floor(start)), end: windowEnd };
}

type AnchorMemory = { end: number; text: string };

function remember(memory: AnchorMemory[], start: number) {
  return memory
    .filter((item) => start >= item.end && start - item.end <= GTA6_ANCHOR_CONTEXT_SECONDS)
    .map((item) => item.text)
    .join(" ");
}

export function highlightsInClosedChunk(chunk: Gta6Chunk, lexicon: Gta6Lexicon, memory: AnchorMemory[]) {
  if (!chunk.closed) return [];
  const offset = chunk.offsetSeconds ?? 0;
  const hits: Gta6Highlight[] = [];
  const segments = [...chunk.segments].sort((a, b) => a.start - b.start || a.end - b.end);
  for (const segment of segments) {
    const triggerStart = segment.start + offset;
    const triggerEnd = segment.end + offset;
    if (!Number.isFinite(triggerStart) || !Number.isFinite(triggerEnd) || !(triggerEnd > triggerStart) || triggerStart < 0) continue;
    const match = classifySpeech(segment.text, lexicon, { anchorContext: remember(memory, triggerStart) });
    memory.push({ end: triggerEnd, text: segment.text });
    if (!match) continue;
    const window = highlightWindow(triggerStart, triggerEnd);
    hits.push({
      sourceId: chunk.sourceId,
      class: match.class,
      text: segment.text.trim(),
      triggerStart,
      triggerEnd,
      start: window.start,
      end: window.end,
    });
  }
  return hits;
}

function highlightKey(hit: Gta6Highlight) {
  return [hit.sourceId, hit.class, hit.triggerStart, hit.triggerEnd, normalizeSpeech(hit.text)].join("\0");
}

export function highlightsFromChunks(chunks: readonly Gta6Chunk[], lexicon: Gta6Lexicon = baseGta6Lexicon()) {
  const ordered = [...chunks].sort((a, b) => (a.sourceId === b.sourceId ? a.index - b.index : a.sourceId < b.sourceId ? -1 : 1));
  const seenChunk = new Set<string>();
  const seenHit = new Set<string>();
  const memory = new Map<string, AnchorMemory[]>();
  const hits: Gta6Highlight[] = [];
  for (const chunk of ordered) {
    if (!chunk.closed) continue;
    const chunkKey = `${chunk.sourceId}\0${chunk.index}`;
    if (seenChunk.has(chunkKey)) continue;
    seenChunk.add(chunkKey);
    const sourceMemory = memory.get(chunk.sourceId) ?? [];
    memory.set(chunk.sourceId, sourceMemory);
    for (const hit of highlightsInClosedChunk(chunk, lexicon, sourceMemory)) {
      const key = highlightKey(hit);
      if (seenHit.has(key)) continue;
      seenHit.add(key);
      hits.push(hit);
    }
  }
  return hits;
}

export function createGta6Cursor(lexicon: Gta6Lexicon = baseGta6Lexicon()) {
  const seenChunk = new Set<string>();
  const seenHit = new Set<string>();
  const memory = new Map<string, AnchorMemory[]>();
  return {
    push(chunk: Gta6Chunk) {
      const chunkKey = `${chunk.sourceId}\0${chunk.index}`;
      if (seenChunk.has(chunkKey)) return [];
      if (!chunk.closed) return [];
      seenChunk.add(chunkKey);
      const sourceMemory = memory.get(chunk.sourceId) ?? [];
      memory.set(chunk.sourceId, sourceMemory);
      const fresh: Gta6Highlight[] = [];
      for (const hit of highlightsInClosedChunk(chunk, lexicon, sourceMemory)) {
        const key = highlightKey(hit);
        if (seenHit.has(key)) continue;
        seenHit.add(key);
        fresh.push(hit);
      }
      return fresh;
    },
  };
}

export function gta6Banners(telegram: boolean): Gta6Banner[] {
  const banners: Gta6Banner[] = [
    { text: GTA6_BANNER_SIM, x: 48, y: 96, fontSize: 72 },
    { text: GTA6_BANNER_ROBOT, x: 48, y: 220, fontSize: 72 },
  ];
  if (telegram) banners.push({ text: GTA6_BANNER_TELEGRAM, x: 48, y: 344, fontSize: 72 });
  for (const banner of banners) {
    const right = banner.x + Math.ceil(banner.text.length * banner.fontSize * 0.7) + 40;
    const bottom = banner.y + banner.fontSize + 40;
    if (banner.x < 24 || banner.y < 24 || bottom >= GTA6_BOTTOM_UI_TOP || right >= GTA6_RIGHT_COLUMN_LEFT) {
      throw new Error("Баннер попадает в нижнюю зону или правую колонку.");
    }
  }
  return banners;
}

export function gta6DrawtextChain(telegram: boolean, fontFile = GTA6_FONT) {
  return gta6Banners(telegram)
    .map((banner) => `drawtext=fontfile=${fontFile}:text='${banner.text}':fontsize=${banner.fontSize}:fontcolor=white:box=1:boxcolor=black@0.86:boxborderw=20:x=${banner.x}:y=${banner.y}`)
    .join(",");
}

export function gta6VideoFilter(start: number, end: number, telegram: boolean, fontFile = GTA6_FONT) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) throw new Error("Некорректное окно нарезки.");
  return `[0:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS,scale=${GTA6_WIDTH}:${GTA6_HEIGHT}:force_original_aspect_ratio=increase,crop=${GTA6_WIDTH}:${GTA6_HEIGHT},setsar=1,fps=30,${gta6DrawtextChain(telegram, fontFile)},format=yuv420p[v]`;
}

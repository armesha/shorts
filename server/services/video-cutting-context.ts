import type { CutPart, TimedWord } from "./video-cutting-plan.ts";
import type { CutTimeline } from "./video-cutting-sponsorblock.ts";

export type CuttingTimecode = {
  start: number;
  title: string;
  source: "chapter" | "description";
  sourceStart?: number;
};
export const MAX_AUTO_CUT_PARTS = 30;
export function autoCutLimits(duration: number) {
  if (duration <= 240)
    return {
      min: 1,
      max: 1,
      preferred: 1,
      minimumPartSeconds: 1,
      maximumPartSeconds: duration,
    };
  const preferred = Math.min(
    MAX_AUTO_CUT_PARTS,
    Math.max(2, Math.round(duration / 180)),
  );
  const max = Math.min(
    MAX_AUTO_CUT_PARTS,
    Math.max(preferred, Math.floor(duration / 150)),
  );
  const min = Math.min(max, Math.max(2, Math.ceil(duration / 270)));
  return {
    min,
    max,
    preferred,
    minimumPartSeconds: 120,
    maximumPartSeconds: Math.max(
      270,
      Math.ceil((duration / MAX_AUTO_CUT_PARTS) * 1.25),
    ),
  };
}

export function extractCuttingTimecodes(
  metadata: { chapters?: unknown; description?: unknown },
  duration: number,
): CuttingTimecode[] {
  const result: CuttingTimecode[] = [];
  const add = (
    start: unknown,
    title: unknown,
    source: CuttingTimecode["source"],
  ) => {
    if (
      typeof start !== "number" ||
      !Number.isFinite(start) ||
      start < 0 ||
      start >= duration ||
      typeof title !== "string"
    )
      return;
    const text = title
      .replace(/[\r\n\t]+/g, " ")
      .trim()
      .slice(0, 160);
    if (text && !result.some((item) => Math.abs(item.start - start) < 0.5))
      result.push({ start, title: text, source });
  };
  if (Array.isArray(metadata.chapters))
    for (const chapter of metadata.chapters)
      add(chapter?.start_time, chapter?.title, "chapter");
  if (typeof metadata.description === "string")
    for (const line of metadata.description.slice(0, 20000).split(/\r?\n/)) {
      const match = line.match(
        /(?:^|\s|\[|\()((?:\d{1,2}:)?\d{1,3}:[0-5]\d(?:[.,]\d{1,3})?)(?=\s|\]|\)|[-–—]|$)/,
      );
      if (!match) continue;
      const parts = match[1].replace(",", ".").split(":").map(Number);
      if (parts.length === 3 && parts[1] >= 60) continue;
      const start = parts
        .reverse()
        .reduce((sum, n, index) => sum + n * 60 ** index, 0);
      const title = line
        .replace(match[1], "")
        .replace(/^\s*(?:\d+[.)]\s*)?[-–—•*\[\]()\s]+/, "")
        .replace(/[\[\]()]$/g, "")
        .trim();
      add(start, title, "description");
    }
  return result.sort((a, b) => a.start - b.start).slice(0, 200);
}

export function cleanCuttingTimecodes(
  anchors: CuttingTimecode[],
  timeline: CutTimeline[],
): CuttingTimecode[] {
  return anchors.flatMap((anchor) => {
    const range = timeline.find(
      (range) => anchor.start >= range.start && anchor.start < range.end,
    );
    if (!range) return [];
    return [
      {
        ...anchor,
        sourceStart: anchor.start,
        start: anchor.start - range.start + range.cleanStart,
      },
    ];
  });
}

export function autoCutGuidance(duration: number): string {
  const limits = autoCutLimits(duration);
  return `Target about 180 seconds (3 minutes) per part. Prefer ${limits.preferred} parts for this video's duration; the allowed count is ${limits.min}–${limits.max}. ${limits.max === 1 ? "This video is already short: keep it as one complete episode instead of creating tiny clips." : `Every part must be between ${limits.minimumPartSeconds} and ${limits.maximumPartSeconds} seconds. Merge short adjacent chapters and any short tail into a neighboring episode. Aim for 150–240 seconds where the story allows; finish the sentence or scene instead of cutting at exactly 180 seconds.`} Never create extra fragments simply because the author listed many timestamps. For very long videos, prefer longer coherent parts over exceeding ${MAX_AUTO_CUT_PARTS} parts.`;
}

export function alignCutPlanToSpeech(
  plan: CutPart[],
  words: TimedWord[],
  anchors: CuttingTimecode[],
  minimumPartSeconds = 1,
  maximumPartSeconds = Infinity,
): CutPart[] {
  const result = plan.map((part) => ({ ...part }));
  const safe = (time: number) => {
    let low = 0,
      high = words.length - 1,
      index = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (words[middle].start <= time) {
        index = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    const word = words[index];
    return !word || time <= word.start + 0.005 || time >= word.end - 0.005;
  };
  for (let index = 0; index < result.length - 1; index++) {
    const proposed = plan[index].end,
      lower = Math.max(
        result[index].start + minimumPartSeconds,
        plan[index + 1].end - maximumPartSeconds,
      ),
      upper = Math.min(
        plan[index + 1].end - minimumPartSeconds,
        result[index].start + maximumPartSeconds,
      );
    const candidates: { time: number; penalty: number }[] = [];
    const add = (time: number, penalty: number) => {
      if (
        time >= lower &&
        time <= upper &&
        Math.abs(time - proposed) <= 2.5 &&
        safe(time)
      )
        candidates.push({ time, penalty });
    };
    if (safe(proposed)) add(proposed, 0.25);
    for (let n = 0; n < words.length; n++) {
      const word = words[n];
      add(word.start, 0.5);
      add(word.end, /[.!?…]["»']?$/.test(word.text) ? 0.1 : 0.5);
      const next = words[n + 1];
      if (next && next.start - word.end >= 0.18)
        add(word.end + Math.min(0.12, (next.start - word.end) / 2), 0);
    }
    for (const anchor of anchors) add(anchor.start, 0.05);
    candidates.sort(
      (a, b) =>
        Math.abs(a.time - proposed) +
        a.penalty -
        (Math.abs(b.time - proposed) + b.penalty),
    );
    if (!candidates.length)
      throw new Error(
        "Не удалось выбрать границу между словами. Попробуйте меньше частей.",
      );
    const time = Math.round(candidates[0].time * 1000) / 1000;
    result[index].end = time;
    result[index + 1].start = time;
  }
  return result;
}

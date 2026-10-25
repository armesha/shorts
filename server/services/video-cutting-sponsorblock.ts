import { createHash } from "node:crypto";
import type { TimedWord } from "./video-cutting-plan.ts";

export type SourceRange = { start: number; end: number };
export type CutTimeline = SourceRange & {
  cleanStart: number;
  cleanEnd: number;
};
export type SponsorBlockResult = {
  status: "disabled" | "checking" | "removed" | "not_found" | "unavailable";
  segments: SourceRange[];
  removedSeconds: number;
  sourceDuration: number;
  cleanDuration: number;
  ignoredStale: number;
};
export type SponsorLookup = (
  videoId: string,
  duration: number,
  signal: AbortSignal,
) => Promise<SponsorBlockResult>;

export function sponsorBlockResult(
  duration: number,
  status: SponsorBlockResult["status"],
): SponsorBlockResult {
  return {
    status,
    segments: [],
    removedSeconds: 0,
    sourceDuration: duration,
    cleanDuration: duration,
    ignoredStale: 0,
  };
}

export function normalizeSponsorSegments(
  raw: unknown,
  duration: number,
): SponsorBlockResult {
  if (!Array.isArray(raw)) throw new Error("Некорректный ответ SponsorBlock.");
  const ranges: SourceRange[] = [];
  let ignoredStale = 0;
  for (const entry of raw) {
    if (entry?.category !== "sponsor" || entry?.actionType !== "skip") continue;
    if (
      typeof entry.videoDuration === "number" &&
      entry.videoDuration > 0 &&
      Math.abs(entry.videoDuration - duration) > 1
    ) {
      ignoredStale++;
      continue;
    }
    if (!Array.isArray(entry.segment) || entry.segment.length !== 2) continue;
    const [a, b] = entry.segment;
    if (
      typeof a !== "number" ||
      typeof b !== "number" ||
      !Number.isFinite(a + b) ||
      b <= a
    )
      continue;
    const start = Math.max(0, a),
      end = Math.min(duration, b);
    if (end > start) ranges.push({ start, end });
  }
  ranges.sort((a, b) => a.start - b.start);
  const merged: SourceRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const removedSeconds = merged.reduce(
    (sum, range) => sum + range.end - range.start,
    0,
  );
  return {
    status: merged.length ? "removed" : "not_found",
    segments: merged,
    removedSeconds,
    sourceDuration: duration,
    cleanDuration: duration - removedSeconds,
    ignoredStale,
  };
}

export const fetchSponsorBlock: SponsorLookup = async (
  videoId,
  duration,
  signal,
) => {
  if (!/^[\w-]{11}$/.test(videoId))
    throw new Error("Некорректный идентификатор видео.");
  const prefix = createHash("sha256").update(videoId).digest("hex").slice(0, 4);
  const url = new URL(`https://sponsor.ajay.app/api/skipSegments/${prefix}`);
  url.searchParams.set("categories", JSON.stringify(["sponsor"]));
  url.searchParams.set("actionTypes", JSON.stringify(["skip"]));
  url.searchParams.set("service", "YouTube");
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
    });
    if (response.status === 404)
      return sponsorBlockResult(duration, "not_found");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error("Invalid response");
    const record = payload.find((row) => row?.videoID === videoId);
    return normalizeSponsorSegments(record?.segments || [], duration);
  } catch {
    signal.throwIfAborted();
    throw new Error(
      "Не удалось проверить SponsorBlock. Повторите задачу или выключите удаление рекламы.",
    );
  }
};

export function sponsorTimeline(
  duration: number,
  segments: SourceRange[],
): CutTimeline[] {
  const result: CutTimeline[] = [];
  let source = 0,
    clean = 0;
  for (const segment of [...segments, { start: duration, end: duration }]) {
    if (segment.start > source) {
      const length = segment.start - source;
      result.push({
        start: source,
        end: segment.start,
        cleanStart: clean,
        cleanEnd: clean + length,
      });
      clean += length;
    }
    source = segment.end;
  }
  return result;
}

export function cleanSponsorWords(
  words: TimedWord[],
  timeline: CutTimeline[],
): TimedWord[] {
  const result: TimedWord[] = [];
  for (const word of words) {
    // A word crossing a removed interval is omitted rather than inventing a partial word.
    const range = timeline.find(
      (range) => word.start >= range.start && word.end <= range.end,
    );
    if (range)
      result.push({
        ...word,
        start: word.start - range.start + range.cleanStart,
        end: word.end - range.start + range.cleanStart,
      });
  }
  return result;
}

export function cuttingSourceRanges(
  start: number,
  end: number,
  timeline?: CutTimeline[],
): SourceRange[] {
  if (!timeline) return [{ start, end }];
  return timeline.flatMap((range) => {
    const a = Math.max(start, range.cleanStart),
      b = Math.min(end, range.cleanEnd);
    return b - a > 1e-6
      ? [
          {
            start: range.start + a - range.cleanStart,
            end: range.start + b - range.cleanStart,
          },
        ]
      : [];
  });
}

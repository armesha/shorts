import { spawn } from "node:child_process";

export type CutSection = { start: number; end: number };

const TAIL_WINDOW_SECONDS = 8;
const SOUND_HOLD_SECONDS = 0.35;
const SILENCE_PAD_SECONDS = 0.2;

export function silenceStartsFromDetectLog(log: string): number[] {
  return [...log.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/g)]
    .map((match) => Number(match[1]))
    .filter((time) => Number.isFinite(time) && time >= 0);
}

// Speech gives the intended break. The audible tail after that word decides
// the real end, so a laugh or reaction is not clipped with the subtitle.
export function extendEndToSilence(
  speechEnd: number,
  relativeSilenceStarts: number[],
  hardLimit: number,
  windowSeconds = TAIL_WINDOW_SECONDS,
): number {
  const cap = Math.min(speechEnd + windowSeconds, hardLimit);
  if (!(cap > speechEnd + 0.05)) return speechEnd;
  const marks = relativeSilenceStarts.filter((time) => time <= windowSeconds + 0.05);
  if (marks.some((time) => time < SOUND_HOLD_SECONDS)) return speechEnd;
  const held = marks.find((time) => time >= SOUND_HOLD_SECONDS);
  if (held == null) return cap;
  return Math.min(speechEnd + held + SILENCE_PAD_SECONDS, cap);
}

export function cutsFromSilence(duration: number, silenceAt: number[], minCuts = 3, maxCuts = 5): CutSection[] {
  if (!(duration > 1) || minCuts < 1 || maxCuts < minCuts) throw new Error("Некорректная нарезка эфира.");
  const count = Math.min(maxCuts, Math.max(minCuts, Math.round(duration / 150)));
  const edges = [0];
  for (let index = 1; index < count; index += 1) {
    const target = (duration * index) / count;
    const previous = edges[index - 1] ?? 0;
    const near = silenceAt
      .filter((time) => time > previous + 20 && time < duration - 20)
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
    edges.push(near ?? target);
  }
  edges.push(duration);
  return edges.slice(0, -1).map((start, index) => ({ start, end: edges[index + 1] ?? duration }));
}

export function sectionHardLimit(sections: CutSection[], index: number, duration: number): number {
  const section = sections[index];
  let limit = Math.min(duration, section.end + TAIL_WINDOW_SECONDS);
  for (const other of sections) {
    if (other.start > section.end + 0.05) limit = Math.min(limit, other.start);
  }
  return limit;
}

export function detectSilenceLog(source: string, from: number, window: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.VIDEO_CUTTING_FFMPEG || "ffmpeg", [
      "-hide_banner", "-ss", String(from), "-t", String(window), "-i", source,
      "-vn", "-af", "silencedetect=noise=-30dB:d=0.25", "-f", "null", "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(stderr);
    };
    const stop = () => { try { child.kill("SIGTERM"); } catch { /* already exited */ } };
    const timer = setTimeout(stop, 20_000);
    signal?.addEventListener("abort", stop, { once: true });
    child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-8000); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (signal?.aborted) finish(new Error("Задача отменена."));
      else if (code !== 0) finish(new Error("Не удалось прочитать звуковую дорожку."));
      else finish();
    });
  });
}

export async function snapSectionEndsToAudio(
  sections: CutSection[],
  duration: number,
  detect: (from: number, window: number) => Promise<string>,
): Promise<CutSection[]> {
  const snapped: CutSection[] = [];
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    const limit = sectionHardLimit(sections, index, duration);
    const window = limit - section.end;
    if (!(window > 0.05)) {
      snapped.push({ ...section });
      continue;
    }
    try {
      const log = await detect(section.end, window);
      snapped.push({ ...section, end: extendEndToSilence(section.end, silenceStartsFromDetectLog(log), limit, window) });
    } catch {
      snapped.push({ ...section });
    }
  }
  return snapped;
}

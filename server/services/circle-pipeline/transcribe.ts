import { resolve } from "node:path";
import { z } from "zod";
import { runCuttingProcess, type ProcessRunner } from "../video-cutting.ts";

const Transcript = z.object({
  language: z.string().min(1).max(20), languageProbability: z.number().min(0).max(1),
  segments: z.array(z.object({ start: z.number().nonnegative(), end: z.number().nonnegative(),
    text: z.string().min(1).max(5000), averageLogProbability: z.number().finite(),
    noSpeechProbability: z.number().min(0).max(1) }).strict()).max(1000),
}).strict();

export class UnreliableCircleSpeechError extends Error {}

export async function transcribeCircle(audio: string, options: {
  signal?: AbortSignal; run?: ProcessRunner; python?: string;
} = {}): Promise<{ text: string; language: string }> {
  const root = process.cwd();
  const output = await (options.run ?? runCuttingProcess)(
    options.python || resolve(root, "data/output/circle-pipeline/venv/bin/python"),
    [resolve(root, "scripts/circle-transcribe.py"), resolve(audio)],
    { cwd: root, timeoutMs: 20 * 60_000, signal: options.signal },
  );
  const transcript = Transcript.parse(JSON.parse(output));
  if (transcript.languageProbability < 0.5 || !transcript.segments.length ||
      transcript.segments.some(segment => segment.end < segment.start ||
        segment.averageLogProbability < -1 || segment.noSpeechProbability > 0.6))
    throw new UnreliableCircleSpeechError("Speech could not be transcribed reliably");
  const text = transcript.segments.map(segment => segment.text).join(" ");
  if (text.replace(/[\p{P}\p{S}\s]/gu, "").length < 2)
    throw new UnreliableCircleSpeechError("Speech could not be transcribed reliably");
  if (text.length > 30_000) throw new Error("Transcription is too long");
  return { text, language: transcript.language };
}

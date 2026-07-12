import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateGeminiTtsPreview, type GeminiTtsPreviewInput, type GeminiTtsPreviewResult } from "./gemini-tts.ts";

export type LocalGeminiTtsJob = GeminiTtsPreviewInput & {
  id: string;
};

export type LocalGeminiTtsJobResult = {
  id: string;
  status: "completed";
  audioFile: string;
  durationSec: number;
  voice: string;
  language: string;
  completedAt: string;
};

type RunnerDeps = {
  generate?: (input: GeminiTtsPreviewInput) => Promise<GeminiTtsPreviewResult>;
  log?: (message: string) => void;
  rootDir?: string;
  intervalMs?: number;
};

export type LocalGeminiTtsJobRunner = {
  directories: {
    root: string;
    inbox: string;
    processing: string;
    done: string;
    failed: string;
  };
  runOnce: () => Promise<boolean>;
  stop: () => void;
};

const JOB_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

/**
 * A local-only handoff for trusted on-host automation. Jobs are files under tmp/
 * (never HTTP), while Gemini credentials remain exclusively in the running server.
 */
export function startGeminiTtsLocalJobRunner(deps: RunnerDeps = {}): LocalGeminiTtsJobRunner {
  const root = resolve(deps.rootDir ?? "tmp/gemini-tts-jobs");
  const directories = {
    root,
    inbox: resolve(root, "inbox"),
    processing: resolve(root, "processing"),
    done: resolve(root, "done"),
    failed: resolve(root, "failed"),
  };
  for (const dir of Object.values(directories)) mkdirSync(dir, { recursive: true });

  const generate = deps.generate ?? generateGeminiTtsPreview;
  const log = deps.log ?? (() => undefined);
  let running = false;

  const runOnce = async (): Promise<boolean> => {
    if (running) return false;
    const file = nextJobFile(directories.inbox);
    if (!file) return false;
    running = true;
    const inboxPath = resolve(directories.inbox, file);
    const processingPath = resolve(directories.processing, file);
    try {
      renameSync(inboxPath, processingPath);
      const job = parseJob(readFileSync(processingPath, "utf8"));
      const result = await generate({
        text: job.text,
        language: job.language,
        voice: job.voice,
        style: job.style,
        pace: job.pace,
        accent: job.accent,
        scene: job.scene,
        energy: job.energy,
      });
      const wav = wavFromDataUrl(result.audioDataUrl);
      const audioFile = `${job.id}.wav`;
      const audioPath = resolve(directories.done, audioFile);
      writeAtomic(audioPath, wav);
      const completed: LocalGeminiTtsJobResult = {
        id: job.id,
        status: "completed",
        audioFile,
        durationSec: result.durationSec,
        voice: result.voice,
        language: result.language,
        completedAt: new Date().toISOString(),
      };
      writeAtomic(resolve(directories.done, `${job.id}.json`), Buffer.from(JSON.stringify(completed, null, 2) + "\n"));
      renameSync(processingPath, resolve(directories.done, `${job.id}.request.json`));
      log(`[gemini-tts-local] готово: ${job.id} (${result.durationSec.toFixed(2)} с)`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        if (file) {
          const failedPath = resolve(directories.failed, file);
          renameSync(processingPath, failedPath);
          writeAtomic(resolve(directories.failed, `${file}.error.json`), Buffer.from(JSON.stringify({ error: message, failedAt: new Date().toISOString() }, null, 2) + "\n"));
        }
      } catch {
        // Preserve the original exception; a failed-job artifact is best effort.
      }
      log(`[gemini-tts-local] ошибка задачи ${file}: ${message}`);
      return true;
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void runOnce(), Math.max(250, deps.intervalMs ?? 750));
  timer.unref();
  return { directories, runOnce, stop: () => clearInterval(timer) };
}

function nextJobFile(inbox: string): string | null {
  return readdirSync(inbox)
    .filter((file) => file.endsWith(".json"))
    .sort()[0] ?? null;
}

function parseJob(raw: string): LocalGeminiTtsJob {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") throw new Error("Задача TTS должна быть JSON-объектом.");
  const job = value as Partial<LocalGeminiTtsJob>;
  if (typeof job.id !== "string" || !JOB_ID.test(job.id)) throw new Error("Нужен безопасный id задачи TTS.");
  if (typeof job.text !== "string" || !job.text.trim()) throw new Error("В TTS-задаче нет текста.");
  if (typeof job.language !== "string" || typeof job.voice !== "string") throw new Error("Нужны language и voice для TTS-задачи.");
  return job as LocalGeminiTtsJob;
}

function wavFromDataUrl(value: string): Buffer {
  const match = /^data:audio\/wav;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Gemini TTS вернул аудио в неподдерживаемом формате.");
  const wav = Buffer.from(match[1], "base64");
  if (!wav.length) throw new Error("Gemini TTS вернул пустой WAV.");
  return wav;
}

function writeAtomic(path: string, content: Buffer) {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, content);
  renameSync(temp, path);
}

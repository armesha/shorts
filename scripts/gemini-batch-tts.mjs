#!/usr/bin/env node

import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const MODEL = "gemini-3.1-flash-tts-preview";
const API_BASE = "https://generativelanguage.googleapis.com";
const TERMINAL_STATES = new Set([
  "JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED",
  "BATCH_STATE_SUCCEEDED", "BATCH_STATE_FAILED", "BATCH_STATE_CANCELLED", "BATCH_STATE_EXPIRED",
]);

const command = process.argv[2];
const workDir = resolve(arg("work-dir", "output/speech/gemini-batch"));
const manifestPath = resolve(arg("manifest", `${workDir}/manifest.json`));
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.GOOGLE_API_KEY;

if (!command || !["prepare", "submit", "status", "collect"].includes(command)) {
  fail("Использование: node scripts/gemini-batch-tts.mjs <prepare|submit|status|collect> --manifest FILE --work-dir DIR");
}

if (command === "prepare") prepare();
else if (command === "submit") await submit();
else if (command === "status") await status();
else if (command === "collect") await collect();

function prepare() {
  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest) || !manifest.length) fail("Manifest должен быть непустым JSON-массивом.");
  mkdirSync(workDir, { recursive: true });
  const seen = new Set();
  const jobs = [];
  for (const item of manifest) {
    const id = String(item.id || "").trim();
    const transcript = String(item.transcript || "").trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(id)) fail(`Некорректный id: ${id}`);
    if (!transcript) fail(`Пустой transcript: ${id}`);
    if (seen.has(id)) fail(`Повтор id: ${id}`);
    seen.add(id);
    const intro = String(item.introComment || "").trim();
    const spokenText = intro ? `${intro}\n${transcript}` : transcript;
    const prompt = buildPrompt({ ...item, spokenText });
    jobs.push({
      key: id,
      request: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generation_config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: String(item.voice || "Aoede") } },
          },
        },
      },
    });
  }
  const requestsPath = resolve(workDir, "requests.jsonl");
  writeFileSync(requestsPath, `${jobs.map((job) => JSON.stringify(job)).join("\n")}\n`);
  writeFileSync(resolve(workDir, "index.json"), `${JSON.stringify(manifest.map((item) => ({
    id: item.id,
    sourceFile: item.sourceFile,
    introComment: item.introComment || null,
    actingDirection: item.actingDirection,
  })), null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ prepared: jobs.length, requestsPath })}\n`);
}

async function submit() {
  requireApiKey();
  const requestsPath = resolve(workDir, "requests.jsonl");
  if (!existsSync(requestsPath)) fail("Сначала запустите prepare.");
  if (existsSync(resolve(workDir, "job.json"))) fail("job.json уже существует: повторная отправка создаст второй платный Batch.");

  const bytes = readFileSync(requestsPath);
  const start = await fetch(`${API_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": "application/jsonl",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: `shorts-meme-tts-${Date.now()}` } }),
  });
  if (!start.ok) fail(`Не удалось начать загрузку: ${start.status} ${await safeText(start)}`);
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) fail("Files API не вернул upload URL.");

  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  const fileInfo = await jsonResponse(uploaded, "Не удалось загрузить JSONL");
  const fileName = fileInfo?.file?.name;
  if (!fileName) fail("Files API не вернул имя входного файла.");

  const created = await fetch(`${API_BASE}/v1beta/models/${MODEL}:batchGenerateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      batch: {
        display_name: `shorts-meme-tts-${new Date().toISOString()}`,
        input_config: { file_name: fileName },
      },
    }),
  });
  const job = await jsonResponse(created, "Не удалось создать Gemini Batch");
  if (!job?.name) fail("Gemini Batch не вернул имя job.");
  writeFileSync(resolve(workDir, "job.json"), `${JSON.stringify({ name: job.name, inputFile: fileName, createdAt: new Date().toISOString() }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ name: job.name, state: job.state || job.metadata?.state || "submitted" })}\n`);
}

async function status() {
  requireApiKey();
  const job = readJson(resolve(workDir, "job.json"));
  const response = await fetch(`${API_BASE}/v1beta/${job.name}`, { headers: { "x-goog-api-key": apiKey } });
  const body = await jsonResponse(response, "Не удалось получить статус Gemini Batch");
  writeFileSync(resolve(workDir, "status.json"), `${JSON.stringify(body, null, 2)}\n`);
  const state = batchState(body);
  process.stdout.write(`${JSON.stringify({ name: job.name, state, done: TERMINAL_STATES.has(state), stats: body.batchStats || body.metadata?.batchStats || null })}\n`);
}

async function collect() {
  requireApiKey();
  const job = readJson(resolve(workDir, "job.json"));
  const response = await fetch(`${API_BASE}/v1beta/${job.name}`, { headers: { "x-goog-api-key": apiKey } });
  const body = await jsonResponse(response, "Не удалось получить результат Gemini Batch");
  const state = batchState(body);
  if (!state.endsWith("_SUCCEEDED")) fail(`Batch ещё не завершён успешно: ${state}`);
  const responseFile = body.dest?.fileName || body.response?.responsesFile || body.metadata?.output?.responsesFile;
  if (!responseFile) fail("Batch не вернул responses file; inline-вывод этим сборщиком не поддерживается.");

  const download = await fetch(`${API_BASE}/download/v1beta/${responseFile}:download?alt=media`, {
    headers: { "x-goog-api-key": apiKey },
  });
  if (!download.ok || !download.body) fail(`Не удалось скачать результаты: ${download.status} ${await safeText(download)}`);
  const responsesPath = resolve(workDir, "responses.jsonl");
  await pipeline(Readable.fromWeb(download.body), createWriteStream(responsesPath));

  const audioDir = resolve(workDir, "wav");
  mkdirSync(audioDir, { recursive: true });
  let saved = 0;
  const failures = [];
  const lines = createInterface({ input: createReadStream(responsesPath), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    const key = String(item.key || item.metadata?.key || `unknown-${saved + failures.length + 1}`);
    if (item.error) {
      failures.push({ key, error: item.error.message || item.error });
      continue;
    }
    const parts = item.response?.candidates?.[0]?.content?.parts || [];
    const audio = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const data = audio?.inlineData?.data || audio?.inline_data?.data;
    if (!data) {
      failures.push({ key, error: "audio data missing" });
      continue;
    }
    writeFileSync(resolve(audioDir, `${basename(key)}.wav`), pcmToWav(Buffer.from(data, "base64")));
    saved += 1;
  }
  writeFileSync(resolve(workDir, "collect-report.json"), `${JSON.stringify({ saved, failed: failures.length, failures }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ saved, failed: failures.length, audioDir })}\n`);
}

function buildPrompt(item) {
  const visual = String(item.visualDescription || "").trim();
  const acting = String(item.actingDirection || "natural conversational meme delivery").trim();
  return [
    "# AUDIO PROFILE",
    "Language: Russian. Adult female meme narrator with clear natural diction.",
    "Read only the transcript below. Do not announce these instructions.",
    "",
    "## SCENE",
    "Close-mic vertical meme voiceover, clean studio sound, no music.",
    visual ? `Visual context for acting only: ${visual}` : "",
    "",
    "## DIRECTOR'S NOTES",
    acting,
    "Keep reactions restrained and semantically placed. Do not add, remove, paraphrase, repeat, or explain words.",
    "",
    "## TRANSCRIPT",
    item.spokenText,
  ].filter(Boolean).join("\n");
}

function pcmToWav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24);
  header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function readJson(path) {
  if (!existsSync(path)) fail(`Файл не найден: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}

function requireApiKey() {
  if (!apiKey) fail("Gemini API key не загружен в окружение.");
}

function batchState(body) {
  return body.state || body.metadata?.state || "JOB_STATE_UNSPECIFIED";
}

async function jsonResponse(response, prefix) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!response.ok) fail(`${prefix}: ${response.status} ${body?.error?.message || text.slice(0, 500)}`);
  return body;
}

async function safeText(response) {
  return (await response.text()).slice(0, 500).replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]");
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

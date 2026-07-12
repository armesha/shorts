#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const manifestPath = resolve(arg("manifest", "output/speech/memoteka-267-batch/manifest.json"));
const audioDir = resolve(arg("audio-dir", "output/speech/memoteka-267-batch/wav"));
const imageDir = resolve(arg("image-dir", "tmp/memoteka-267-audit"));
const outDir = resolve(arg("out-dir", "tmp/memoteka-267-videos"));
const workDir = resolve(arg("work-dir", "tmp/memoteka-267-video-work"));
const progressPath = resolve(outDir, "progress.json");
const safetyPath = resolve(arg("safety", "data/voiced-memes-ru/safety-review.json"));
const gameplayPoolConfig = resolve(arg("gameplay-pool-config", "data/voiced-memes-ru/gameplay-sources.json"));
const gameplaySourceHistory = resolve(arg("gameplay-source-history", resolve(outDir, "gameplay-source-history.json")));
const gameplaySegmentHistory = resolve(arg("gameplay-segment-history", resolve(outDir, "gameplay-history.json")));
const limit = Number(arg("limit", "0"));
mkdirSync(outDir, { recursive: true });
mkdirSync(workDir, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const safety = existsSync(safetyPath) ? JSON.parse(readFileSync(safetyPath, "utf8")) : { reject: {}, borderline: {} };
const blocked = new Set([...Object.keys(safety.reject || {}), ...Object.keys(safety.borderline || {})]);
const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, "utf8")) : { completed: [], failed: [] };
const completed = new Set(progress.completed || []);
const music = spawnSync("bash", ["-lc", "find assets/audio/memes -maxdepth 1 -type f -name 'bed-*.mp3' | sort"], { encoding: "utf8" }).stdout.trim().split("\n").filter(Boolean);
const server = spawn("npx", ["vite", "tmp/shino-transparent-render", "--host", "127.0.0.1", "--port", "4179"], { stdio: "ignore" });
await waitForUrl("http://127.0.0.1:4179");

let built = 0;
try {
  for (let index = 0; index < manifest.length; index += 1) {
    const item = manifest[index];
    if (blocked.has(item.id)) continue;
    if (completed.has(item.id)) continue;
    if (limit > 0 && built >= limit) break;
    const wav = resolve(audioDir, `${item.id}.wav`);
    const image = resolve(imageDir, item.sourceFile);
    if (!existsSync(wav) || !existsSync(image)) continue;
    const frames = resolve(workDir, `frames-${item.id}`);
    const avatar = resolve(workDir, `avatar-${item.id}.mov`);
    const base = resolve(workDir, `base-${item.id}.mp4`);
    const final = resolve(outDir, `${item.id}.mp4`);
    try {
      const duration = probe(wav);
      run(process.execPath, ["tmp/shino-transparent-render/capture-offline.mjs", String(duration), frames]);
      run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-framerate", "30", "-i", resolve(frames, "frame-%05d.png"), "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "qtrle", "-pix_fmt", "argb", "-c:a", "pcm_s16le", "-shortest", avatar]);
      const style = JSON.parse(run(process.execPath, ["scripts/select-avatar-style.mjs", "--history", resolve(outDir, "avatar-style-history.json")], true));
      const gameplay = JSON.parse(run(process.execPath, ["scripts/select-gameplay-source.mjs", "--pool-config", gameplayPoolConfig, "--history", gameplaySourceHistory], true));
      run(process.execPath, ["scripts/build-voiced-meme-short.mjs", "--meme", image, "--avatar", avatar, "--gameplay", gameplay.source, "--avatar-background", style.backgroundFile, "--ring-color", style.ringColor, "--history", gameplaySegmentHistory, "--output", base]);
      const track = music[index % music.length];
      const fade = Math.max(0, duration - 0.6).toFixed(3);
      run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", base, "-stream_loop", "-1", "-i", track, "-filter_complex", `[1:a]volume=0.035,afade=t=in:st=0:d=0.4,afade=t=out:st=${fade}:d=0.6[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=9[outa]`, "-map", "0:v", "-map", "[outa]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final]);
      run(process.execPath, ["scripts/publish-voiced-memes-pack.mjs", "--input", final, "--id", `vmru_batch_${item.id}`, "--title", titleFor(item)]);
      completed.add(item.id);
      progress.completed = [...completed];
      built += 1;
      process.stdout.write(`${JSON.stringify({ id: item.id, built, totalCompleted: completed.size, final })}\n`);
    } catch (error) {
      progress.failed.push({ id: item.id, error: error.message, at: new Date().toISOString() });
    } finally {
      rmSync(frames, { recursive: true, force: true });
      rmSync(avatar, { force: true });
      rmSync(base, { force: true });
      writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
    }
  }
} finally {
  server.kill("SIGTERM");
}

function run(cmd, args, capture = false) {
  const result = spawnSync(cmd, args, { encoding: capture ? "utf8" : undefined, stdio: capture ? "pipe" : "inherit" });
  if (result.status !== 0) throw new Error(`${cmd} завершился с кодом ${result.status}: ${result.stderr || ""}`);
  return capture ? result.stdout.trim() : "";
}
function probe(file) {
  const value = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], true));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Некорректная длительность ${file}`);
  return value;
}
async function waitForUrl(url) {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Vite renderer не запустился");
}
function arg(name, fallback) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : fallback; }
function titleFor(item) {
  const text = String(item.transcript || item.introComment || item.id).replace(/\s+/g, " ").trim();
  return text.length > 72 ? `${text.slice(0, 69).trimEnd()}…` : text;
}

import { createReadStream, existsSync } from "node:fs";
import { readFile, realpath, stat, writeFile, rm, copyFile, rename } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { runCuttingProcess } from "../video-cutting.ts";
import { localPlannerArgs } from "../video-cutting.ts";
import { BANNER_SLOT, VIDEO_SECONDS, mapSubtitles } from "./theme.ts";
import { mapPlannerExecutable, type MapIdea } from "./planner.ts";
import type { Metric } from "./sources.ts";

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/json", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

export async function serveRenderScene(source: string, built: string, theme: any) {
  const index = (await readFile(resolve(built, "index.html"), "utf8")).replace("</head>", `<style>
    html.capture-mode #map{position:absolute;top:230px;height:1250px;width:1080px}
    html.capture-mode .map-legend{top:255px;font-size:30px;right:35px}
    html.capture-mode .winner-banner{bottom:455px;width:88%;font-size:31px}
    html.capture-mode .floating-watermark{display:none!important}
    </style></head>`);
  const roots = { assets: await realpath(built), public: await realpath(resolve(source, "public")) };
  const server = createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
      const relative = pathname.replace(/^\/map-studio\//, "");
      if (relative === "" || relative === "index.html") { res.setHeader("Content-Type", "text/html"); res.end(index); return; }
      if (relative === `data/themes/${theme.id}.json` || relative === `data/themes/${theme.id}-ru.json`) {
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(theme)); return;
      }
      if (!/^(assets|data|fonts|images)\//.test(relative) || relative.includes("..") || relative.includes("\\") || !MIME[extname(relative)]) { res.writeHead(404).end(); return; }
      const root = relative.startsWith("assets/") ? roots.assets : roots.public;
      const file = await realpath(resolve(root, relative));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", MIME[extname(file)]);
      createReadStream(file).on("error", () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}/map-studio/`, close: () => new Promise<void>(accept => { server.close(() => accept()); server.closeAllConnections(); }) };
}

export async function renderMapVideo(input: { source: string; built: string; directory: string; theme: any; idea: MapIdea; metric: Metric; signal: AbortSignal; stage: (message: string) => Promise<void> }) {
  const { source, directory, theme, idea, metric, signal } = input;
  const run = (bin: string, args: string[], cwd = process.cwd(), timeoutMs = 120_000) => runCuttingProcess(bin, args, { cwd, signal, timeoutMs });
  const probe = async (file: string) => JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]));
  await writeFile(resolve(directory, "voice-input.json"), JSON.stringify({ text: idea.hook }));
  await input.stage("Озвучка Kore");
  const envFile = resolve(source, ".env");
  const voice = resolve(directory, "voice.wav");
  if (!existsSync(voice)) await run(process.execPath, [...(existsSync(envFile) ? [`--env-file=${envFile}`] : []), "--import", "tsx", "scripts/map-pipeline-voice.ts", resolve(directory, "voice-input.json"), voice]);
  const voiceProbe = await probe(voice);
  const speechSeconds = Number(voiceProbe.format.duration);
  if (!(speechSeconds > 0.5 && speechSeconds <= 8)) throw new Error("Вступительная озвучка вышла за допустимую длительность.");
  await writeFile(resolve(directory, "subtitles.ass"), mapSubtitles(idea, metric, speechSeconds));
  const music = resolve(source, "public/audio/music-reference/carefree.mp3");
  const audio = resolve(directory, "soundtrack.m4a");
  await run("ffmpeg", ["-y", "-stream_loop", "-1", "-i", music, "-i", voice,
    "-filter_complex", `[0:a]atempo=1.15,volume='if(lt(t,${speechSeconds + 0.2}),0.12,if(lt(t,${speechSeconds + 0.7}),0.12+0.4*(t-${speechSeconds + 0.2})/0.5,0.52))':eval=frame,afade=t=out:st=${VIDEO_SECONDS - 3}:d=3:curve=exp[m];[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,adelay=200|200[v];[m][v]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`,
    "-map", "[a]", "-t", String(VIDEO_SECONDS), "-ac", "2", "-c:a", "aac", "-b:a", "192k", audio]);
  await input.stage("Рендер карты");
  const { validateTheme } = await import(pathToFileURL(resolve(source, "src/theme.js")).href);
  validateTheme(theme);
  const scene = await serveRenderScene(source, input.built, theme);
  const raw = resolve(directory, "raw.mp4");
  try {
    const preview = resolve(directory, "preflight.mp4");
    await run(process.execPath, ["scripts/export-video.mjs", "--url", scene.url, "--theme", theme.id, "--lang", "ru", "--duration", "3", "--output", preview, "--overwrite"], source, 10 * 60_000);
    const preflight = await probe(preview);
    if (preflight.streams[0]?.width !== 1080 || preflight.streams[0]?.height !== 1920 || Math.abs(Number(preflight.format.duration) - 3) > 0.1) throw new Error("Пробный экспорт карты не прошёл проверку.");
    await run(process.execPath, ["scripts/export-video.mjs", "--url", scene.url, "--theme", theme.id, "--lang", "ru", "--output", raw, "--overwrite"], source, 4 * 3600_000);
  } finally { await scene.close(); }
  const destination = resolve(directory, "video.mp4");
  const final = resolve(directory, "video.pending.mp4");
  const subs = resolve(directory, "subtitles.ass").replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const fonts = resolve(source, "public/fonts").replace(/:/g, "\\:");
  await run("ffmpeg", ["-y", "-i", raw, "-i", audio, "-vf", `subtitles='${subs}':fontsdir='${fonts}'`, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-c:a", "copy", "-movflags", "+faststart", "-metadata", "comment=Carefree — Kevin MacLeod (incompetech.com), CC BY 4.0; tempo 1.15x. World Bank WDI, CC BY 4.0; translated, rounded; regional estimates marked ≈.", final], process.cwd(), 30 * 60_000);
  await input.stage("Проверка видео и кадров");
  const media = await probe(final);
  const videoStream = media.streams.find((s: any) => s.codec_type === "video");
  const audioStream = media.streams.find((s: any) => s.codec_type === "audio");
  if (videoStream?.width !== 1080 || videoStream?.height !== 1920 || videoStream?.codec_name !== "h264" || videoStream?.pix_fmt !== "yuv420p" || videoStream?.r_frame_rate !== "30/1" || audioStream?.codec_name !== "aac" || audioStream?.channels !== 2 || Math.abs(Number(media.format.duration) - VIDEO_SECONDS) > 0.15) throw new Error("MP4 не прошёл техническую проверку.");
  const handle = await import("node:fs/promises").then(fs => fs.open(final, "r"));
  const header = Buffer.alloc(1024 * 1024);
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  if (header.indexOf("moov") < 0 || header.indexOf("moov") > header.indexOf("mdat") && header.indexOf("mdat") >= 0) throw new Error("MP4 не подготовлен для быстрого воспроизведения.");
  const images: string[] = [];
  for (const [index, second] of [0, 3, 30, 60, 85].entries()) {
    const image = resolve(directory, `frame-${index}.jpg`);
    await run("ffmpeg", ["-y", "-ss", String(second), "-i", final, "-frames:v", "1", "-q:v", "2", image]);
    images.push(image);
  }
  await copyFile(images[2], resolve(directory, "poster.jpg"));
  await run("ffmpeg", ["-y", "-i", final, "-vf", "fps=1/18,scale=270:480,tile=5x1", "-frames:v", "1", resolve(directory, "contact-sheet.jpg")]);
  const reviewDir = resolve(directory, "review");
  await import("node:fs/promises").then(fs => fs.mkdir(reviewDir, { recursive: true }));
  await writeFile(resolve(reviewDir, "plan-schema.json"), JSON.stringify({ type: "object", additionalProperties: false, required: ["passed", "issues"], properties: { passed: { type: "boolean" }, issues: { type: "array", items: { type: "string" } } } }));
  const args = localPlannerArgs(reviewDir);
  args.splice(args.length - 1, 0, ...images.flatMap(file => ["--image", file]));
  await runCuttingProcess(mapPlannerExecutable(), args, { cwd: reviewDir, signal, timeoutMs: 240_000,
    stdin: `Проверь реальные кадры ролика. Критерии: читаемый постоянный заголовок, карта и числовые метки без артефактов, итоговая карточка без обрезки, нижнее неподвижное место под баннер не занято движущимся водяным знаком. Первые кадры могут показывать ещё не раскрытую карту. Проверяй только наблюдаемое; не выдумывай проблемы из отсутствия звука на картинках. Верни passed=true только при отсутствии существенных видимых ошибок, иначе перечисли issues. Заголовок: ${idea.title}; показатель: ${metric.name}; единицы: ${metric.unit}; год: ${metric.year}. Полоса баннера: ${JSON.stringify(BANNER_SLOT)}. Вступление: ${idea.hook}.` });
  const review = JSON.parse(await readFile(resolve(reviewDir, "plan-result.json"), "utf8"));
  await writeFile(resolve(directory, "qa.json"), JSON.stringify({ media, review, bannerSlot: BANNER_SLOT, speechSeconds, subtitleTiming: "word durations proportional to character lengths within measured audio interval", checkedAt: new Date().toISOString() }, null, 2));
  if (review.passed !== true || !Array.isArray(review.issues) || review.issues.length) throw new Error("Видео требует исправления после проверки кадров.");
  await rename(final, destination);
  await rm(raw, { force: true });
  return { seconds: VIDEO_SECONDS, video: destination, poster: resolve(directory, "poster.jpg"), speechSeconds };
}

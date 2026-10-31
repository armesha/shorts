import { rename, rm } from "node:fs/promises";
import { extname, resolve } from "node:path";
import type { CircleAdvertiser } from "./circle-advertisers.ts";
import type { ProcessRunner } from "./video-cutting.ts";

export function cuttingBannerFilter(index: number, item: CircleAdvertiser, base: string, output: string) {
  const crop = item.fullFrame !== false ? "crop=900:260:90:830," : "";
  const alpha = item.transparent !== false ? "format=rgba" : `format=rgba,chromakey=${(item.chromaColor || "#00ff00").replace("#", "0x")}:${item.similarity ?? 0.18}:${item.blend ?? 0.08}`;
  return `[${index}:v]${crop}scale=900:260:force_original_aspect_ratio=decrease,${alpha},pad=900:260:(ow-iw)/2:(oh-ih)/2:color=black@0,fps=30,setpts=PTS-STARTPTS[banner];[${base}][banner]overlay=90:1420:eof_action=repeat:shortest=0[${output}];`;
}

export async function overlayExistingCuttingBanner(input: {
  file: string; banner: { item: CircleAdvertiser; file: string }; bannerHash: string;
  run: ProcessRunner; signal?: AbortSignal;
}) {
  if (!/\.mp4$/i.test(input.file)) throw new Error("Нужен MP4-файл.");
  const probe = async (file: string) => JSON.parse(await input.run(process.env.VIDEO_CUTTING_FFPROBE || "ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { cwd: process.cwd(), signal: input.signal, timeoutMs: 30_000 }));
  const before = await probe(input.file);
  const marked = before.format?.tags?.cutting_banner_sha256;
  if (marked === input.bannerHash) return "already";
  if (marked) throw new Error("Видео уже содержит другой баннер; нужна исходная версия.");
  const duration = Number(before.format?.duration);
  const video = before.streams?.find((stream: { codec_type?: string }) => stream.codec_type === "video");
  if (!video || video.width !== 1080 || video.height !== 1920 || !Number.isFinite(duration) || duration <= 0) throw new Error("Исходный ролик не прошёл проверку.");
  const temp = input.file.replace(/\.mp4$/i, ".banner-rebuild.mp4");
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-filter_complex_threads", "1", "-i", input.file];
  if (/\.(png|jpe?g|webp)$/i.test(input.banner.file)) args.push("-loop", "1");
  else args.push("-stream_loop", "-1");
  if (extname(input.banner.file).toLowerCase() === ".webm") args.push("-c:v", "libvpx-vp9");
  args.push("-i", input.banner.file, "-filter_complex", cuttingBannerFilter(1, input.banner.item, "0:v", "out").replace(/;$/, ""),
    "-map", "[out]", "-map", "0:a?", "-map_metadata", "0", "-t", String(duration), "-r", "30",
    "-c:v", "libx264", "-preset", "superfast", "-crf", "20", "-threads", "2", "-c:a", "copy",
    "-metadata", `cutting_banner_sha256=${input.bannerHash}`, "-movflags", "+faststart+use_metadata_tags", temp);
  try {
    await input.run(process.env.VIDEO_CUTTING_FFMPEG || "ffmpeg", args, { cwd: resolve(input.file, ".."), signal: input.signal, timeoutMs: Math.max(5 * 60_000, duration * 12_000) });
    const after = await probe(temp);
    const next = after.streams?.find((stream: { codec_type?: string }) => stream.codec_type === "video");
    if (!next || next.width !== 1080 || next.height !== 1920 || Math.abs(Number(after.format?.duration) - duration) > 0.2 || after.format?.tags?.cutting_banner_sha256 !== input.bannerHash ||
      (!!before.streams?.some((stream: { codec_type?: string }) => stream.codec_type === "audio") !== !!after.streams?.some((stream: { codec_type?: string }) => stream.codec_type === "audio")))
      throw new Error("Ролик с баннером не прошёл проверку.");
    await rename(temp, input.file);
    return "rebuilt";
  } catch (error) { await rm(temp, { force: true }); throw error; }
}

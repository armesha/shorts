import { copyFile, mkdir, mkdtemp, open, readFile, rm } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { circleAdvertiserSource, circleAdvertiserState } from "../server/services/circle-advertisers.ts";
import { cuttingBannerHash, overlayExistingCuttingBanner } from "../server/services/cutting-banner.ts";
import { runCuttingProcess, type CutJob } from "../server/services/video-cutting.ts";

const owner = Number(process.argv[2]);
const id = process.argv[3] || "";
if (!Number.isSafeInteger(owner) || owner < 1 || !/^[a-f\d-]{36}$/.test(id)) throw new Error("Expected owner id and cutting job id.");
const root = resolve(process.cwd(), "data/video-cutting", `u${owner}`, id);
const job = JSON.parse(await readFile(resolve(root, "job.json"), "utf8")) as CutJob;
if (job.id !== id || job.userId !== owner || !["completed", "failed", "cancelled"].includes(job.status) || !job.clips.length)
  throw new Error("The job must be finished and contain completed clips.");
const state = circleAdvertiserState();
const item = state.advertisers.find(entry => entry.id === state.activeAdvertiserId);
if (!item) throw new Error("No active banner is available.");
const lockPath = resolve(root, "banner-rebuild.lock");
const lock = await open(lockPath, "wx", 0o600);
const parent = resolve(process.cwd(), "tmp/cutting-banner-rebuild");
let temp: string | undefined;
const controller = new AbortController();
const stop = () => controller.abort();
process.on("SIGINT", stop); process.on("SIGTERM", stop);
try {
  await mkdir(parent, { recursive: true });
  temp = await mkdtemp(resolve(parent, "run-"));
  const source = circleAdvertiserSource(item.id);
  const banner = resolve(temp, `banner${extname(source)}`);
  await copyFile(source, banner);
  const bannerHash = await cuttingBannerHash(banner);
  for (const clip of job.clips) {
    controller.signal.throwIfAborted();
    if (!Number.isSafeInteger(clip.number) || clip.number < 1 || clip.number > 200) throw new Error("Invalid clip number.");
    const file = resolve(process.cwd(), "data/output/creator", `cutting-u${owner}`, id, `part-${clip.number}.mp4`);
    const status = await overlayExistingCuttingBanner({ file, banner: { item, file: banner }, bannerHash, run: runCuttingProcess, signal: controller.signal });
    console.log(`${clip.number}/${job.clips.length}: ${status}`);
  }
} finally {
  process.off("SIGINT", stop); process.off("SIGTERM", stop);
  if (temp) await rm(temp, { recursive: true, force: true });
  await lock.close(); await rm(lockPath, { force: true });
}

import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { prepareCircleEvidence, validateRenderedCircle } from "./media.ts";
import { reviewCircleEvidence } from "./review.ts";
import { transcribeCircle } from "./transcribe.ts";
import { renderCircleVideo } from "../circle-video-renderer.ts";
import { activeCircleTemplateId, getCircleTemplate } from "../circle-templates.ts";
import { circleAdvertiserState } from "../circle-advertisers.ts";
import { listCircleGameplays, resolveCircleGameplay } from "../circle-gameplay-library.ts";
import { withGlobalRenderSlot } from "../../infra/rate-limits.ts";

/** A failed or uncertain review cannot reach the renderer. */
export async function processCircleCandidate(input: {
  source: string; directory: string; messageId: number; signal?: AbortSignal;
}, deps: {
  prepare?: typeof prepareCircleEvidence; transcribe?: typeof transcribeCircle;
  review?: typeof reviewCircleEvidence; render?: (source: string, output: string) => Promise<void>;
  validate?: typeof validateRenderedCircle;
} = {}): Promise<{ verdict: "accept" | "borderline" | "reject"; video?: string; reasons?: string[] }> {
  if (!Number.isSafeInteger(input.messageId) || input.messageId <= 0) throw new Error("Invalid source message");
  const dir = resolve(input.directory);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const evidence = await (deps.prepare ?? prepareCircleEvidence)(resolve(input.source), resolve(dir, "evidence"));
  const transcript = evidence.audio ? await (deps.transcribe ?? transcribeCircle)(evidence.audio, { signal: input.signal }) : null;
  const review = await (deps.review ?? reviewCircleEvidence)({ directory: resolve(dir, "review"),
    frames: evidence.frames, audioPresent: Boolean(evidence.audio), transcript: transcript?.text ?? "", signal: input.signal });
  const record = { source: `https://t.me/kruglyashiki/${input.messageId}`, duration: evidence.duration,
    transcript, review, checkedAt: new Date().toISOString(), model: "gpt-6.1-terra", reasoning: "medium" };
  await writeFile(resolve(dir, "review.json"), JSON.stringify(record, null, 2), { mode: 0o600 });
  if (review.verdict !== "accept") return { verdict: review.verdict, reasons: review.reasons };
  const pending = resolve(dir, "video.pending.mp4");
  const output = resolve(dir, "video.mp4");
  const render = deps.render ?? (async (source: string, target: string) => {
    const banner = circleAdvertiserState();
    if (!banner.bannerEnabled || !banner.activeAdvertiserId) throw new Error("Active banner is required");
    const template = getCircleTemplate(activeCircleTemplateId());
    if (!template) throw new Error("Active circle template is required");
    const gameplays = listCircleGameplays();
    const name = gameplays[Math.floor(Math.random() * gameplays.length)];
    const gameplay = name && resolveCircleGameplay(name);
    if (!gameplay) throw new Error("Circle background video is required");
    await withGlobalRenderSlot(() => renderCircleVideo({ sourceFile: source, gameplayFile: gameplay,
      outputFile: target, layout: template.layout, requireBanner: true,
      ffmpegExecutable: process.env.FFMPEG_PATH?.trim() || "ffmpeg" }));
  });
  await render(resolve(input.source), pending);
  await (deps.validate ?? validateRenderedCircle)(pending, evidence.duration, Boolean(evidence.audio));
  await rename(pending, output);
  return { verdict: "accept", video: output };
}

// Shared "build one library still-video" plumbing, factored out of the 4 places that hand-rolled it
// (buildLibraryVideo, the anecdote-video handler, pack-gen and packs-routes). Each used the same
// stamp → library/<prefix>-<stamp>.{png,mp4} → render → assembleStillVideo shape; only the render
// front-end differed (renderAnecdote vs renderTemplateCard).
//
// buildStillVideoFiles also wraps the render+assemble in metrics.track("render", …), so EVERY render
// path (anecdote, pack, …) is counted by the graceful-shutdown drain — previously pack/fact renders
// were invisible to it and could be torn down mid-encode on a restart.
import { resolve } from "node:path";
import { assembleStillVideo, type MotionOverlay } from "../../src/video.ts";
import type { CardValues, RoleRule } from "../../src/packs/store.ts";
import * as metrics from "./metrics.ts";

/**
 * Render a still to `library/<prefix>-<stamp>.png` and assemble it into a 6s mp4 beside it.
 * `render(imgAbs)` does the actual drawing (renderAnecdote / renderTemplateCard / …) and its return
 * value is passed back as `render`. The whole render+assemble is counted as an active "render" task.
 */
export async function buildStillVideoFiles<T>(opts: {
  prefix: string; // "vid" | "pack" | …
  outputDir: string; // base.outputDir (relative to cwd)
  audioPath: string | null;
  durationSec?: number;
  audioVolume?: number;
  fadeAudio?: boolean;
  motionOverlay?: MotionOverlay | null;
  render: (imgAbs: string) => Promise<T>;
}): Promise<{ imgRel: string; vidRel: string; render: T }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const imgRel = `library/${opts.prefix}-${stamp}.png`;
  const vidRel = `library/${opts.prefix}-${stamp}.mp4`;
  const imgAbs = resolve(process.cwd(), opts.outputDir, imgRel);
  const vidAbs = resolve(process.cwd(), opts.outputDir, vidRel);
  const render = await metrics.track("render", async () => {
    const r = await opts.render(imgAbs);
    await assembleStillVideo(imgAbs, vidAbs, {
      durationSec: opts.durationSec ?? 6,
      audioPath: opts.audioPath,
      audioVolume: opts.audioVolume,
      fadeAudio: opts.fadeAudio,
      motionOverlay: opts.motionOverlay,
    });
    return r;
  });
  return { imgRel, vidRel, render };
}

/**
 * Title + readable text of a custom-pack card (for the video name + YouTube description).
 * Single copy — was duplicated verbatim as cardReadable (pack-gen) and cardTitleAndText (packs-routes).
 */
export function cardReadable(values: CardValues, rules: RoleRule[]): { title: string; text: string } {
  let title = "";
  const parts: string[] = [];
  for (const r of rules) {
    const v = values[r.role];
    if (v == null) continue;
    if (!r.list && typeof v === "string" && !title) title = v;
    parts.push(Array.isArray(v) ? v.map((x) => `• ${x}`).join("\n") : String(v));
  }
  return { title: (title || "Карточка").slice(0, 100), text: parts.join("\n\n") };
}

import { resolve } from "node:path";
import { randomAnecdote, anecdoteKey } from "./library.ts";
import { getDeck } from "./decks.ts";
import { ytMeta } from "./yt-meta.ts";
import { renderAnecdote } from "./render.ts";
import { assembleStillVideo, pickLifehackMotionOverlay, resolveAudio } from "../video.ts";

export interface ProducedVideo {
  videoPath: string;
  imagePath: string;
  title: string;
  text: string;
  bg: string;
  key: string; // anecdote key → caller marks it used so it never repeats
  ytTitle: string;
  ytDescription: string;
  ytTags: string[];
}

/** Full no-AI pipeline: pick a titled anecdote from `deckId` → render → assemble 6s MP4 + YT metadata. */
export async function produceAnecdoteVideo(
  outputDir: string,
  deckId: string,
  used?: ReadonlySet<string>,
): Promise<ProducedVideo | null> {
  const a = randomAnecdote(deckId, used);
  if (!a) return null;
  const deck = getDeck(deckId);
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const imagePath = resolve(outputDir, `out/anek-${stamp}.png`);
  const videoPath = resolve(outputDir, `out/anek-${stamp}.mp4`);
  const r = await renderAnecdote(
    { title: a.title, text: a.text, channel: deck.name, deck: deck.id, profession: a.profession },
    imagePath,
  );
  const motionOverlay = deck.lifehack ? pickLifehackMotionOverlay(`${deck.id}|${a.profession ?? ""}|${a.title}|${a.text}`) : null;
  const audio = resolveAudio(undefined, deck);
  await assembleStillVideo(imagePath, videoPath, { durationSec: 6, audioPath: audio.audioPath, motionOverlay });
  const meta = ytMeta(deck, a.title, a.text);
  return {
    videoPath,
    imagePath,
    title: a.title,
    text: a.text,
    bg: r.bg,
    key: anecdoteKey(a.text),
    ytTitle: meta.title,
    ytDescription: meta.description,
    ytTags: meta.tags,
  };
}

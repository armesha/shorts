import { resolve } from "node:path";
import { randomAnecdote, packItemKey } from "./library.ts";
import { getDeck, isPlainAnecdoteDeck } from "./decks.ts";
import { ytMeta } from "./yt-meta.ts";
import { renderAnecdote, renderJokeMotionOverlay } from "./render.ts";
import {
  assembleStillVideo,
  assembleVideoBackground,
  pickJokeMotionOverlay,
  pickJokeVideoBackground,
  resolveAudio,
} from "../video.ts";

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
  const seed = `${deck.id}|${a.profession ?? ""}|${a.title}|${a.text}`;
  const motionOverlay = isPlainAnecdoteDeck(deck) ? pickJokeMotionOverlay(seed, a.text.length) : null;
  const videoBg = isPlainAnecdoteDeck(deck) ? pickJokeVideoBackground(seed, a.text.length) : null;
  const audio = resolveAudio(undefined, deck);
  const r = videoBg
    ? await renderJokeMotionOverlay({ title: a.title, text: a.text, channel: deck.name, deck: deck.id }, imagePath)
    : await renderAnecdote(
        { title: a.title, text: a.text, channel: deck.name, deck: deck.id, profession: a.profession },
        imagePath,
      );
  if (videoBg) {
    await assembleVideoBackground(videoBg, imagePath, videoPath, { durationSec: 6, audioPath: audio.audioPath, motionOverlay });
  } else {
    await assembleStillVideo(imagePath, videoPath, { durationSec: 6, audioPath: audio.audioPath, motionOverlay });
  }
  const meta = ytMeta(deck, a.title, a.text);
  return {
    videoPath,
    imagePath,
    title: a.title,
    text: a.text,
    bg: r.bg,
    key: packItemKey(a),
    ytTitle: meta.title,
    ytDescription: meta.description,
    ytTags: meta.tags,
  };
}

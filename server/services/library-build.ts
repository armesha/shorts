// `buildLibraryVideo` — render + assemble ONE library still-video, persist it. Moved VERBATIM from
// index.ts. HAZARD: it is called by /api/videos POST, /api/videos/batch, AND the gen-queue worker
// (initGenQueue) — ALL must call this ONE implementation (it preserves the card-claim / no-double-spend
// + no-double-upload guarantees: the anecdote is reserved by the CALLER before this render starts, never
// here). index.ts builds ONE bound copy via makeBuildLibraryVideo(...) and passes it to the videos
// routes AND the gen-queue worker registration.
import type { Db } from "../db.ts";
import { DECKS, getDeck, pickGenericTitle } from "../../src/anecdotes/decks.ts";
import type { PackItem } from "../../src/anecdotes/library.ts";
import { renderAnecdote } from "../../src/anecdotes/render.ts";
import { pickLifehackMotionOverlay, resolveAudio } from "../../src/video.ts";
import { buildStillVideoFiles } from "../infra/media.ts";

export type BuildLibraryVideo = (input: {
  userId: number;
  accountId: number;
  text: string;
  title?: string;
  bg?: string;
  music?: string;
  deck?: string;
  profession?: string;
  item?: PackItem;
}) => Promise<ReturnType<Db["createVideo"]>>;

export function makeBuildLibraryVideo(deps: {
  db: Db;
  outputDir: string;
  builtinDeckVisibleForUser: (userId: number, deck: (typeof DECKS)[number]) => boolean;
}): BuildLibraryVideo {
  const { db, outputDir, builtinDeckVisibleForUser } = deps;

  // Render + assemble one library video, persist it, and mark the anecdote used for THIS user.
  // music: explicit track name | "none" = silent | empty/undefined = random track per video.
  return async function buildLibraryVideo(input) {
    const deck = getDeck(input.deck);
    const builtInDeck = DECKS.find((d) => d.id === deck.id);
    // Backstop (covers save, batch, and the gen-queue worker): never build a deck the user cannot access.
    if (
      db.getUserById(input.userId)?.role !== "admin" &&
      (!builtInDeck || !builtinDeckVisibleForUser(input.userId, builtInDeck))
    )
      throw new Error("Этот пак вам недоступен");
    const title = input.title || pickGenericTitle(deck);
    const { music, audioPath } = resolveAudio(input.music, deck);
    const motionOverlay = deck.lifehack
      ? pickLifehackMotionOverlay(`${deck.id}|${input.profession ?? ""}|${title}|${input.text}`)
      : null;
    const { imgRel, vidRel, render: r } = await buildStillVideoFiles({
      prefix: "vid",
      outputDir,
      audioPath,
      motionOverlay,
      render: (imgAbs) =>
        renderAnecdote(
          { title, text: input.text, channel: deck.name, bg: input.bg, deck: deck.id, profession: input.profession },
          imgAbs,
          input.item,
        ),
    });
    const v = db.createVideo({
      accountId: input.accountId,
      title,
      text: input.text,
      bg: r.bg,
      music,
      deck: deck.id,
      videoRel: vidRel,
      imageRel: imgRel,
    });
    // NB: the anecdote is reserved by the CALLER via db.claimAnecdote BEFORE this render starts
    // (batch/queue), or marked right after by the single-save route — never here (that would be
    // after the await, leaving a window where a concurrent run builds the same card twice).
    return v;
  };
}

---
name: shorts-voiceover
description: Expressive voiceover and MP4 assembly workflow for this Shorts repo. Use when Codex is asked to voice, narrate, dub, or assemble a meme, joke, anecdote, short, Shorts/Reels/TikTok clip, Gemini TTS preview, funny cat meme, or similar vertical video with live pacing, pauses, laughter, music, and copyright-safe/source-backed text and assets.
---

# Shorts Voiceover

## Core Rule

Read `AGENTS.md` and `docs/pack-generation.md` before touching meme, joke, anecdote, voiceover, music, or pack assets. Never read or print `.env*`, API keys, tokens, Google OAuth secrets, or generated session tokens.

For jokes and anecdotes, use only source-backed text. Do not invent joke/anecdote text with an LLM. Prefer existing `data/anecdotes/pack-*.json` items with `source`, `sourceLicense`, and `sourceLines`, or another ledger-backed source. Record provenance in the generated `tmp/.../source.json`.

## Workflow

1. Select the exact spoken text.
   - For repo memes/anecdotes, prefer existing library/deck content first: `deckCards(...)`, `randomAnecdote(...)`, built-in packs, or custom pack cards already used by the app.
   - For memes, use a user-provided line or an existing pack/card line.
   - For jokes/anecdotes, preserve the source wording. Expanding numbers for TTS pronunciation is acceptable if `source.json` records the exact source text.
   - Do not add commentary unless the user explicitly asks for commentary. Non-verbal tags such as `[short pause]`, `[sighs]`, `[whispers]`, and `[laughs]` are acceptable when they fit the joke.
   - When the user asks to act out a meme, map each source line to one physical or emotional beat before generating. Keep the words unchanged; add inline English audio tags only for the exact breaths, laughs, pauses, or reactions the user requested.

2. Select safe assets.
   - Images: prefer local Pexels-ledgered files such as `data/memes/photos/sources.jsonl`, generated assets, CC0/Public Domain, or explicit compatible licenses.
   - Joke/anecdote video backgrounds: prefer `data/joke-video-backgrounds/sources.json` plus `assets/fact-videos/joke-backgrounds/`.
   - Music: use existing local pools such as `assets/audio/memes/` for memes and `assets/audio/anekdoty/` for anecdotes. Keep it quiet under speech.
   - Record image/background/music source and license in `tmp/.../source.json`.

3. Direct Gemini TTS like a voice actor.
   - Use a structured prompt equivalent to `AUDIO PROFILE`, `THE SCENE`, `DIRECTOR'S NOTES`, and `TRANSCRIPT`.
   - Put moment-to-moment control in the transcript with English tags: `[amusement]`, `[curiosity]`, `[sarcasm]`, `[whispers]`, `[sighs]`, `[laughs]`, `[short pause]`, `[medium pause]`, `[slow]`, `[fast]`.
   - Keep tags separated by spoken text or punctuation; avoid stacking adjacent tags.
   - Use commas and ellipses for natural flow; avoid chopping every phrase into separate sentences.
   - If Gemini rejects the prompt for an unspecified policy reason, simplify persona/scene/style first and keep the transcript intact.

4. Generate audio without exposing secrets.
   - Prefer the running backend route `/api/audio/gemini/preview` so the server-side key stays on the server.
   - If a temporary super-admin session is needed for a local script, create it through `data/app.db`, use it only in memory, do not print it, and delete it in `finally`.
   - Save `voice-*.wav`, `tts-input.json`, and `tts-meta.json` without `audioDataUrl`.

5. Assemble the short.
   - Output 1080x1920 MP4.
   - For built-in anecdote decks, render the card through the current app renderer (`renderAnecdote` / deck template pipeline) instead of inventing a separate visual style.
   - Keep readable text away from the bottom UI area and right action column.
   - Do not add automatic image zoom, Ken Burns movement, or `zoompan` by default. Use a stable frame, sourced motion background, or explicit cuts/transitions unless the user asks for zoom.
   - Normalize speech around `-15 LUFS`; keep music low, usually `0.04`-`0.06` volume before final loudness normalization.
   - For higher meme voices, light post-pitching is usually enough: raise pitch about 5-8% and compensate tempo so duration stays natural.

6. Verify before final response.
   - Run `ffprobe` for duration, streams, resolution, and audio sample rate.
   - Extract and inspect at least one frame with `view_image`.
   - Report final MP4 paths under `tmp/`.
   - State whether a server restart is needed; tmp-only media generation does not need a restart.

## Presets

Read `references/presets.md` when choosing a voice/style for a new meme or anecdote. Use the preset as a starting point, then adapt it to the exact text.

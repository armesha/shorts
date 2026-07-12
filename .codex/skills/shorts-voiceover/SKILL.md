---
name: shorts-voiceover
description: Generate or direct voiceover for user-provided memes and reaction Shorts in the shorts-factory repository. Use for meme narration, Gemini TTS, acting reactions, pauses, laughs, sighs, avatar lip-sync, or audio-only meme requests.
---

# Shorts Voiceover

## Project routing

- Work only in `/home/davtian/Documents/shorts`.
- For meme voiceover, use the project's `Gemini 3.1 Flash TTS` implementation in
  `server/services/gemini-tts.ts`. Do not switch to the generic OpenAI speech skill or ask for
  `OPENAI_API_KEY` unless the user explicitly requests OpenAI TTS.
- The production Gemini key is supplied to `shorts.service` through `/etc/shorts/gemini.env`.
  Load it only as runtime environment for an authorized generation command. Never print, inspect,
  copy, commit, or expose its contents.
- Read the complete `docs/pack-generation.md` before changing pack or voiceover workflow rules. The
  section `Реакционные Shorts из пользовательского мема` is authoritative for meme delivery.

## Audio-only meme workflow

1. Inspect every meme image visually. Do not treat OCR or extracted text as the primary analysis:
   understand the picture, layout, characters, labels, facial expressions, and visible joke together.
   OCR may help with transcription, but a vision-capable agent must verify it against the image.
2. Before transcription or TTS, apply a mandatory visual safety and rights gate to the whole meme:
   - reject watermarks, unclear third-party ownership, movie/cartoon/game/anime frames, celebrity or
     identifiable-person ridicule, protected characters/brands, and other likely copyright or reused-content risks;
   - reject targeted harassment or humiliation, protected-class slurs/stereotypes or hate, sexual content,
     threats, graphic violence, promotion or joking encouragement of suicide/self-harm, and other clear
     YouTube policy risks;
   - mark ambiguous profanity, dark self-irony, implied harm, or borderline context for individual review;
     do not send borderline items to TTS or rendering automatically.
3. Transcribe the visible meme text exactly. Preserve wording, punctuation, slang, and profanity.
4. Decide whether a short visual comment helps:
   - for a very short meme, allow one brief conversational observation about what is visibly funny;
   - for a long or self-sufficient meme, add no commentary;
   - never explain the joke or invent a new plot.
5. Analyze setup, escalation, pause, punchline, and emotional turn using both image and text.
6. Pick no more than two compatible acting reactions: dry delivery, smile in the voice, short
   chuckle, disbelieving exhale, tired sigh, surprised inhale, skeptical pause, awkward silence,
   brief whisper, rising disbelief, contained excitement, mock seriousness, gentle sympathy, or a
   sharper final phrase. Do not force laughter into every meme.
7. Use a natural adult Russian female delivery when the user asks for the established girl narrator.
   Keep the original meme text unchanged after any approved intro comment.
8. Generate one WAV per meme. Save final audio under `output/speech/` with stable descriptive names.
9. Validate each file with `ffprobe`: audio stream exists, duration is positive, and the file opens.
   Return absolute clickable paths and briefly state the chosen delivery.

## Large image batches

- Split a large archive into visual-review batches of about 50 images per vision-capable subagent.
- Each subagent must open and inspect every assigned image, not merely run OCR or analyze filenames.
- For every image, return: exact transcript, concise visual description, whether an intro comment is
  useful, the approved comment if any, acting direction, rights/safety status (`accept`, `borderline`,
  or `reject`), and a concrete rejection or review reason when applicable.
- Keep a stable source filename/id so results can be merged without reordering or mismatching audio.
- The main agent reviews the merged decisions for consistency before submitting the Gemini Batch job.
- Do not estimate final quality or choose reactions from text length alone.

## Runtime pattern

Import and call `generateGeminiTtsPreview()` from `server/services/gemini-tts.ts` under a process that
loads `/etc/shorts/gemini.env`. Pass `language: "ru"`, an appropriate Gemini voice, concise style,
pace, scene, energy, and `autoMemeDirection: true`. Decode the returned WAV data URL to the target
file. Do not log the full generated prompt when it could contain user-private text.

Audio generation alone does not require a server restart. Code changes under `server/**` do.

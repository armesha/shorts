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

1. Transcribe the visible meme text exactly. Preserve wording, punctuation, slang, and profanity.
2. Decide whether a short visual comment helps:
   - for a very short meme, allow one brief conversational observation about what is visibly funny;
   - for a long or self-sufficient meme, add no commentary;
   - never explain the joke or invent a new plot.
3. Analyze setup, escalation, pause, punchline, and emotional turn.
4. Pick no more than two compatible acting reactions: dry delivery, smile in the voice, short
   chuckle, disbelieving exhale, tired sigh, surprised inhale, skeptical pause, awkward silence,
   brief whisper, rising disbelief, contained excitement, mock seriousness, gentle sympathy, or a
   sharper final phrase. Do not force laughter into every meme.
5. Use a natural adult Russian female delivery when the user asks for the established girl narrator.
   Keep the original meme text unchanged after any approved intro comment.
6. Generate one WAV per meme. Save final audio under `output/speech/` with stable descriptive names.
7. Validate each file with `ffprobe`: audio stream exists, duration is positive, and the file opens.
   Return absolute clickable paths and briefly state the chosen delivery.

## Runtime pattern

Import and call `generateGeminiTtsPreview()` from `server/services/gemini-tts.ts` under a process that
loads `/etc/shorts/gemini.env`. Pass `language: "ru"`, an appropriate Gemini voice, concise style,
pace, scene, energy, and `autoMemeDirection: true`. Decode the returned WAV data URL to the target
file. Do not log the full generated prompt when it could contain user-private text.

Audio generation alone does not require a server restart. Code changes under `server/**` do.

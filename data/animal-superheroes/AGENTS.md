# Animal Superheroes Pack Instructions

This file is the authoritative workflow for the `animal-superheroes` pack.
Follow it exactly when adding or rebuilding episodes for `ЗвероГерои: Кристалл лапы`.

## Series Contract

- Treat this as an endless serialized season, not a finite pack.
- The story must be able to continue forever: each episode resolves one tiny beat and opens a new hook.
- Never reset continuity unless the user explicitly asks for a reboot.
- Every episode must preserve the existing canon in `STORY_STATE.md`.
- After adding or changing an episode, update `STORY_STATE.md` in the same commit/work pass:
  - add the episode to the log,
  - note the new cliffhanger,
  - update active mysteries, locations, character status, and unresolved objects,
  - keep the summary short enough for the next agent to scan quickly.
- Characters may rotate. The core team stays recognizable, but individual episodes can spotlight one hero, split the team, introduce a temporary animal ally, or reveal a new animal rival.
- Do not make every episode the same team lineup. Vary locations, lead character, visual mood, action type, and the final hook.

## Language Contract

- Every finished episode must have two language variants:
  - Russian pack: `animal-superheroes`, language `ru`, title `ЗвероГерои: Кристалл лапы`.
  - English pack: `animal-superheroes-en`, language `en`, title `Animal Heroes: The Paw Crystal`.
- The visual sequence must be exactly the same for both languages.
- Generate gpt-image-2 scenes once per episode, then reuse the same `scene_01.png`, `scene_02.png`, etc. for RU and EN renders.
- Only these parts change between languages:
  - narration text,
  - ElevenLabs TTS language,
  - subtitles,
  - on-video header title,
  - `videos.json` metadata,
  - `/clip-demos` pack title.
- Do not regenerate different English visuals unless the Russian visual has a real defect.
- Do not mix languages inside one deck. RU and EN must be separate sequential packs so a channel can choose the correct language and get episode order safely.
- When adding episode N, update both:
  - `data/animal-superheroes/videos.json`
  - `data/animal-superheroes-en/videos.json`
- The English pack is not a translation experiment. It is a mirrored production pack and must stay episode-for-episode aligned with RU.

## Current Format

- Build a vertical comic short, 9:16, `1080x1920`, about 20-35 seconds.
- Use generated comic scenes from `gpt-image-2` through Codex `image_gen`.
- Do not use vector cards, emoji-style templates, Pollinations, stock placeholder art, or one long comic page that scrolls slowly.
- Generate separate full-scene images for the episode beats. Target 8-12 distinct images for a 20-35 second episode.
- A long spoken sentence must get 2 or more visual shots: wide action, close-up/detail, reaction, or cliffhanger beat.
- Generated images must not contain captions, subtitles, speech bubbles, UI, watermarks, logos, or readable text.
- Add subtitles during video assembly, not inside the generated images.

## Visual Style

- Modern high-quality comic book illustration for Shorts/TikTok.
- Rich hand-painted color, bold ink lines, cinematic lighting, expressive animal faces.
- Character continuity matters:
  - Iskra: orange fox heroine, teal cape, small golden paw medallion.
  - Badger: sturdy, dark utility vest.
  - Owl: wise, brass goggles.
  - Turtle: kind green turtle, small shell backpack.
  - Squirrel: energetic, yellow scarf.
- Avoid flat vector style, squashed images, black side bars, repeated static layouts, and poster/card frames.
- Every episode should end on a cliffhanger.

## Story Canon

- Canon source: `data/animal-superheroes/STORY_STATE.md`.
- Current season title: `ЗвероГерои: Кристалл лапы`.
- Core promise: funny animal superheroes follow magical paw crystals through hidden city locations, each crystal revealing a larger mystery.
- Main team:
  - Iskra: orange fox heroine, teal cape, golden paw medallion, fast and brave.
  - Badger: sturdy protector, dark utility vest, practical and suspicious.
  - Owl: wise investigator, brass goggles, decodes maps and symbols.
  - Turtle: kind shield/engineer, shell backpack, slow but clever.
  - Squirrel: energetic scout, yellow scarf, comic timing and agility.
- The shadow thief is a recurring mystery antagonist. Do not fully reveal them too early.
- New allies and rivals should be animals, not humans. Humans can exist as background silhouettes/signage-free city life, but the story belongs to animals.
- The world should feel like it continues between episodes: hidden zoo gates, underground tunnels, tram roofs, clock towers, cloud ships, mirror ponds, etc.

## Voice

- Use ElevenLabs voice `Jessica - Playful, Bright, Warm`.
- Voice id: `cgSgspJ2msm6clMCkdW9`.
- Use `eleven_multilingual_v2`.
- Use `language_code: "ru"` for `animal-superheroes`.
- Use `language_code: "en"` for `animal-superheroes-en`.
- Keep the voice soft, pleasant, female, lively, and not slow/dictor-like.
- Current baseline settings:
  - `stability: 0.43`
  - `similarity_boost: 0.82`
  - `style: 0.18`
  - `use_speaker_boost: true`
  - `speed: 1.08`
- Short breath/exhale SFX may be mixed quietly between phrases, but they must not distract from narration.
- Do not add page-turn, swipe, whoosh, click, flip, or similar transition SFX after every narration line or scene change.
- Scene changes should feel like smooth video edits, not like a slideshow being flipped.
- If a future episode needs a one-off action SFX, use it only for a story event, not as a repeated transition marker.
- Pronunciation/stress rule:
  - Subtitles use `text` / `textEn`.
  - Voiceover may use separate `ttsText` / `ttsTextEn` on a segment in `episodes-source.json`.
  - Use `ttsText` when ElevenLabs puts stress in the wrong place, reads `е` incorrectly, or needs a more natural spoken phrase.
  - Prefer correct Russian spelling with `ё` where it matters.
  - Do not put artificial stress marks into subtitles.
  - If pronunciation is still wrong, rewrite only the `ttsText` phrase with simpler wording and rebuild with `--force-tts`.
  - After changing `ttsText`, listen to the rendered mp4 before calling the episode done.

## Subtitles

- Use localized subtitles synced to the ElevenLabs alignment/timestamps.
- Subtitles must be large, high-contrast, and placed in a stable Shorts safe-zone.
- Do not place subtitles in the bottom mobile YouTube Shorts UI zone. For `1080x1920`, keep the bottom of subtitle text around `y <= 1320-1360`, with the block center roughly in `y ~= 1100-1200`.
- Keep a right-side margin so subtitles do not collide with like/comment/share controls.
- Use karaoke-style subtitles for new/rebuilt episodes: the full phrase stays white with a black stroke, and the currently spoken word is highlighted in warm yellow using ElevenLabs alignment.
- The active word can have a subtle dark rounded backing, glow, or tiny lift/pop. Keep the line layout stable: do not resize the whole block, do not make text jump, and do not push it outside the safe-zone.
- Check subtitles visually from extracted frames before calling the episode done.
- Do not let subtitles cover the main character face or the key action.
- The top-left episode label must be readable and must not use the old oval/pill outline. Use plain white text with a black stroke.

## End Card

- Every rendered episode must end with a plain black card.
- RU end-card text: `Следующая серия уже на канале`.
- EN end-card text: `Next episode is already on the channel`.
- Use large centered white text.
- Do not add generated art, decorative frames, logos, or extra UI to the end card.
- The end card is created by `scripts/build-animal-superheroes-generated.py`; do not bake it into generated scene images.

## YouTube Channel Assets

- Channel assets live in `tmp/animal-superheroes/youtube/`.
- Keep two channel folders:
  - `ru/` for the Russian channel.
  - `en/` for the English channel.
- Each channel should have:
  - `avatar.png`, square `800x800`.
  - `banner.png`, YouTube banner `2560x1440`.
  - `name.txt`.
  - `description.txt`.
- Shared channel copy can also be summarized in `tmp/animal-superheroes/youtube/channel-info.md`.
- The RU banner must include the readable text `Каждый день три новые серии`.
- The EN banner should use the localized equivalent `Three new episodes every day`.
- Do not ask image generation to render important banner text. Generate or reuse textless comic art, then overlay exact text locally so it is readable and spelled correctly.
- Keep banner text inside the centered YouTube safe area.

## Storage And Ordering

- This pack is sequential-only. Random order is not allowed for generation into the library or publishing.
- `src/anecdotes/decks.ts` must keep both `animal-superheroes` and `animal-superheroes-en` with `preFact: true` and `sequential: true`.
- `src/anecdotes/library.ts` must keep sequential decks returning the first unused item in `videos.json` order, including when no item has been used yet.
- Channels/users generating from this pack should receive episode 01, then 02, then 03, etc. Do not shuffle, randomize, or skip ahead.
- A pack must be selectable as soon as it has at least one item in `videos.json`. Do not hide it just because the pack is still growing.
- The library/count UI must reflect the current `videos.json` / `index.json` totals after reload: 1 episode means selectable with count 1, 2 episodes means count 2, etc.
- `/api/prebuilt/:deck/random` may be used only as a Studio preview player. It is not the publishing contract.
- Final mp4 files for generation into the library go in:
  - `assets/fact-videos/animal-superheroes/`
  - `assets/fact-videos/animal-superheroes-en/`
- Episode metadata goes in:
  - `data/animal-superheroes/videos.json`
  - `data/animal-superheroes-en/videos.json`
- Keep `videos.json` sorted by episode order and append new episodes at the end.
- Episode filenames must begin with zero-padded order: `as_02_...mp4`, `as_03_...mp4`, etc.
- English filenames should be prefixed with `as_en_`, for example `as_en_02_stone_lions.mp4`.
- Use a new file/id when replacing a preview so browser cache cannot show an old version.
- `/clip-demos` preview data is in:
  - `data/output/admin-demos/manifest.json`
- Do not remove unrelated packs from `/clip-demos`. Existing packs such as `Space` and `Вижу Ответ` must stay visible.

## Prompt Pattern

Use one `image_gen` call per distinct visual beat. Do not ask for a full comic page.

Baseline prompt shape:

```text
Use case: illustration-story
Asset type: vertical YouTube Shorts / TikTok comic scene, 9:16
Primary request: Generate scene <n> for episode <episode> of the Russian animal-superhero comic series "ЗвероГерои: Кристалл лапы". No text inside the artwork. <specific action beat>.
Style/medium: modern high-quality comic book illustration, cinematic short-form animation concept art, bold ink lines, rich hand-painted color, expressive animal faces.
Composition/framing: full vertical 9:16 single scene, strong readable action, no black bars, no panel borders.
Lighting/mood: <episode mood>.
Constraints: keep relevant character designs consistent. No captions, no subtitles, no speech bubbles, no readable text, no watermark, no logo, no UI, no photorealism, no flat vector style.
```

For 20-35 seconds, use 8-12 scene images. If the narration has 6 sentences, split long sentences into 2 shots.

## Build Workflow

- Source scripts and translations belong in `data/animal-superheroes/episodes-source.json`.
- Use optional `ttsText` / `ttsTextEn` there only for voice/pronunciation fixes. Keep `text` / `textEn` as the exact subtitle copy.
- Scene images belong in `tmp/animal-superheroes/gpt-image2/generated_scenes/<ru_episode_id>/`.
- Build RU and EN from the same scene directory.
- After rendering both languages, inspect contact sheets from both videos because subtitle wrapping differs by language.
- Keep EN text natural, short, and punchy for Shorts. Do not translate word-for-word if it makes subtitles too long.

## Required QA

Before handing off an episode:

- `ffprobe` the mp4 and verify `1080x1920`, video stream present, audio stream present, and duration is about 20-35 seconds.
- Extract a contact sheet from the final mp4 and inspect that visuals change often enough.
- Inspect subtitles on the contact sheet. They must not be tiny, cut off, or covering the main action.
- Verify `/clip-demos` manifest still includes old packs plus `animal-superheroes`.
- Verify `/clip-demos` manifest includes both animal packs when EN has at least one built episode:
  - `ЗвероГерои: Кристалл лапы`
  - `Animal Heroes: The Paw Crystal`
- Verify the new animal video is served with HTTP 200 from `/files/admin-demos/<id>.mp4`.
- Verify both RU and EN `videos.json` files point to existing files under `assets/fact-videos/`.
- Verify `/api/generators` exposes `animal-superheroes` and `animal-superheroes-en` with current `total` / `available` counts after a service reload.
- Verify `data/animal-superheroes/STORY_STATE.md` was updated for the new episode.

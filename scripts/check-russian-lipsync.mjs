import { alignRussianLipSync } from "../server/services/russian-lipsync.ts";
import { geminiTtsCharacterAlignmentInput } from "../server/services/gemini-tts-characters.ts";

const sample = geminiTtsCharacterAlignmentInput("vitek");
const startedAt = performance.now();
const timeline = await alignRussianLipSync({ wavPath: sample.wavPath, transcript: sample.transcript });
process.stdout.write(
  `${JSON.stringify(
    {
      character: sample.id,
      durationSec: timeline.durationSec,
      cues: timeline.cues.length,
      alignmentMs: timeline.alignmentMs,
      requestMs: Math.round(performance.now() - startedAt),
      cached: timeline.cached,
    },
    null,
    2,
  )}\n`,
);

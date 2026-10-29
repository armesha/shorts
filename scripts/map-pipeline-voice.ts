import { readFile, writeFile } from "node:fs/promises";
import { generateGeminiTtsPreview, hasServerGeminiApiKey } from "../server/services/gemini-tts.ts";

try {
  if (process.argv[2] === "--check") {
    console.log(JSON.stringify({ available: hasServerGeminiApiKey() }));
  } else {
    const input = JSON.parse(await readFile(process.argv[2], "utf8"));
    const result = await generateGeminiTtsPreview({ text: input.text, language: "ru", voice: "Kore",
      scene: "Понятное вступительное объяснение показателя на карте мира.", style: "Естественно и увлечённо; ясно произносить единицы измерения и пример.", pace: "Разговорный темп, небольшие паузы между предложениями." });
    await writeFile(process.argv[3], Buffer.from(result.audioDataUrl.split(",")[1], "base64"), { mode: 0o600 });
    console.log(JSON.stringify({ seconds: result.durationSec, voice: result.voice, model: result.model }));
  }
} catch {
  console.error("Voice generation failed; check configured Google access and quota.");
  process.exitCode = 1;
}

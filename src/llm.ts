import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const pexecFile = promisify(execFile);

/**
 * LLM backend = Claude Code in headless mode (`claude -p`). Claude subscription only, no fallback.
 * On a server, auth via `claude setup-token` -> CLAUDE_CODE_OAUTH_TOKEN (inherited from env).
 * Locally it uses your existing Claude Code login.
 */
export const GeneratedShortSchema = z.object({
  title: z.string().min(3),
  facts: z.array(z.string().min(3)).min(4).max(8),
  video: z.object({
    title: z.string().min(3).max(100),
    description: z.string().default(""),
    tags: z.array(z.string()).default([]),
  }),
});
export type GeneratedShort = z.infer<typeof GeneratedShortSchema>;

export interface GenerateParams {
  /** Account's general theme, e.g. "Psychologische Fakten" */
  theme: string;
  /** Output language, e.g. "de", "ru", "it", "fr", "en" */
  lang: string;
  /** How many facts (frame fills evenly around 6) */
  count?: number;
  /** Recently used titles/angles to avoid repeating (uniqueness per spec) */
  avoid?: string[];
  claudeBin?: string;
  timeoutMs?: number;
}

const LANG_NAMES: Record<string, string> = {
  de: "German",
  ru: "Russian",
  it: "Italian",
  fr: "French",
  en: "English",
};

function buildPrompt(p: GenerateParams): string {
  const count = p.count ?? 6;
  const langName = LANG_NAMES[p.lang] ?? p.lang;
  const avoid =
    p.avoid && p.avoid.length
      ? `\nYou have ALREADY made videos with these angles — pick a DIFFERENT angle/subtopic so the content stays unique:\n${p.avoid.map((a) => `- ${a}`).join("\n")}`
      : "";

  return `You write punchy "fact list" content for vertical YouTube Shorts.

Topic for this channel: "${p.theme}"
Language: ${langName} (write ALL user-facing text in ${langName}).
${avoid}

Produce EXACTLY ${count} facts. Rules for each fact:
- Surprising, specific, and true-sounding; 1 short sentence, ~10-16 words (fits ~2 lines).
- Wrap the single most important phrase in **double asterisks** for bold.
- No numbering inside the fact text (numbering is added automatically).

Also produce:
- "title": the on-image heading, MUST start with the number, e.g. "${count} ${p.theme}" (short, punchy, ${langName}).
- "video.title": YouTube title, <= 100 chars, catchy, ${langName}.
- "video.description": 1-2 sentence ${langName} description.
- "video.tags": 6-10 lowercase hashtag-style tags (no '#').

Output ONLY a single minified JSON object, no markdown, no code fences, exactly this shape:
{"title":"...","facts":["...","..."],"video":{"title":"...","description":"...","tags":["...","..."]}}`;
}

/** Extract the first balanced top-level JSON object from arbitrary model text. */
export function extractJson(text: string): string {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in model output");
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  throw new Error("Unbalanced JSON in model output");
}

/** Low-level call to Claude Code headless. Returns raw stdout text. */
export async function callClaude(prompt: string, opts: GenerateParams): Promise<string> {
  const bin = opts.claudeBin ?? process.env.CLAUDE_BIN ?? "claude";
  const { stdout } = await pexecFile(bin, ["-p", prompt], {
    timeout: opts.timeoutMs ?? 120_000,
    maxBuffer: 10 * 1024 * 1024,
    env: process.env,
  });
  return stdout;
}

/** Generate one Short's content; validates + retries once on bad JSON. */
export async function generateShort(params: GenerateParams): Promise<GeneratedShort> {
  const prompt = buildPrompt(params);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callClaude(prompt, params);
      const json = JSON.parse(extractJson(raw));
      return GeneratedShortSchema.parse(json);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`generateShort failed: ${String(lastErr)}`);
}

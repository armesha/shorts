// YouTube-метаданные деки + распаковка карточек-JSON в читаемое описание.
// Вынесено из реестра дек (./decks.ts), чтобы реестр остался чистым lookup'ом.
// Импортирует тип Deck из реестра (одно направление: yt-meta → decks, без цикла).
import type { Deck } from "./decks.ts";

const INTERNAL_DESCRIPTION_LINE =
  /(?:\b(?:data|tmp|assets|local-assets|scripts|server|src)\/|\/home\/|\.json\b|\.mjs\b|\.ts\b|pack:new-|translated ready-made meme card|legacy memes-\*|template-packs|sourcecounts|sourcelabel|Генератор мемов)/i;

function publicDescription(text: string): string {
  return String(text || "")
    .split(/\n{2,}/)
    .map((part) =>
      part
        .split(/\r?\n/)
        .filter((line) => !INTERNAL_DESCRIPTION_LINE.test(line))
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function withHashtags(body: string, hashtags: string): string {
  const clean = publicDescription(body);
  return `${clean || " "}\n\n${hashtags}`.trim();
}

/** A readable meme title from a caption: first line, trimmed to a sentence or word boundary
 *  (never cut mid-word). Keeps short captions whole; long ones end at the first sentence stop
 *  or, failing that, the last word boundary + ellipsis. */
function memeTitleLine(caption: string): string {
  const line = (caption.split(/\r?\n/)[0] || caption).trim();
  if (line.length <= 80) return line;
  const sentence = line.match(/^[\s\S]{20,80}?[.!?…»"](?=\s|$)/);
  if (sentence) return sentence[0].trim();
  const head = line.slice(0, 76);
  const sp = head.lastIndexOf(" ");
  return (sp > 40 ? head.slice(0, sp) : head).trim() + "…";
}

/** Build YouTube title/description/tags for a deck. */
export function ytMeta(
  deck: Deck,
  title: string,
  text: string,
): { title: string; description: string; tags: string[] } {
  if (deck.quote) {
    const cleanAuthor = (title || deck.genericTitles?.[0] || deck.name).trim();
    const cleanQuote = (text || "").replace(/\s+/g, " ").trim();
    const preview = cleanQuote.length > 74 ? cleanQuote.slice(0, 73).trim() + "…" : cleanQuote;
    return {
      title: `${preview || cleanAuthor} ${deck.emoji} #shorts`.slice(0, 100),
      description: withHashtags(`${cleanQuote}\n\n— ${cleanAuthor}`, deck.hashtags),
      tags: deck.tags,
    };
  }
  // Islamic cards: title = the Arabic reference, body = the exact Arabic text (+ reference).
  if (deck.islamic) {
    let ar = text,
      ref = title,
      refEn = "";
    try {
      const c = JSON.parse(text) as { arabic?: string; ref?: string; ref_en?: string };
      ar = c.arabic ?? text;
      ref = c.ref ?? title;
      refEn = c.ref_en ? `\n${c.ref_en}` : "";
    } catch {
      /* not JSON — use raw text */
    }
    return {
      title: `${ref} ${deck.emoji} #shorts`,
      description: withHashtags(`${ar}\n\n${ref}${refEn}`, deck.hashtags),
      tags: deck.tags,
    };
  }
  // Christian cards: title = the reference, body = the exact KJV passage (+ reference).
  if (deck.christian) {
    let body = text,
      ref = title;
    try {
      const c = JSON.parse(text) as { text?: string; ref?: string };
      body = c.text ?? text;
      ref = c.ref ?? title;
    } catch {
      /* not JSON — use raw text */
    }
    return {
      title: `${ref} ${deck.emoji} #shorts`,
      description: withHashtags(`${body}\n\n${ref} (KJV)`, deck.hashtags),
      tags: deck.tags,
    };
  }
  // Meme cards: the whole card is JSON in `text`; title = first caption line, body = full caption.
  if (deck.meme) {
    let cap = text;
    try {
      const c = JSON.parse(text) as { caption?: string };
      cap = c.caption ?? text;
    } catch {
      /* not JSON — use raw text */
    }
    const firstLine = memeTitleLine(cap);
    return {
      title: `${firstLine || title} ${deck.emoji} #shorts`,
      description: withHashtags(cap, deck.hashtags),
      tags: deck.tags,
    };
  }
  // Psychology cards store the whole card as JSON in `text` — render a readable description instead.
  const body = deck.psych ? psychDescription(text) : text;
  return {
    title: `${title} ${deck.emoji} #shorts`,
    description: withHashtags(body, deck.hashtags),
    tags: deck.tags,
  };
}

/** Turn a psychology card (JSON in `text`) into a readable YouTube description (points + CTA). */
export function psychDescription(jsonText: string): string {
  try {
    const card = JSON.parse(jsonText) as { items?: Record<string, string>[]; outro?: string };
    const lines: string[] = [];
    for (const it of card.items ?? []) {
      if (it.lead && it.text) lines.push(`• ${it.lead} — ${it.text}`);
      else if (it.term && it.val) lines.push(`• ${it.term} — ${it.val}`);
      else if (it.myth && it.real) lines.push(`• ${it.myth} → ${it.real}`);
      else if (it.quote) lines.push(`„${it.quote}“${it.author ? " — " + it.author : ""}`);
      else if (it.text) lines.push(`• ${it.text}`);
    }
    let desc = lines.join("\n");
    if (card.outro) desc += `\n\n${card.outro}`;
    return desc || jsonText;
  } catch {
    return jsonText;
  }
}

// YouTube-метаданные деки + распаковка карточек-JSON в читаемое описание.
// Вынесено из реестра дек (./decks.ts), чтобы реестр остался чистым lookup'ом.
// Импортирует тип Deck из реестра (одно направление: yt-meta → decks, без цикла).
import type { Deck } from "./decks.ts";

/** Build YouTube title/description/tags for a deck. */
export function ytMeta(
  deck: Deck,
  title: string,
  text: string,
): { title: string; description: string; tags: string[] } {
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
      description: `${ar}\n\n${ref}${refEn}\n\n${deck.hashtags}`,
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
      description: `${body}\n\n${ref} (KJV)\n\n${deck.hashtags}`,
      tags: deck.tags,
    };
  }
  // «Что выберешь?» cards: whole card is JSON in `text`; title = the question, body = both options + CTA.
  if (deck.choose) {
    let q = title;
    let a: { label?: string; desc?: string } = {};
    let b: { label?: string; desc?: string } = {};
    try {
      const c = JSON.parse(text) as { q?: string; a?: typeof a; b?: typeof b };
      q = c.q ?? title;
      a = c.a ?? {};
      b = c.b ?? {};
    } catch {
      /* not JSON — use raw text */
    }
    const body = `${q}\n\n🔴 ${a.label ?? ""}: ${a.desc ?? ""}\n🔵 ${b.label ?? ""}: ${b.desc ?? ""}\n\nА ты что выберешь? Пиши в комментариях 👇`;
    return {
      title: `${q} ${deck.emoji} #shorts`,
      description: `${body}\n\n${deck.hashtags}`,
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
    const firstLine = (cap.split(/\r?\n/)[0] || cap).slice(0, 80).trim();
    return {
      title: `${firstLine || title} ${deck.emoji} #shorts`,
      description: `${cap}\n\n${deck.hashtags}`,
      tags: deck.tags,
    };
  }
  // Psychology cards store the whole card as JSON in `text` — render a readable description instead.
  const body = deck.psych ? psychDescription(text) : text;
  return {
    title: `${title} ${deck.emoji} #shorts`,
    description: `${body}\n\n${deck.hashtags}`,
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

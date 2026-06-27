import test from "node:test";
import assert from "node:assert/strict";
import { deckCards, randomAnecdote } from "./library.ts";

function obviousNonEnglishForEnglishPool(text: string): boolean {
  const lower = text.toLowerCase();
  if (/[¿¡]/.test(text)) return true;
  if (/\b(der mensch|les hommes|je vois|rien n'est|lorsque les|il y a|c'est ici|amore e|willst du|so gewiß|so gewiss|die ganzen zahlen)\b/i.test(text))
    return true;
  const accented = (text.match(/[àáâãäåæçèéêëìíîïñòóôõöùúûüýÿœß]/gi) ?? []).length;
  const french = (lower.match(/\b(avec|cette|comme|dans|dont|elle|elles|être|homme|monde|nous|pour|quand|quelle|sans|sont|vous)\b|\b(c|d|j|l|m|n|qu|s|t)['’]/gi) ?? []).length;
  const german = (lower.match(/\b(aber|allein|auch|auf|aus|das|dass|denn|der|die|dieser|durch|für|gewiss|gewiß|ich|ist|nicht|sich|und|wenn|wer|wie|zum)\b/gi) ?? []).length;
  return accented >= 2 && (french >= 1 || german >= 1);
}

test("English quote pools do not expose obvious foreign-language quote text", () => {
  const cards = deckCards("quotes-en");
  assert.ok(cards.length >= 1000, "English quote pool should keep a large stock after filtering");

  const bad = cards.filter((card) => obviousNonEnglishForEnglishPool(card.text)).slice(0, 5);
  assert.deepEqual(
    bad.map((card) => ({ title: card.title, text: card.text })),
    [],
  );

  const previousBadSeed = randomAnecdote("quote-video-en", new Set(), "visual-audit-quote-video-en");
  assert.ok(previousBadSeed);
  assert.equal(obviousNonEnglishForEnglishPool(previousBadSeed.text), false);
});

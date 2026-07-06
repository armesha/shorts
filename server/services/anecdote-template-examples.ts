import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Account, Db } from "../db.ts";
import { JOKE_POP_VARIANTS, renderAnecdote } from "../../src/anecdotes/render.ts";
import { DECKS, deckLang, getDeck, isPackDeckId, isPlainAnecdoteDeck } from "../../src/anecdotes/decks.ts";
import { isJokeAnimatedVariant, JOKE_ANIMATED_VARIANTS } from "../../src/anecdotes/joke-animated-templates.ts";
import { getPack, type Pack } from "../../src/packs/store.ts";
import { assembleStillVideo, downscaleImage, jokeMotionOverlayForVariant } from "../../src/video.ts";

export const ANECDOTE_TEMPLATE_EXAMPLES_OWNER = "armen";
export const ANECDOTE_TEMPLATE_EXAMPLES_DIR = "examples/anecdote-templates";

type ExampleFamily = "joke-animated" | "joke-pop";

export interface AnecdoteTemplateExampleItem {
  no: string;
  key: string;
  imageId: string;
  imageUrl: string;
  imageReady: boolean;
  mediaType: "image" | "video";
  videoUrl?: string;
  videoReady?: boolean;
  family: ExampleFamily;
  title: string;
  subtitle: string;
  sourceDecks: string[];
  languageCodes: string[];
  accountCount: number;
  accounts: { id: number; channelName: string }[];
  templateName: string;
  sampleTitle: string;
  sampleText: string;
}

interface RenderableExampleItem extends AnecdoteTemplateExampleItem {
  render:
    | { kind: "joke-pop"; deckId: string; variant: string }
    | { kind: "joke-animated"; deckId: string; variant: string };
}

export interface AnecdoteTemplateExamplesCatalog {
  owner: { id: number; username: string };
  generatedAt: string;
  outputDir: string;
  sourceDecks: string[];
  languageCodes: string[];
  accountCount: number;
  total: number;
  items: RenderableExampleItem[];
}

export function publicAnecdoteTemplateExamples(catalog: AnecdoteTemplateExamplesCatalog): Omit<AnecdoteTemplateExamplesCatalog, "items"> & {
  items: AnecdoteTemplateExampleItem[];
} {
  return {
    ...catalog,
    items: catalog.items.map(({ render: _render, ...item }) => item),
  };
}

export function collectAnecdoteTemplateExamples(db: Db, outputDir: string, username = ANECDOTE_TEMPLATE_EXAMPLES_OWNER): AnecdoteTemplateExamplesCatalog {
  const owner = db.getUserByUsername(username);
  if (!owner) throw new Error(`Пользователь ${username} не найден`);
  const accounts = db.listAccountsByUser(owner.id);
  const usage = buildDeckUsage(accounts);
  const sourceDecks = [...usage.keys()].sort(sourceSort);
  const activeBuiltIn = sourceDecks
    .map((deckId) => DECKS.find((deck) => deck.id === deckId))
    .filter((deck): deck is (typeof DECKS)[number] => !!deck && isPlainAnecdoteDeck(deck));
  const activePlainDecks = activeBuiltIn.filter((deck) => !deck.longVideo);
  const activeJokePackDeckIds = sourceDecks
    .filter(isPackDeckId)
    .filter((deckId) => {
      const pack = getPack(deckId.slice("pack:".length), owner.id, true);
      return !!pack && isAnecdotePack(deckId, pack);
    })
    .sort(sourceSort);
  const outputRoot = resolve(process.cwd(), outputDir, ANECDOTE_TEMPLATE_EXAMPLES_DIR);
  const items: RenderableExampleItem[] = [];

  if (activePlainDecks.length || activeJokePackDeckIds.length) {
    const builtInSourceDeckIds = activePlainDecks.map((deck) => deck.id).sort(sourceSort);
    const sourceDeckIds = [...builtInSourceDeckIds, ...activeJokePackDeckIds].sort(sourceSort);
    const primaryDeckId = builtInSourceDeckIds.includes("ru") ? "ru" : (builtInSourceDeckIds[0] ?? "en");
    for (const variant of JOKE_POP_VARIANTS) {
      const animated = isJokeAnimatedVariant(variant);
      items.push(
        makeItem({
          family: animated ? "joke-animated" : "joke-pop",
          key: `${animated ? "joke-gif" : "joke-pop"}:${variant}`,
          imageId: safeImageId(`joke-pop-${variant}`),
          title: animated ? animatedVariantTitle(variant) : popVariantTitle(variant),
          subtitle: animated ? "Новый GIF-шаблон с creator motion" : "Общий pop-шаблон коротких анекдотов",
          sourceDecks: sourceDeckIds,
          languageCodes: languagesForDecks(sourceDeckIds),
          usage,
          templateName: variant,
          sampleTitle: SAMPLE_BY_DECK[primaryDeckId]?.title ?? SAMPLE_BY_DECK.en.title,
          sampleText: SAMPLE_BY_DECK[primaryDeckId]?.text ?? SAMPLE_BY_DECK.en.text,
          mediaType: animated ? "video" : "image",
          outputRoot,
          render: { kind: animated ? "joke-animated" : "joke-pop", deckId: primaryDeckId, variant },
        }),
      );
    }
  }

  items.sort(exampleSort);
  items.forEach((item, index) => {
    item.no = `A${String(index + 1).padStart(3, "0")}`;
  });
  const includedSourceDecks = [...new Set(items.flatMap((item) => item.sourceDecks))].sort(sourceSort);
  const includedLanguageCodes = [...new Set(items.flatMap((item) => item.languageCodes))].sort((a, b) => a.localeCompare(b));
  const includedAccountCount = new Set(items.flatMap((item) => item.accounts.map((account) => account.id))).size;

  return {
    owner: { id: owner.id, username: owner.username },
    generatedAt: new Date().toISOString(),
    outputDir: `${outputDir}/${ANECDOTE_TEMPLATE_EXAMPLES_DIR}`,
    sourceDecks: includedSourceDecks,
    languageCodes: includedLanguageCodes,
    accountCount: includedAccountCount,
    total: items.length,
    items,
  };
}

export async function renderAnecdoteTemplateExamples(
  catalog: AnecdoteTemplateExamplesCatalog,
  opts: { force?: boolean; width?: number } = {},
): Promise<{ rendered: number; skipped: number; failed: { no: string; key: string; error: string }[] }> {
  const outDir = resolve(process.cwd(), catalog.outputDir);
  mkdirSync(outDir, { recursive: true });
  pruneStaleExampleImages(outDir, catalog);
  let rendered = 0;
  let skipped = 0;
  const failed: { no: string; key: string; error: string }[] = [];
  for (const item of catalog.items) {
    const jpg = resolve(outDir, `${item.imageId}.jpg`);
    const mp4 = resolve(outDir, `${item.imageId}.mp4`);
    if (!opts.force && existsSync(jpg) && (item.mediaType !== "video" || existsSync(mp4))) {
      skipped += 1;
      continue;
    }
    const png = resolve(outDir, `${item.imageId}.full.png`);
    try {
      if (item.render.kind === "joke-animated") {
        const deck = getDeck(item.render.deckId);
        await renderAnecdote(
          {
            title: item.sampleTitle,
            text: item.sampleText,
            channel: deck.name,
            deck: deck.id,
            visualVariant: item.render.variant,
          },
          png,
        );
        await downscaleImage(png, jpg, opts.width ?? 420);
        await assembleStillVideo(png, mp4, {
          durationSec: 6,
          audioPath: null,
          motionOverlay: jokeMotionOverlayForVariant(item.render.variant, item.sampleText.length),
        });
      } else {
        const deck = getDeck(item.render.deckId);
        await renderAnecdote(
          {
            title: item.sampleTitle,
            text: item.sampleText,
            channel: deck.name,
            deck: deck.id,
            visualVariant: item.render.variant,
          },
          png,
        );
      }
      if (item.render.kind !== "joke-animated") await downscaleImage(png, jpg, opts.width ?? 420);
      try {
        unlinkSync(png);
      } catch {
        /* best effort */
      }
      rendered += 1;
    } catch (error) {
      failed.push({ no: item.no, key: item.key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(publicAnecdoteTemplateExamples(refreshImageReadiness(catalog)), null, 2));
  return { rendered, skipped, failed };
}

function pruneStaleExampleImages(outDir: string, catalog: AnecdoteTemplateExamplesCatalog): void {
  const keep = new Set(catalog.items.flatMap((item) => [`${item.imageId}.jpg`, `${item.imageId}.full.png`, `${item.imageId}.mp4`]));
  for (const file of readdirSync(outDir)) {
    if ((!file.endsWith(".jpg") && !file.endsWith(".full.png") && !file.endsWith(".mp4")) || keep.has(file)) continue;
    try {
      unlinkSync(resolve(outDir, file));
    } catch {
      /* best effort */
    }
  }
}

export function refreshImageReadiness(catalog: AnecdoteTemplateExamplesCatalog): AnecdoteTemplateExamplesCatalog {
  const outDir = resolve(process.cwd(), catalog.outputDir);
  return {
    ...catalog,
    items: catalog.items.map((item) => ({
      ...item,
      imageReady: existsSync(resolve(outDir, `${item.imageId}.jpg`)),
      imageUrl: imageUrl(item.imageId, "image", resolve(outDir, `${item.imageId}.jpg`)),
      videoReady: item.mediaType === "video" ? existsSync(resolve(outDir, `${item.imageId}.mp4`)) : undefined,
      videoUrl: item.mediaType === "video" ? imageUrl(item.imageId, "video", resolve(outDir, `${item.imageId}.mp4`)) : undefined,
    })),
  };
}

function makeItem(input: {
  family: ExampleFamily;
  key: string;
  imageId: string;
  title: string;
  subtitle: string;
  sourceDecks: string[];
  languageCodes: string[];
  usage: Map<string, { accounts: Map<number, string> }>;
  templateName: string;
  sampleTitle: string;
  sampleText: string;
  mediaType?: "image" | "video";
  outputRoot: string;
  render: RenderableExampleItem["render"];
}): RenderableExampleItem {
  const accounts = accountsForSources(input.usage, input.sourceDecks);
  const jpg = resolve(input.outputRoot, `${input.imageId}.jpg`);
  const mp4 = resolve(input.outputRoot, `${input.imageId}.mp4`);
  const mediaType = input.mediaType ?? "image";
  return {
    no: "A000",
    key: input.key,
    imageId: input.imageId,
    imageUrl: imageUrl(input.imageId, "image", jpg),
    imageReady: existsSync(jpg),
    mediaType,
    videoUrl: mediaType === "video" ? imageUrl(input.imageId, "video", mp4) : undefined,
    videoReady: mediaType === "video" ? existsSync(mp4) : undefined,
    family: input.family,
    title: input.title,
    subtitle: input.subtitle,
    sourceDecks: input.sourceDecks,
    languageCodes: input.languageCodes,
    accountCount: accounts.length,
    accounts,
    templateName: input.templateName,
    sampleTitle: input.sampleTitle,
    sampleText: input.sampleText.slice(0, 700),
    render: input.render,
  };
}

function buildDeckUsage(accounts: Account[]): Map<string, { accounts: Map<number, string> }> {
  const usage = new Map<string, { accounts: Map<number, string> }>();
  const add = (deckId: string, account: Account) => {
    const id = String(deckId || "").trim();
    if (!id) return;
    let entry = usage.get(id);
    if (!entry) {
      entry = { accounts: new Map() };
      usage.set(id, entry);
    }
    entry.accounts.set(account.id, account.channelName);
  };
  for (const account of accounts) {
    const sources = account.sourceDecks?.length ? account.sourceDecks : [account.lang];
    for (const deckId of sources) add(deckId, account);
    for (const deckId of Object.values(account.slotDecks ?? {})) add(deckId, account);
  }
  return usage;
}

function accountsForSources(usage: Map<string, { accounts: Map<number, string> }>, sourceDecks: string[]): { id: number; channelName: string }[] {
  const accounts = new Map<number, string>();
  for (const deckId of sourceDecks) {
    for (const [id, channelName] of usage.get(deckId)?.accounts ?? []) accounts.set(id, channelName);
  }
  return [...accounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, channelName]) => ({ id, channelName }));
}

function languagesForDecks(deckIds: string[]): string[] {
  const out = new Set<string>();
  for (const deckId of deckIds) {
    if (isPackDeckId(deckId)) {
      const pack = getPack(deckId.slice("pack:".length), 0, true);
      if (pack?.lang) out.add(pack.lang);
      continue;
    }
    const lang = deckLang(deckId);
    if (lang) out.add(lang);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function isAnecdotePack(deckId: string, pack: Pack): boolean {
  const haystack = `${deckId} ${pack.id} ${pack.name} ${pack.templateType ?? ""}`.toLowerCase();
  return /(chistes?|jokes?|witz|witze|barzellette|blagues?|piadas?|anedotas?|dowcipy?|żarty?|zarty?|kawały?|kawaly?|анекдот|шутк|юмор)/iu.test(haystack);
}

function sourceSort(a: string, b: string): number {
  const order = ["ru", "de", "it", "fr", "en", "pt", "ar", "hi", "id"];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  return a.localeCompare(b);
}

function exampleSort(a: RenderableExampleItem, b: RenderableExampleItem): number {
  const familyOrder: Record<ExampleFamily, number> = { "joke-animated": 0, "joke-pop": 1 };
  const family = familyOrder[a.family] - familyOrder[b.family];
  if (family) return family;
  if (a.family === "joke-animated" && b.family === "joke-animated") {
    return JOKE_ANIMATED_VARIANTS.indexOf(a.templateName as (typeof JOKE_ANIMATED_VARIANTS)[number]) - JOKE_ANIMATED_VARIANTS.indexOf(b.templateName as (typeof JOKE_ANIMATED_VARIANTS)[number]);
  }
  if (a.family === "joke-pop" && b.family === "joke-pop") {
    return JOKE_POP_VARIANTS.indexOf(a.templateName as (typeof JOKE_POP_VARIANTS)[number]) - JOKE_POP_VARIANTS.indexOf(b.templateName as (typeof JOKE_POP_VARIANTS)[number]);
  }
  return a.key.localeCompare(b.key);
}

function safeImageId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^pack:/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function imageUrl(imageId: string, kind: "image" | "video", file: string): string {
  let version = "0";
  try {
    const st = statSync(file);
    version = `${st.size}-${Math.floor(st.mtimeMs)}`;
  } catch {
    /* no preview yet */
  }
  return `/api/examples/anecdote-templates/${encodeURIComponent(imageId)}/${kind}?v=${encodeURIComponent(version)}`;
}

function popVariantTitle(variant: string): string {
  return variant
    .replace(/^v-/, "")
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function animatedVariantTitle(variant: string): string {
  return `GIF ${popVariantTitle(variant.replace(/^v-gif-/, "v-"))}`;
}

const SAMPLE_BY_DECK: Record<string, { title: string; text: string }> = {
  ru: {
    title: "Анекдот дня",
    text: "Сосед говорит соседу:\n- Я решил начать новую жизнь.\n- И как успехи?\n- Отлично. Уже третий день ищу, куда положил старую.",
  },
  de: {
    title: "Witz des Tages",
    text: "Der Nachbar sagt: Ich fange ein neues Leben an. Drei Tage später sucht er immer noch, wo er das alte hingelegt hat.",
  },
  it: {
    title: "Barzelletta",
    text: "Ho deciso di cambiare vita. Per ora ho solo cambiato password e dimenticato anche quella.",
  },
  fr: {
    title: "Blague du jour",
    text: "J'ai voulu commencer une nouvelle vie. Pour l'instant, j'ai seulement rangé l'ancienne et je ne la retrouve plus.",
  },
  en: {
    title: "Quick Joke",
    text: "I decided to start a new life. So far I have only cleaned my desk, lost my notes, and called it progress.",
  },
  pt: {
    title: "Piada curta",
    text: "Resolvi mudar de vida. Até agora só mudei a senha e esqueci qual era.",
  },
  ar: {
    title: "طرفة قصيرة",
    text: "قال لصديقه: بدأت حياة جديدة. قال: وما أول خطوة؟ قال: أبحث عن مكان خبأت فيه القديمة.",
  },
};

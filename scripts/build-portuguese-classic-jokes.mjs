#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "data/anecdotes-pt");
const PACK_SIZE = 300;
const TARGET = 210;
const FETCH_CONCURRENCY = 4;
const MAX_CARDS_PER_PAGE = 3;

const SOURCE_SETS = [
  {
    id: "contos-populares-portuguezes-1879",
    prefix: "Contos Populares Portuguezes/",
    title: "Contos Populares Portuguezes",
    author: "F. Adolpho Coelho",
    year: 1879,
    sourceUrl: "https://pt.wikisource.org/wiki/Contos_Populares_Portuguezes",
    curatedOnly: true,
    rights:
      "Original public-domain by age (1879). Text extracted from Portuguese Wikisource pages; keep attribution ledger.",
    pageTitles: [
      "A Bella-menina",
      "A bicha de sete cabeças",
      "A cacheirinha",
      "A engeitada",
      "A formiga e a neve",
      "A herança paterna",
      "A machadinha",
      "A menina e o figo",
      "A pelle de piolho",
      "A pelle do piolho",
      "A princeza abandonada",
      "A raposa e o lobo",
      "A romanzeira do macaco",
      "A sina",
      "A torre de Babylonia",
      "A velha e os lobos",
      "A velha fadada",
      "As filhas dos dois validos",
      "As tres lebres",
      "Branca-flor",
      "Carneirinho branco",
      "Comera um bocadinho se tivera limão",
      "Comêra um bocadinho se tivera limão",
      "Conto do fuso",
      "Esvintola",
      "Historia da carochinha",
      "Historia do compadre pobre e do compadre rico",
      "Historia do grão-de-milho",
      "João Mandrião",
      "João Pequenito",
      "Maria Silva",
      "O Conde de Paris",
      "O Rabil",
      "O burro do azeiteiro",
      "O coelhinho branco",
      "O coelho e o gato",
      "O colhereiro",
      "O compadre lobo e a comadre raposa",
      "O conde encantado",
      "O creado do estrujeitante",
      "O cuco e a popa",
      "O gallo e o pinto",
      "O homem que busca estremecer",
      "O menino assafroado",
      "O menino e a lua",
      "O ovo partido",
      "O pinto borrachudo",
      "O preço dos ovos",
      "O principe com orelhas de burro",
      "O principe das Palmas-verdes",
      "O principe sapo",
      "O rabo do gato",
      "O retrato da princeza",
      "Os dois irmãos",
      "Os dois mentirosos",
      "Os figos verdes",
      "Os meninos perdidos",
      "Os sapatinhos encantados",
      "Os simplorios",
      "Patranha",
      "Pedro e Pedrito",
      "Pelle-de-Cavallo",
      "Raposinha gaiteira",
      "S. Jorge",
      "Sciencia, sabedoria e capacidade",
    ],
  },
  {
    id: "contos-tradicionaes-povo-portuguez-1883",
    prefix: "Contos Tradicionaes do Povo Portuguez/",
    title: "Contos Tradicionaes do Povo Portuguez",
    author: "Teofilo Braga",
    year: 1883,
    sourceUrl: "https://pt.wikisource.org/wiki/Contos_Tradicionaes_do_Povo_Portuguez",
    curatedOnly: true,
    rights:
      "Original public-domain by age (1883). Text extracted from Portuguese Wikisource pages; keep attribution ledger.",
    pageTitles: [
      "A barata e os filhos",
      "A bengala de dezeseis quintaes",
      "A bilha de azeite",
      "A cara de boi",
      "A enfiada de petas",
      "A estatua que come",
      "A prova das laranjas",
      "A raposa e o gallo",
      "A raposa e o lobo",
      "A raposa no gallinheiro",
      "A sardinhinha",
      "A velha das gallinhas",
      "A venda das gallinhas",
      "As adivinhas em anexins",
      "As botas fiadas",
      "As favas",
      "As nozes",
      "As orelhas do burro",
      "As vozes dos animaes",
      "O camareiro do rei",
      "O Palmeiriz d'Oliva",
      "O bolo refolhado",
      "A mirra",
      "A Riqueza e a Fortuna",
      "Março Marçagão",
      "Cahiu-me na minha catulinha",
      "D'aquellas sete ao dia",
      "Desanda cacheira",
      "João Ratão",
      "Os trez irmãos",
      "As barras de ouro",
      "Pedro de Malas-Artes",
      "O guardador de porcos",
      "Nascer para ser rico",
      "Dom Caio",
      "Dá-me o meu meio tostão",
      "Sempre não",
      "Manoel Feijão",
      "Casar e descasar",
      "O avarento",
      "Os trez conselhos",
      "O sacco das nozes",
      "O sapateiro pobre",
      "O signal da Nobreza",
      "O jogo do Pira",
      "Os trez patrões",
      "Já que tanto teima",
      "Tic-taco",
      "Os duzentos carneiros",
      "Os ditados novellescos",
      "O boi Cardil",
      "O tolo e as moscas",
      "Para quem canta o cuco?",
      "Tudo andaremos",
    ],
  },
  {
    id: "livro-de-esopo-1906",
    prefix: "O Livro de Esopo/",
    title: "O Livro de Esopo",
    author: "Medieval fables; 1906 edition",
    year: 1906,
    sourceUrl: "https://pt.wikisource.org/wiki/O_Livro_de_Esopo",
    curatedOnly: true,
    rights:
      "Original/public-domain edition by age. Text extracted from Portuguese Wikisource pages; keep attribution ledger.",
    pageTitles: [
      "A aguia e o cágado",
      "A aguia que arrebata o filho da raposa",
      "A bugia que pede á raposa um pedaço da cauda",
      "A cabra, o filho e o lobo",
      "A cadella que pediu a casa a outra",
      "A doninha e o homem",
      "A formiga e a mosca",
      "A porca prenhe e o lobo",
      "A rã e o boi",
      "A terra que pare um rato",
      "A vibora e a lima",
      "As lebres e as rãs",
      "As pombas, o gavião e o minhoto",
      "Batalha entre as aves e as animalias",
      "O asno e o cavallo loução",
      "O asno e o porco",
      "O azemel, a mosca e a mula",
      "O calvo e a mosca",
      "O camponês e o filho",
      "O cavallo e o leão que se fingia medico",
      "O cervo e o cabrão",
      "O cervo e os bois",
      "O cervo e os seus galhos",
      "O cordeiro que pasce e o lobo",
      "O corvo e a raposa",
      "O corvo enfeitado com as pennas do pavão",
      "O cão e a posta de carne",
      "O cão que cita o carneiro em juizo",
      "O gallo e a pedra preciosa",
      "O gavião e o rouxinol",
      "O lavrador e a andorinha",
      "O leão e o pastor que lhe tira do pé uma espinha",
      "O leão e o rato",
      "O leão que vai com outros animaes á caça",
      "O lobo, o bode e a raposa",
      "O lobo e a grua",
      "O lobo e o cordeiro",
      "O lobo e o cão nedio",
      "O lobo que accusa a raposa perante o bogio",
      "O machado e o bosque",
      "O minhoto doente",
      "O pastor e o lobo",
      "O rato, a rã e o minhoto",
      "O rato da cidade e o da aldeia",
      "O villão que vae com o asno á feira",
      "Os membros do corpo e o ventre",
    ],
  },
];

const SKIP_TITLE = /\b(Advertencia|Advertência|Prefa[cç][aã]o|Introdu[cç][aã]o|Index|Indice|Índice|Vocabulario|Vocabulário|Annota|Anota|Considera|Dedicatoria|Prologo|Pr[oó]logo|Estudo|Fac-s[ií]mile|Novell?istica|Galeria|Deus|Senhor|Nossa Senhora|Santo|Santa|Christo|Cristo|Padre|Frade|Abbade|Abade|Igreja|Egreja|Missa|Diabo|Inferno|C[eé]u|Mouro|Moura|Judeu|Cigano|Preto|Preta|Cego|Cega|Surdo|Surda|Mudo|Muda|Gaga|Aleijado|Louco|Doido|Idiota|Morte|Mortos|Finado|Matar|Matou|Guerra|Soldado|Espada|Forca|Viuva|Viúva|Mulher|Donzella|Noiva|Papisa|Usura)\w*\b/i;
const UNSAFE = [
  /\b(deus|christo|cristo|santo|santa|senhor dos passos|nossa senhora|s\. pedro|igreja|egreja|abbade|abade|padre|frade|freira|diabo|inferno|c[eé]u|pecado|missa|cl[eé]rigo|papa|bispo|escriptura|escritura)\w*\b/i,
  /\b(mouro|moura|preto|preta|judeu|judeus|cigano|cego|cega|surdo|surda|mudo|muda|gago|gaga|coxo|aleijado|louco|doido|idiota|burro|asno|tolo|simpl[oó]rio)\w*\b/i,
  /\b(matar|matou|morte|morto|morrer|sangue|espada|faca|punhal|arma|guerra|batalha|soldado|forca|enforc|assassin|veneno|monstro|bixa|queimar|queimad|espetad|criminos|ladr|roub|furt|bater|bateu|batia|ca[cç]a|ca[cç]ad)\w*\b/i,
  /\b(nua|nu|desnud|sexo|amante|adult[eé]rio|prostitut|cama|beijo|gr[aá]vida|parir|vi[uú]va|marido|casad|mulheres|mulher gulosa|crea[cç][aã]o da mulher|maas artes das molheres|demandar|casta|maa vontade)\w*\b/i,
  /\b(vinho|bebad|b[eê]bedo|embriag|taberna|cerveja|aguardente)\w*\b/i,
];

const TITLE_STOP = new Set([
  "a", "as", "ao", "aos", "com", "como", "da", "das", "de", "do", "dos", "e", "em", "era", "foi",
  "lhe", "mais", "mas", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por", "que", "se", "sem",
  "um", "uma", "uns", "umas", "este", "esta", "isto",
]);

const htmlEntities = {
  nbsp: " ",
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
};

async function api(params) {
  const url = new URL("https://pt.wikisource.org/w/api.php");
  for (const [key, value] of Object.entries({ format: "json", origin: "*", ...params })) url.searchParams.set(key, value);
  for (let attempt = 1; attempt <= 8; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": "shareboard-pack-builder/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) return res.json();
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 8) throw new Error(`${res.status} ${url}`);
    await sleep(res.status === 429 ? 4_000 * attempt : 1_200 * attempt);
  }
  throw new Error(`unreachable ${url}`);
}

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => htmlEntities[n] ?? m);
}

function textFromHtml(html) {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<sup[\s\S]*?<\/sup>/gi, " ")
      .replace(/<span[^>]*class="[^"]*\bws-pagenum\b[^"]*"[^>]*><\/span>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

async function allPages(prefix) {
  const pages = [];
  let apcontinue = "";
  do {
    const j = await api({
      action: "query",
      list: "allpages",
      apprefix: prefix,
      aplimit: "500",
      ...(apcontinue ? { apcontinue } : {}),
    });
    pages.push(...(j.query?.allpages ?? []).map((p) => p.title));
    apcontinue = j.continue?.apcontinue ?? "";
  } while (apcontinue);
  return pages.filter((title) => !SKIP_TITLE.test(title));
}

function curatedPages(source) {
  if (source.curatedOnly && Array.isArray(source.pageTitles) && source.pageTitles.length) {
    return source.pageTitles.map((title) => `${source.prefix}${title}`);
  }
  return null;
}

async function renderedPage(title) {
  const url = new URL("https://pt.wikisource.org/w/index.php");
  url.searchParams.set("title", title);
  url.searchParams.set("action", "render");
  let html = "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      headers: { "user-agent": "shareboard-pack-builder/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok) {
      html = await res.text();
      break;
    }
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt === 4) {
      const j = await api({ action: "parse", prop: "text", page: title });
      html = j.parse?.text?.["*"] ?? "";
      break;
    }
    await sleep(res.status === 429 ? 4_000 * attempt : 1_200 * attempt);
  }
  const firstPage = html.search(/<span><span[^>]+class="[^"]*\bws-pagenum\b/i);
  const proofreadBody = html.indexOf('<div class="prp-pages-output"');
  if (firstPage >= 0) {
    html = html.slice(firstPage);
  } else if (proofreadBody >= 0) {
    html = html.slice(proofreadBody);
  }
  html = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<div[^>]+class="[^"]*\bws-noexport\b[^"]*"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi, " ")
    .replace(/<span[^>]+class="[^"]*\bws-pagenum\b[^"]*"[^>]*><\/span>/gi, " ");
  return textFromHtml(html);
}

function stripChrome(text, pageTitle) {
  const leaf = pageTitle.split("/").pop() ?? pageTitle;
  let out = text;
  const heading = leaf.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "\\W+");
  const re = new RegExp(heading, "i");
  const m = out.match(re);
  if (m?.index != null) out = out.slice(m.index + m[0].length);
  out = out
    .replace(/Edi[cç][aã]o de refer[eê]ncia:[\s\S]{0,240}?(\d{4}|p[aá]ginas? [\d-]+)\.?/i, " ")
    .replace(/Contos Populares Portuguezes|Contos Tradicionaes do Povo Portuguez|O Livro de Esopo/gi, " ")
    .replace(/\bpor Adolfo Coelho\b|\bTeofilo Braga\b|\bTeófilo Braga\b/gi, " ")
    .replace(/\b(Informações desta edição|Referência da disponibilização|A fonte apresentada|Nível de progresso|Permissão|Todas as obras escritas)[\s\S]{0,600}$/i, " ")
    .replace(/\b(Unidade de texto com|digitalização transcluída|Transcrição e Notas de|Vid\. também)[\s\S]{0,300}$/i, " ")
    .replace(/\b[IVXLCDM]{1,8}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cut = out.search(/\b(Categoria|Wikisource|Esta página|Obtida de|NewPP limit report|Parsed by)\b/i);
  if (cut > 100) out = out.slice(0, cut).trim();
  return out;
}

function normalizeCardText(text) {
  return text
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .replace(/\belle\b/gi, "ele")
    .replace(/\bella\b/gi, "ela")
    .replace(/\belles\b/gi, "eles")
    .replace(/\bd'elle\b/gi, "dele")
    .replace(/\bd'ella\b/gi, "dela")
    .replace(/\bph/g, "f")
    .replace(/\bPh/g, "F")
    .replace(/\bChristo\b/g, "Cristo")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-"'.,;: ]+|[-"'.,;: ]+$/g, "")
    .trim();
}

function candidatePieces(text) {
  const clean = normalizeCardText(text);
  const pieces = [];
  if (clean.length <= 650) pieces.push(clean);
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [];
  for (let i = 0; i < sentences.length; i++) {
    let cur = "";
    for (let j = i; j < sentences.length; j++) {
      const next = `${cur} ${sentences[j]}`.trim();
      if (next.length > 650) break;
      cur = next;
      if (cur.length >= 180) pieces.push(cur);
    }
  }
  return pieces;
}

function ok(text, title) {
  if (text.length < 180 || text.length > 650) return false;
  if (UNSAFE.some((rule) => rule.test(`${title} ${text}`))) return false;
  if (/project gutenberg|copyright|wikisource|categoria|p[aá]gina|edi[cç][aã]o de refer/i.test(text)) return false;
  if ((text.match(/\d/g) ?? []).length > 12) return false;
  if (!/[.!?]/.test(text)) return false;
  if (/\[[^\]]+\]|\bFl\.\s*\d/i.test(text)) return false;
  if (/\b(vide|n\.\s*º|liv\.|collec[cç][aã]o|t[ií]tulo|afanasieff|novellino|baculo|forma italiana|contos de pomigliano)\b/i.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length < 30 || words.length > 125) return false;
  return true;
}

function key(text) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stableScore(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function tooSimilar(a, b) {
  const aWords = new Set(key(a).split(/\s+/).filter(Boolean));
  const bWords = new Set(key(b).split(/\s+/).filter(Boolean));
  if (!aWords.size || !bWords.size) return false;
  let shared = 0;
  for (const word of aWords) if (bWords.has(word)) shared++;
  return shared / Math.min(aWords.size, bWords.size) > 0.45;
}

function titleFor(pageTitle, text) {
  const leaf = pageTitle.split("/").pop() ?? "Conto clássico";
  const words = leaf
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !TITLE_STOP.has(word.toLowerCase()))
    .slice(0, 5);
  if (words.length >= 2) return words.join(" ").slice(0, 56);
  const textWords = text
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !TITLE_STOP.has(word.toLowerCase()))
    .slice(0, 4);
  return (textWords.join(" ") || "Conto clássico").slice(0, 56);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const sourceCounts = [];
const cards = [];
for (const source of SOURCE_SETS) {
  if (source.disabled) continue;
  const pages = curatedPages(source) ?? (await allPages(source.prefix));
  const sourceCards = await mapLimit(pages, FETCH_CONCURRENCY, async (page, pageIndex) => {
    console.log(`fetch ${source.id} ${pageIndex + 1}/${pages.length}: ${page}`);
    let text = "";
    try {
      text = stripChrome(await renderedPage(page), page);
      await sleep(120);
    } catch {
      return [];
    }
    const pageCards = [];
    for (const piece of candidatePieces(text)) {
      if (!ok(piece, page)) continue;
      if (pageCards.some((card) => tooSimilar(piece, card.text))) continue;
      pageCards.push({
        text: piece,
        sourceId: source.id,
        sourcePage: page,
        sourceUrl: `https://pt.wikisource.org/wiki/${encodeURIComponent(page).replace(/%2F/g, "/")}`,
      });
      if (pageCards.length >= MAX_CARDS_PER_PAGE) break;
    }
    return pageCards;
  });
  const selected = sourceCards.reduce((sum, pageCards) => sum + pageCards.length, 0);
  cards.push(...sourceCards.flat());
  sourceCounts.push({ id: source.id, title: source.title, pages: pages.length, selected });
}

const seen = new Set();
const deduped = [];
for (const card of cards) {
  const k = key(card.text);
  if (seen.has(k)) continue;
  seen.add(k);
  deduped.push(card);
}
deduped.sort((a, b) => stableScore(a.text) - stableScore(b.text));
const selected = deduped.slice(0, TARGET);
const titled = selected.map((card, index) => ({
  id: index + 1,
  pack: Math.floor(index / PACK_SIZE) + 1,
  text: card.text,
  chars: card.text.length,
  title: titleFor(card.sourcePage, card.text),
  sourceId: card.sourceId,
  sourcePage: card.sourcePage,
  sourceUrl: card.sourceUrl,
}));
const finalSourceCounts = Object.entries(
  titled.reduce((acc, item) => {
    acc[item.sourceId] = (acc[item.sourceId] ?? 0) + 1;
    return acc;
  }, {}),
).map(([id, selected]) => ({ id, selected }));

mkdirSync(OUT_DIR, { recursive: true });
for (let i = 0; i < Math.ceil(titled.length / PACK_SIZE); i++) {
  const rows = titled.slice(i * PACK_SIZE, (i + 1) * PACK_SIZE);
  writeFileSync(resolve(OUT_DIR, `pack-${String(i + 1).padStart(3, "0")}.json`), `${JSON.stringify(rows, null, 2)}\n`);
}
writeFileSync(resolve(OUT_DIR, "titled.json"), `${JSON.stringify(titled, null, 2)}\n`);
writeFileSync(
  resolve(OUT_DIR, "index.json"),
  `${JSON.stringify(
    {
      total: titled.length,
      packs: Math.ceil(titled.length / PACK_SIZE),
      packSize: PACK_SIZE,
      range: [
        titled.reduce((min, item) => Math.min(min, item.chars), Number.POSITIVE_INFINITY),
        titled.reduce((max, item) => Math.max(max, item.chars), 0),
      ],
      safety: {
        filters:
          "Wikisource/public-domain source ledger + adult/religion/politics/violence/protected-class blocklist + short-card length checks",
      },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  resolve(OUT_DIR, "sources.json"),
  `${JSON.stringify(
    {
      licenseNote:
        "Original source books are public-domain by age. Text was extracted from Portuguese Wikisource pages; retain attribution/source URLs in the ledger and descriptions when publishing outside this app.",
      generatedAt: new Date().toISOString(),
      sourceCounts,
      finalSourceCounts,
      sources: SOURCE_SETS.map(({ pageTitles, ...source }) => (source.curatedOnly ? { ...source, pageTitles } : source)),
    },
    null,
    2,
  )}\n`,
);

console.log(`Portuguese classic humor deck ready: ${titled.length} cards`);
console.log(JSON.stringify({ sourceCounts, finalSourceCounts }, null, 2));

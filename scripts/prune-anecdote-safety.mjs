#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const CONFIGS = [
  {
    id: "de",
    dir: "data/anecdotes-de",
    packSize: 100,
    patterns: [
      /fick|arsch|schei[sß]|kacke|kotz|pisse|pinkel|fotze|muschi|schwanz|penis|vagina|titt|möse|moese|hure|nutte|schlampe|bordell|wichs|sperma|porno|\bsex\b|sexuell|sexual|homosex|transsex|orgasm|bums|poppen|blasen|geil|\banal|blowjob|sextreff|kondom|fremdgeh|geschlafen|\bpuff\b/i,
      /nazi|hitler|judensau|\bjud|neger|nigg|schwuchtel|spasti|behindert|krüppel|krueppel|\bmongo|missgeburt|kanake|zigeuner|chines|äthiop|aethiop/i,
      /vergewaltig|selbstmord|suizid|tötet|toetet|töten|toeten|getötet|getoetet|umbringen|killer|auftragskiller|\btod\b|\btot\b|tote\b|sterb|mord|blut|krieg|waffe|messer|schieß|schiess|schuss|erschoss/i,
      /jesus|\bgott\b|kirche|pfarrer|priester|papst|bibel|teufel|hölle|hoelle/i,
      /führer|fuehrer|ukraine|russland|politiker|präsident|praesident|minister|polizei|richter|gericht/i,
    ],
  },
  {
    id: "ru",
    dir: "data/anecdotes",
    packSize: 100,
    patterns: [
      /гомосек|пидор|педик|транссек|пенис|член|минет|проститут|шлюх|оргазм|дроч|секс|сиськ|гол[ао]й|сперма/i,
      /чукч|китаец|китайц|евре|жид|хач|негр|даун|дебил|кретин|урод|инвалид/i,
      /изнасил|самоуб|суицид|убил|убить|убивал|убью|убий|съесть|сожрать|кровь|нож|пистолет|оруж|террор|гитлер|наци/i,
      /ислам|мусульман|христиан|иисус|бог|церк|поп|священ|библи|коран|аллах|ад|дьявол/i,
      /украин|росси|путин|зеленск|политик|президент|министр|полици|судья|суд\b/i,
    ],
  },
  {
    id: "it",
    dir: "data/anecdotes-it",
    packSize: 5000,
    patterns: [
      /\bcazz|cul[oi]\b|\bmerd|puttan|\btroi[ae]|\bfiga\b|scopa(re|ta|to)|chiavar|porno|sessual|preservativ|eiacul|erezion|masturb|orgasm|amplesso|sborr|coglion|minchia|frocio|stronz|vaffa|incul|zoccol|pompin|\bpene\b|vagina|\btett[ei]\b|prostitut|verginit|\bsesso\b|\bsega\b|fremd|tradire|tradimento/i,
      /uccid|ammazz|\bmorte\b|\bmorto\b|\bmorta\b|sangue|guerra|arma|coltello|suicid|assassin/i,
      /\bebre|zingar|\bnegr|handicapp|idiot|cretin|mongol/i,
      /ges[uù]|\bdio\b|chiesa|prete|papa|inferno|diavolo|bibbi/i,
      /hitler|mussolini|fascis|presidente|ministro|polizia|giudice|tribunale/i,
    ],
  },
];

function pruneDeck({ id, dir, packSize, patterns }) {
  const abs = resolve(process.cwd(), dir);
  const source = JSON.parse(readFileSync(resolve(abs, "titled.json"), "utf8"));
  const previousIndexFile = resolve(abs, "index.json");
  const previousReportFile = resolve(abs, "safety-pruned.json");
  const previousIndex = existsSync(previousIndexFile) ? JSON.parse(readFileSync(previousIndexFile, "utf8")) : {};
  const previousReport = existsSync(previousReportFile) ? JSON.parse(readFileSync(previousReportFile, "utf8")) : null;
  const kept = [];
  const removed = [];
  for (const item of source) {
    const text = `${item.title || ""}\n${item.text || ""}`;
    if (patterns.some((pattern) => pattern.test(text))) {
      removed.push({ id: item.id, title: item.title, chars: item.chars });
      continue;
    }
    kept.push(item);
  }

  kept.forEach((item, index) => {
    item.id = index + 1;
    item.pack = Math.floor(index / packSize) + 1;
    item.chars = String(item.text || "").length;
  });
  const packCount = Math.max(1, Math.ceil(kept.length / packSize));
  for (const file of readdirSync(abs).filter((name) => /^pack-\d+\.json$/.test(name))) {
    unlinkSync(resolve(abs, file));
  }
  for (let pack = 1; pack <= packCount; pack += 1) {
    const slice = kept.filter((item) => item.pack === pack);
    writeFileSync(resolve(abs, `pack-${String(pack).padStart(3, "0")}.json`), `${JSON.stringify(slice, null, 1)}\n`);
  }
  writeFileSync(resolve(abs, "titled.json"), `${JSON.stringify(kept, null, 1)}\n`);
  const lengths = kept.map((item) => item.chars).sort((a, b) => a - b);
  writeFileSync(
    resolve(abs, "index.json"),
    `${JSON.stringify(
      {
        total: kept.length,
        packs: packCount,
        packSize,
        range: lengths.length ? [lengths[0], lengths[lengths.length - 1]] : [0, 0],
        safetyPrunedAt: removed.length || !previousIndex.safetyPrunedAt ? new Date().toISOString() : previousIndex.safetyPrunedAt,
        safetyPrunedRemoved:
          removed.length || previousIndex.safetyPrunedRemoved == null
            ? removed.length
            : previousIndex.safetyPrunedRemoved,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    resolve(abs, "safety-pruned.json"),
    `${JSON.stringify(
      removed.length || !previousReport
        ? {
            generatedAt: new Date().toISOString(),
            sourceTotal: source.length,
            kept: kept.length,
            removed: removed.length,
            removedSample: removed.slice(0, 50),
          }
        : previousReport,
      null,
      2,
    )}\n`,
  );
  console.log(`${id}: source=${source.length} kept=${kept.length} removed=${removed.length} packs=${packCount}`);
}

for (const config of CONFIGS) pruneDeck(config);

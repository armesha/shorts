import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { followGta6Live, runGta6Highlights, sourcePlansFromInputs, type Gta6SourcePlan } from "../server/services/gta6-highlights-media.ts";
import type { Gta6Label } from "../server/services/gta6-highlights.ts";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
let outDir = "";
let telegram = false;
let labelsPath = "";
let live = "";
let minutes = 10;
const inputs: string[] = [];
const sources: Gta6SourcePlan[] = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--telegram") { telegram = true; continue; }
  if (arg === "--out") { outDir = argv[++index] || ""; continue; }
  if (arg === "--labels") { labelsPath = argv[++index] || ""; continue; }
  if (arg === "--live") { live = argv[++index] || ""; continue; }
  if (arg === "--minutes") { minutes = Number(argv[++index]); continue; }
  if (arg === "--input") { inputs.push(argv[++index] || ""); continue; }
  if (arg === "--chunk") {
    const sourceId = argv[++index] || "";
    const file = argv[++index] || "";
    if (!sourceId || !file) fail("Для --chunk нужны идентификатор и путь.");
    const existing = sources.find((source) => source.sourceId === sourceId);
    if (existing) existing.chunks.push(file);
    else sources.push({ sourceId, chunks: [file] });
    continue;
  }
  fail(`Неизвестный аргумент: ${arg || ""}`);
}
if (!outDir) fail("Нужен каталог --out.");
let labels: Gta6Label[] | undefined;
if (labelsPath) labels = JSON.parse(await readFile(labelsPath, "utf8")) as Gta6Label[];
const plans = [...sources, ...sourcePlansFromInputs(inputs.filter(Boolean))];
if (live && plans.length) fail("Режим эфира не смешивается с --input и --chunk.");
if (!live && !plans.length) fail("Нужен --live, --input или --chunk.");
const report = live
  ? await followGta6Live({
      url: live,
      outDir: resolve(outDir),
      minutes,
      telegram,
      labels,
      signal: listenForStop(),
      log: (line) => process.stderr.write(`${line}\n`),
    })
  : await runGta6Highlights({ sources: plans, outDir: resolve(outDir), telegram, labels });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function listenForStop() {
  const stop = new AbortController();
  process.once("SIGINT", () => {
    process.stderr.write("Останавливаю запись после текущего куска.\n");
    stop.abort();
  });
  return stop.signal;
}

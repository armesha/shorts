import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runGta6Highlights, sourcePlansFromInputs, type Gta6SourcePlan } from "../server/services/gta6-highlights-media.ts";
import type { Gta6Label } from "../server/services/gta6-highlights.ts";

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
let outDir = "";
let telegram = false;
let labelsPath = "";
const inputs: string[] = [];
const sources: Gta6SourcePlan[] = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === "--telegram") { telegram = true; continue; }
  if (arg === "--out") { outDir = argv[++index] || ""; continue; }
  if (arg === "--labels") { labelsPath = argv[++index] || ""; continue; }
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
const plans = [...sources, ...sourcePlansFromInputs(inputs.filter(Boolean))];
if (!plans.length) fail("Нужен хотя бы один --input или --chunk.");
let labels: Gta6Label[] | undefined;
if (labelsPath) labels = JSON.parse(await readFile(labelsPath, "utf8")) as Gta6Label[];
const report = await runGta6Highlights({ sources: plans, outDir: resolve(outDir), telegram, labels });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

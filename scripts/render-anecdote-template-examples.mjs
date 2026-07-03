#!/usr/bin/env node
import { openDb } from "../server/db.ts";
import { loadBaseConfig } from "../server/config.ts";
import {
  ANECDOTE_TEMPLATE_EXAMPLES_OWNER,
  collectAnecdoteTemplateExamples,
  renderAnecdoteTemplateExamples,
} from "../server/services/anecdote-template-examples.ts";

const force = process.argv.includes("--force");
const widthArg = process.argv.find((arg) => arg.startsWith("--width="));
const width = widthArg ? Math.max(240, Math.min(720, Number(widthArg.slice("--width=".length)) || 420)) : 420;
const base = loadBaseConfig();
const db = openDb(base.dbPath);

try {
  const catalog = collectAnecdoteTemplateExamples(db, base.outputDir, ANECDOTE_TEMPLATE_EXAMPLES_OWNER);
  console.log(
    `anecdote template examples: owner=${catalog.owner.username} accounts=${catalog.accountCount} sources=${catalog.sourceDecks.length} templates=${catalog.total}`,
  );
  const result = await renderAnecdoteTemplateExamples(catalog, { force, width });
  console.log(`rendered=${result.rendered} skipped=${result.skipped} failed=${result.failed.length}`);
  for (const failure of result.failed) {
    console.error(`${failure.no} ${failure.key}: ${failure.error}`);
  }
  if (result.failed.length) process.exitCode = 1;
} finally {
  db.db.close();
}

// Unit-ish test for the psych card uploader core (validate + append + list).
// Uses a TEMP file — never touches the real data/psych/cards.json. Run:
//   node --import tsx src/scripts/psych-cards-test.ts
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { writeFileSync, rmSync } from "node:fs";
import { validateBatch, appendCards, listCards } from "../psych/cards-store.ts";
import { PSYCH_PATTERNS } from "../psych/schema.ts";

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) fails++;
};

const TMP = resolve(tmpdir(), `psych-cards-test-${process.pid}.json`);
writeFileSync(TMP, "[]");

// --- good batch: one valid card per pattern (3 items each) ---
const good = PSYCH_PATTERNS.map((p) => ({
  pattern: p.id,
  title_lines: ["Zeile eins kurz", "Zeile zwei kurz"],
  items: [p.exampleItem, p.exampleItem, p.exampleItem],
  outro: "Kurzer Schlusssatz.",
}));
const gv = validateBatch(good);
ok(gv.errors.length === 0, `все ${good.length} валидных паттернов прошли (ошибок: ${gv.errors.length})`);
ok(gv.cards.length === PSYCH_PATTERNS.length, `вернулось ${gv.cards.length} чистых карточек`);

// --- bad batch: each entry has a distinct problem ---
const bad = [
  { pattern: "totally_unknown", title_lines: ["a", "b"], items: [{ text: "x" }, { text: "y" }, { text: "z" }] },
  { pattern: "numbered", title_lines: ["nur eine Zeile"], items: [{ lead: "a", text: "b" }, { lead: "c", text: "d" }, { lead: "e", text: "f" }] },
  { pattern: "term", title_lines: ["a", "b"], items: [{ term: "x" }] }, // missing val + too few items
  { pattern: "bullet", title_lines: ["a", "b"], items: [{ text: "x" }, { text: "y" }, { text: "z" }], outro: "X".repeat(200) },
];
const bv = validateBatch(bad);
ok(bv.errors.length === 4, `все 4 битых карточки отклонены (отклонено: ${bv.errors.length})`);
ok(bv.cards.length === 0, `чистых карточек из битого батча: ${bv.cards.length} (ждём 0)`);
console.log("   примеры сообщений:", bv.errors.flatMap((e) => e.messages).slice(0, 4));

// --- unknown extra fields in items are stripped ---
const extra = validateBatch([
  { pattern: "bullet", title_lines: ["a", "b"], items: [{ text: "ok", junk: "drop me" }, { text: "b" }, { text: "c" }] },
]);
ok(
  extra.cards.length === 1 && !("junk" in extra.cards[0].items[0]),
  "неизвестные поля пункта отбрасываются при сохранении",
);

// --- append + list on the temp file ---
const r1 = appendCards(gv.cards, TMP, "2026-06-14T10:00:00.000Z");
ok(r1.added === good.length && r1.total === good.length, `дозаписано ${r1.added}, всего ${r1.total}`);
const r2 = appendCards([gv.cards[0]], TMP, "2026-06-14T11:00:00.000Z");
ok(r2.total === good.length + 1, `после второй загрузки всего ${r2.total}`);

const list = listCards({ page: 1, pageSize: 5, onlyUploaded: true }, TMP);
ok(list.total === good.length + 1, `в ленте ${list.total} загруженных`);
ok(list.items.length === 5, `на странице ${list.items.length} (pageSize=5)`);
ok(list.items[0].card.addedAt === "2026-06-14T11:00:00.000Z", "сортировка: новейшая карточка сверху");

rmSync(TMP, { force: true });
console.log(fails === 0 ? "\n🎉 Все проверки прошли" : `\n💥 Провалов: ${fails}`);
process.exit(fails === 0 ? 0 : 1);

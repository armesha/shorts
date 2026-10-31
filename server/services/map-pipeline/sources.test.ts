import { test } from "node:test";
import assert from "node:assert/strict";
import { mapObservations, type CountryMeta } from "./sources.ts";
import { buildMapTheme, mapSubtitles } from "./theme.ts";
import { METRICS } from "./sources.ts";

test("regional estimates are marked and both answers match the stated threshold", () => {
  const meta: Record<string, CountryMeta> = {};
  const values: Record<string, number> = {};
  const ids = Array.from({ length: 101 }, (_, i) => String(i).padStart(3, "0"));
  for (let i = 0; i < 101; i++) {
    meta[ids[i]] = { name: `Country ${i}`, iso3: `C${i}`, continent: "Europe", center: [i, 40] };
    if (i < 100) values[`C${i}`] = i;
  }
  const observations = mapObservations(ids, meta, values, 2023);
  assert.equal(observations["099"].estimated, false);
  assert.equal(observations["100"].estimated, true);
  assert.equal(observations["100"].donors!.length, 3);
  assert.ok(observations["100"].donors!.every(id => !observations[id].estimated));
  const template = { duration: 156, stops: [{ time: 0 }, { time: 156 }], reveals: ids.map((id, i) => ({ time: i, countries: [id] })), chapters: [{ start: 0, end: 156 }], marker: { kind: "value" } };
  const idea = { themeId: "internet", title: "Интернет по странам", hook: "Кто чаще выходит в интернет?", reason: "Сравнение" };
  const theme = buildMapTheme(template, meta, observations, METRICS[0], idea, "daily-test");
  assert.equal(theme.duration, 180);
  assert.ok(theme.countryStyles["100"].value.startsWith("≈"));
  assert.match(theme.countryStyles["100"].value, /^≈(ДА|НЕТ)$/);
  assert.deepEqual(theme.legend.map((row: {label:string}) => row.label), ["НЕТ", "ДА"]);
  assert.equal(theme.countryStyles["000"].value, "НЕТ");
  assert.equal(theme.countryStyles["099"].value, "ДА");
  assert.match(idea.title, /выше 50 процентов\?$/);
  assert.equal(theme.winner.title.ru, "ОТВЕТЫ ПО СТРАНАМ");
  assert.equal(theme.winner.showAt, 172);
  assert.ok(theme.legend.every((row: {label:string}) => !row.label.includes("%")));
  assert.ok(!mapSubtitles(idea, METRICS[0], 25).includes("%"));
  assert.ok(mapSubtitles(idea, METRICS[0], 3).includes("2023"));
  assert.throws(() => mapObservations(ids, meta, {}, 2023), /минимум 100/);
});

test("numeric maps show actual country values without a legend", () => {
  const template = { duration: 156, stops: [{ time: 0 }, { time: 156 }], reveals: [], chapters: [{ start: 0, end: 156 }] };
  const meta: Record<string, CountryMeta> = {
    "001": { name: "A", continent: "Europe", center: [0, 0] },
    "002": { name: "B", continent: "Europe", center: [1, 0] },
  };
  const observations = {
    "001": { value: 73.6, year: 2023, iso3: "AAA", estimated: false },
    "002": { value: 81.2, year: 2023, iso3: "BBB", estimated: true },
  };
  const idea = { themeId: "life", title: "Тест", hook: "Тест", reason: "Тест" };
  const metric = METRICS.find(m => m.id === "life")!;
  const theme = buildMapTheme(template, meta, observations, metric, idea, "numeric-test", "numeric");
  assert.deepEqual(theme.legend, []);
  assert.equal(theme.countryStyles["001"].value, "73,6");
  assert.equal(theme.countryStyles["002"].value, "≈81,2");
  assert.equal(theme.winner.title.ru, "ПОКАЗАТЕЛИ ПО СТРАНАМ");
  assert.equal(idea.hook, idea.title);
  assert.match(idea.title, /\?$/);
});

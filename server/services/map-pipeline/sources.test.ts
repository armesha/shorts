import { test } from "node:test";
import assert from "node:assert/strict";
import { mapObservations, type CountryMeta } from "./sources.ts";
import { buildMapTheme, mapSubtitles } from "./theme.ts";
import { METRICS } from "./sources.ts";

test("regional estimates are marked, attributed to measured donors, and never win measured ranking", () => {
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
  assert.equal(theme.duration, 90);
  assert.ok(theme.countryStyles["100"].value.startsWith("≈"));
  assert.equal(theme.winner.ranking[0].country.ru, "Country 99");
  assert.ok(mapSubtitles(idea, METRICS[0], 3).includes("2023"));
  assert.throws(() => mapObservations(ids, meta, {}, 2023), /минимум 100/);
});

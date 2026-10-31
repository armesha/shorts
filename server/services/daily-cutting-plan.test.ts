import test from "node:test";
import assert from "node:assert/strict";
import { dailyCuttingPrompt, validateDailyPlan } from "./daily-cutting-plan.ts";
import { parseVideoVtt } from "./video-cutting-plan.ts";

const segment = (start: number, end: number) => ({ start_seconds: start, end_seconds: end, start_time: "00:00", end_time: "00:00" });
const clip = (part: number, start: number, end: number) => ({ clip_id: part, clip_type: "series_part", story_title: "История", part, total_parts: 2,
  segments: [segment(start, end)], total_duration_seconds: end - start, first_phrase: "Начало", last_phrase: "Конец", cut_reason: "Переход", viral_title: "История", on_screen_hook: "Часть", caption_and_tags: "Описание #тег", viral_score: 8, trigger: "mystery" });

test("series permits only a three to five second overlap", () => {
  const first = clip(1, 0, 180), second = clip(2, 176, 320);
  assert.equal(validateDailyPlan({ detected_mode: "serial", detected_ads_to_exclude: [], clips: [first, second] }, 400).plan.length, 2);
  assert.throws(() => validateDailyPlan({ detected_mode: "serial", detected_ads_to_exclude: [], clips: [first, clip(2, 170, 320)] }, 400));
  assert.throws(() => validateDailyPlan({ detected_mode: "serial", detected_ads_to_exclude: [], clips: [first, clip(2, 176, 280)] }, 400));
});

test("ad ranges cannot be included in composite clips", () => {
  const composite = { ...clip(1, 0, 250), total_parts: 1, segments: [segment(0, 100), segment(130, 250)], total_duration_seconds: 220 };
  const ad = { ...segment(100, 130), type: "sponsor", reason: "Реклама" };
  assert.equal(validateDailyPlan({ detected_mode: "serial", detected_ads_to_exclude: [ad], clips: [composite] }, 300).plan.length, 1);
  assert.throws(() => validateDailyPlan({ detected_mode: "serial", detected_ads_to_exclude: [ad], clips: [clip(1, 0, 250)] }, 300));
});

test("prompt carries saved rules, subtitles and timestamps", () => {
  const prompt = dailyCuttingPrompt("Видео", 300, [{ start: 2, end: 3, text: "Ответ" }], [{ start: 1, title: "Глава", source: "chapter" }], "Правила редактора");
  for (const value of ["Ответ", "Глава", "Правила редактора"]) assert.ok(prompt.includes(value));
});

test("speech omitted from both clips and excluded ads is rejected", () => {
  const one = { ...clip(1, 30, 180), total_parts: 1 };
  const words = Array.from({ length: 20 }, (_, i) => ({ start: i, end: i + 0.5, text: "слово" }));
  assert.throws(() => validateDailyPlan({ detected_mode: "serial", detected_ads_to_exclude: [], clips: [one] }, 200, words), /Не учтена речь/);
  const ad = { ...segment(0, 25), type: "self-promo", reason: "Призыв" };
  assert.equal(validateDailyPlan({ detected_mode: "serial", detected_ads_to_exclude: [ad], clips: [one] }, 200, words).plan.length, 1);
});

test("highlights may omit speech but must be standalone, short and proportional", () => {
  const highlights = Array.from({ length: 5 }, (_, i) => ({ ...clip(i + 1, i * 600, i * 600 + 60), clip_type: "standalone_highlight", part: 1, total_parts: 1, trigger: "comedy" }));
  const words = Array.from({ length: 20 }, (_, i) => ({ start: 300 + i, end: 300 + i + 0.5, text: "слово" }));
  assert.equal(validateDailyPlan({ detected_mode: "highlights", detected_ads_to_exclude: [], clips: highlights }, 3600, words).plan.length, 5);
  assert.throws(() => validateDailyPlan({ detected_mode: "highlights", detected_ads_to_exclude: [], clips: highlights.slice(0, 2) }, 3600));
  assert.throws(() => validateDailyPlan({ detected_mode: "highlights", detected_ads_to_exclude: [], clips: [{ ...highlights[0], total_duration_seconds: 30 }, ...highlights.slice(1)] }, 3600));
  const splitFirst = { ...highlights[0], clip_type: "series_part", total_parts: 2 };
  const splitNext = { ...splitFirst, clip_id: 10, part: 2, segments: [segment(56, 116)] };
  assert.equal(validateDailyPlan({ detected_mode: "highlights", detected_ads_to_exclude: [], clips: [splitFirst, splitNext, ...highlights.slice(1)] }, 3600).plan.length, 6);
});

test("highlight analysis keeps laughter and applause while discarding music", () => {
  const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nСмешно [смех] [музыка] [аплодисменты]\n";
  assert.deepEqual(parseVideoVtt(vtt, { includeReactions: true }).map(w => w.text), ["Смешно", "[смех]", "[аплодисменты]"]);
  assert.deepEqual(parseVideoVtt(vtt).map(w => w.text), ["Смешно"]);
});

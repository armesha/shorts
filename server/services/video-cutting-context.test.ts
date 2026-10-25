import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCuttingTimecodes,
  cleanCuttingTimecodes,
  alignCutPlanToSpeech,
  autoCutLimits,
} from "./video-cutting-context.ts";
import { sponsorTimeline } from "./video-cutting-sponsorblock.ts";
import {
  CutRequestSchema,
  cuttingPrompt,
  validateCutPlan,
} from "./video-cutting-plan.ts";

test("author timecodes, sponsor removal and speech boundaries produce a bounded contextual plan", () => {
  const anchors = extractCuttingTimecodes(
    {
      chapters: [
        { start_time: 0, title: "Вступление" },
        { start_time: 90, title: "Большая тема" },
      ],
      description:
        "00:00 Дубликат вступления\n00:30 Рекламная вставка\n01:30 Дубликат темы\n02:05 Новый эпизод\n1:02:03 Длинная глава\n99:99 Неверное время",
    },
    4000,
  );
  assert.deepEqual(
    anchors.map((anchor) => anchor.start),
    [0, 30, 90, 125, 3723],
  );
  assert.equal(anchors[0].source, "chapter");
  const cleaned = cleanCuttingTimecodes(
    anchors,
    sponsorTimeline(4000, [{ start: 20, end: 40 }]),
  );
  assert.deepEqual(
    cleaned.map((anchor) => anchor.start),
    [0, 70, 105, 3703],
  );
  assert.equal(cleaned[1].sourceStart, 90);
  const input = CutRequestSchema.parse({
    url: "https://youtu.be/iJH6dAG9NVk",
    mode: "auto",
  });
  const prompt = cuttingPrompt(input, 3980, "Тест", [], cleaned);
  assert.ok(prompt.includes("Target about 180 seconds"));
  assert.ok(prompt.includes("A long chapter may become two"));
  assert.ok(!prompt.includes('"sourceStart"'));
  assert.equal(autoCutLimits(345).preferred, 2);
  assert.equal(autoCutLimits(150).max, 1);
  assert.equal(
    validateCutPlan(
      {
        parts: [
          {
            start: 0,
            end: 180,
            title: "Целый эпизод",
            reason: "Видео уже короткое",
          },
        ],
      },
      180,
      input,
    ).length,
    1,
  );
  assert.throws(
    () =>
      validateCutPlan(
        {
          parts: [
            { start: 0, end: 400, title: "Длинно", reason: "Тема" },
            ...[1, 2, 3, 4].map((_, index) => ({
              start: 400 + index * 125,
              end: 525 + index * 125,
              title: "Продолжение",
              reason: "Тема",
            })),
          ],
        },
        900,
        input,
      ),
    /слишком длинные/,
  );
  assert.throws(
    () =>
      validateCutPlan(
        {
          parts: [
            { start: 0, end: 5, title: "Коротко", reason: "Переход" },
            { start: 5, end: 345, title: "Дальше", reason: "Финал" },
          ],
        },
        345,
        input,
      ),
    /слишком короткие/,
  );
  const tooMany = {
    parts: Array.from({ length: 11 }, (_, index) => ({
      start: index * 2,
      end: (index + 1) * 2,
      title: "Тема",
      reason: "Новый эпизод",
    })),
  };
  assert.throws(() => validateCutPlan(tooMany, 22, input), /длительности/);
  assert.equal(
    validateCutPlan(tooMany, 22, { ...input, mode: "manual", count: 11 })
      .length,
    11,
  );
  const parts = validateCutPlan(
    {
      parts: [
        { start: 0, end: 1.4, title: "Первая", reason: "Переход" },
        { start: 1.4, end: 4, title: "Вторая", reason: "Финал" },
      ],
    },
    4,
    { ...input, mode: "manual", count: 2 },
  );
  const words = [
    { start: 0, end: 1.2, text: "Первое" },
    { start: 1.25, end: 1.75, text: "слово." },
    { start: 2, end: 3, text: "Далее" },
  ];
  const aligned = alignCutPlanToSpeech(parts, words, []);
  assert.equal(aligned.length, 2);
  assert.equal(aligned[0].end, aligned[1].start);
  assert.equal(aligned[1].end, 4);
  assert.ok(
    !words.some(
      (word) => aligned[0].end > word.start && aligned[0].end < word.end,
    ),
  );
});

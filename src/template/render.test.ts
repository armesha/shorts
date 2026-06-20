import assert from "node:assert/strict";
import test from "node:test";
import {
  TEMPLATE_LIMITS,
  TemplateValidationError,
  validateTemplateDoc,
  validateTemplateList,
  type TemplateDoc,
} from "./render.ts";

const baseTemplate = (): TemplateDoc => ({
  canvas: { w: 1080, h: 1920, bg: "#ffffff" },
  elements: [
    {
      id: "bg",
      type: "image",
      x: 0,
      y: 0,
      w: 1080,
      h: 1920,
      src: "assets/template-packs/psychology-mgs/backgrounds/ai-bg-01.jpg",
      fit: "cover",
    },
    {
      id: "title",
      type: "killbox",
      x: 100,
      y: 100,
      w: 880,
      h: 220,
      role: "title",
      font: { family: "Inter", size: 80, weight: 800, color: "#111111", lineHeight: 1.1 },
    },
  ],
});

test("template validation allows existing local asset roots and data-image backgrounds", () => {
  const tpl = baseTemplate();
  tpl.canvas.bg = "url(data:image/png;base64,iVBORw0KGgo=)";
  assert.doesNotThrow(() => validateTemplateDoc(tpl));
});

test("template validation rejects external and traversal image sources", () => {
  const external = baseTemplate();
  external.elements[0].src = "http://169.254.169.254/latest/meta-data";
  assert.throws(() => validateTemplateDoc(external), TemplateValidationError);

  const traversal = baseTemplate();
  traversal.elements[0].src = "assets/template-packs/../../data/app.db";
  assert.throws(() => validateTemplateDoc(traversal), TemplateValidationError);
});

test("template validation rejects external CSS urls", () => {
  const tpl = baseTemplate();
  tpl.canvas.bg = "url(https://example.com/bg.png)";
  assert.throws(() => validateTemplateDoc(tpl), TemplateValidationError);
});

test("template validation enforces canvas, element and image limits", () => {
  const hugeCanvas = baseTemplate();
  hugeCanvas.canvas.w = TEMPLATE_LIMITS.maxCanvasW + 1;
  assert.throws(() => validateTemplateDoc(hugeCanvas), TemplateValidationError);

  const many = baseTemplate();
  many.elements = Array.from({ length: TEMPLATE_LIMITS.maxElements + 1 }, (_, i) => ({
    ...baseTemplate().elements[1],
    id: `t${i}`,
  }));
  assert.throws(() => validateTemplateDoc(many), TemplateValidationError);

  const templates = Array.from({ length: TEMPLATE_LIMITS.maxTemplatesPerPack + 1 }, () => baseTemplate());
  assert.throws(() => validateTemplateList(templates), TemplateValidationError);
});

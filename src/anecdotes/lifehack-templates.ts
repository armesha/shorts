export interface LifehackTemplate {
  id: string;
  layout: "note" | "ledger" | "poster" | "split" | "label";
  vars: Record<string, string>;
}

const BASE = {
  "--body-left": "110px",
  "--body-top": "500px",
  "--body-width": "760px",
  "--body-height": "850px",
  "--title-left": "120px",
  "--title-top": "128px",
  "--title-width": "700px",
  "--title-height": "170px",
  "--title-radius": "34px",
  "--body-radius": "38px",
  "--panel-border": "rgba(28, 22, 16, 0.16)",
  "--panel-shadow": "0 28px 80px rgba(20, 18, 16, 0.28)",
  "--title-size": "62px",
  "--text-size": "48px",
  "--text-lh": "1.28",
  "--scrim-a": "rgba(10, 12, 18, 0.18)",
  "--scrim-b": "rgba(250, 247, 239, 0.12)",
};

function tpl(id: string, layout: LifehackTemplate["layout"], vars: Record<string, string>): LifehackTemplate {
  return { id, layout, vars: { ...BASE, ...vars } };
}

export const LIFEHACK_TEMPLATES: LifehackTemplate[] = [
  tpl("mint-ledger", "ledger", {
    "--accent": "#1f9d8a", "--accent-2": "#ffd166", "--title-bg": "#133b37", "--title-fg": "#fffaf0",
    "--body-bg": "rgba(255, 252, 239, 0.94)", "--ink": "#17211f", "--rule": "rgba(31, 157, 138, 0.24)",
  }),
  tpl("tomato-note", "note", {
    "--accent": "#e24a3b", "--accent-2": "#2f80ed", "--title-bg": "#e24a3b", "--title-fg": "#fff8ed",
    "--body-bg": "rgba(255, 247, 232, 0.95)", "--ink": "#211714", "--rule": "rgba(226, 74, 59, 0.18)",
  }),
  tpl("cobalt-ticket", "label", {
    "--accent": "#2952d9", "--accent-2": "#f2c94c", "--title-bg": "#f2c94c", "--title-fg": "#17224a",
    "--body-bg": "rgba(245, 249, 255, 0.95)", "--ink": "#151b2f", "--body-left": "145px", "--body-width": "720px",
    "--rule": "rgba(41, 82, 217, 0.17)",
  }),
  tpl("plum-poster", "poster", {
    "--accent": "#7a3e9d", "--accent-2": "#20b486", "--title-bg": "#301042", "--title-fg": "#fff7fd",
    "--body-bg": "rgba(253, 248, 255, 0.94)", "--ink": "#211627", "--rule": "rgba(122, 62, 157, 0.18)",
  }),
  tpl("amber-split", "split", {
    "--accent": "#f59e0b", "--accent-2": "#0f766e", "--title-bg": "#0f766e", "--title-fg": "#fff7de",
    "--body-bg": "rgba(255, 250, 238, 0.95)", "--ink": "#211b11", "--body-left": "280px", "--body-width": "660px",
    "--rule": "rgba(245, 158, 11, 0.22)",
  }),
  tpl("sky-ledger", "ledger", {
    "--accent": "#0284c7", "--accent-2": "#fb7185", "--title-bg": "#e0f2fe", "--title-fg": "#0b3352",
    "--body-bg": "rgba(247, 252, 255, 0.94)", "--ink": "#112231", "--rule": "rgba(2, 132, 199, 0.18)",
  }),
  tpl("olive-note", "note", {
    "--accent": "#667a2f", "--accent-2": "#d95f43", "--title-bg": "#4f5f24", "--title-fg": "#fffbe8",
    "--body-bg": "rgba(251, 250, 232, 0.95)", "--ink": "#202312", "--body-left": "130px", "--body-top": "520px",
    "--rule": "rgba(102, 122, 47, 0.22)",
  }),
  tpl("ink-label", "label", {
    "--accent": "#111827", "--accent-2": "#38bdf8", "--title-bg": "#111827", "--title-fg": "#f8fafc",
    "--body-bg": "rgba(248, 250, 252, 0.95)", "--ink": "#111827", "--body-left": "120px", "--body-width": "735px",
    "--rule": "rgba(17, 24, 39, 0.14)",
  }),
  tpl("berry-poster", "poster", {
    "--accent": "#be185d", "--accent-2": "#fde047", "--title-bg": "#be185d", "--title-fg": "#fff7ed",
    "--body-bg": "rgba(255, 247, 250, 0.95)", "--ink": "#2b1020", "--rule": "rgba(190, 24, 93, 0.16)",
  }),
  tpl("teal-split", "split", {
    "--accent": "#0f766e", "--accent-2": "#f97316", "--title-bg": "#fff7ed", "--title-fg": "#103d39",
    "--body-bg": "rgba(241, 253, 250, 0.95)", "--ink": "#10201f", "--body-left": "250px", "--body-width": "690px",
    "--rule": "rgba(15, 118, 110, 0.18)",
  }),
  tpl("lime-ledger", "ledger", {
    "--accent": "#65a30d", "--accent-2": "#7c3aed", "--title-bg": "#ecfccb", "--title-fg": "#25430d",
    "--body-bg": "rgba(250, 255, 240, 0.95)", "--ink": "#1b2411", "--rule": "rgba(101, 163, 13, 0.2)",
  }),
  tpl("rose-note", "note", {
    "--accent": "#e11d48", "--accent-2": "#06b6d4", "--title-bg": "#fff1f2", "--title-fg": "#861337",
    "--body-bg": "rgba(255, 249, 250, 0.95)", "--ink": "#26141a", "--rule": "rgba(225, 29, 72, 0.17)",
  }),
  tpl("graphite-ticket", "label", {
    "--accent": "#334155", "--accent-2": "#fbbf24", "--title-bg": "#334155", "--title-fg": "#f8fafc",
    "--body-bg": "rgba(250, 250, 247, 0.94)", "--ink": "#172033", "--body-left": "170px", "--body-width": "700px",
    "--rule": "rgba(51, 65, 85, 0.14)",
  }),
  tpl("aqua-poster", "poster", {
    "--accent": "#0891b2", "--accent-2": "#f43f5e", "--title-bg": "#0e7490", "--title-fg": "#ecfeff",
    "--body-bg": "rgba(240, 253, 250, 0.94)", "--ink": "#0f2427", "--rule": "rgba(8, 145, 178, 0.18)",
  }),
  tpl("sand-split", "split", {
    "--accent": "#b45309", "--accent-2": "#2563eb", "--title-bg": "#fffbeb", "--title-fg": "#713f12",
    "--body-bg": "rgba(255, 251, 235, 0.95)", "--ink": "#23190d", "--body-left": "300px", "--body-width": "635px",
    "--rule": "rgba(180, 83, 9, 0.2)",
  }),
  tpl("violet-ledger", "ledger", {
    "--accent": "#6d28d9", "--accent-2": "#22c55e", "--title-bg": "#ede9fe", "--title-fg": "#2e1065",
    "--body-bg": "rgba(250, 247, 255, 0.95)", "--ink": "#22163a", "--rule": "rgba(109, 40, 217, 0.17)",
  }),
  tpl("coral-note", "note", {
    "--accent": "#fb6f5f", "--accent-2": "#256d85", "--title-bg": "#fb6f5f", "--title-fg": "#fffaf0",
    "--body-bg": "rgba(255, 250, 242, 0.94)", "--ink": "#2a1712", "--rule": "rgba(251, 111, 95, 0.2)",
  }),
  tpl("denim-label", "label", {
    "--accent": "#1d4ed8", "--accent-2": "#facc15", "--title-bg": "#dbeafe", "--title-fg": "#172554",
    "--body-bg": "rgba(246, 250, 255, 0.95)", "--ink": "#111f3d", "--body-left": "145px", "--body-width": "720px",
    "--rule": "rgba(29, 78, 216, 0.16)",
  }),
  tpl("spruce-poster", "poster", {
    "--accent": "#166534", "--accent-2": "#f59e0b", "--title-bg": "#14532d", "--title-fg": "#f0fdf4",
    "--body-bg": "rgba(243, 252, 244, 0.94)", "--ink": "#102018", "--rule": "rgba(22, 101, 52, 0.18)",
  }),
  tpl("ruby-split", "split", {
    "--accent": "#991b1b", "--accent-2": "#38bdf8", "--title-bg": "#991b1b", "--title-fg": "#fff7ed",
    "--body-bg": "rgba(255, 247, 247, 0.95)", "--ink": "#281212", "--body-left": "265px", "--body-width": "675px",
    "--rule": "rgba(153, 27, 27, 0.16)",
  }),
  tpl("cyan-ledger", "ledger", {
    "--accent": "#06b6d4", "--accent-2": "#a855f7", "--title-bg": "#cffafe", "--title-fg": "#164e63",
    "--body-bg": "rgba(240, 253, 255, 0.95)", "--ink": "#10252b", "--rule": "rgba(6, 182, 212, 0.18)",
  }),
  tpl("mustard-note", "note", {
    "--accent": "#ca8a04", "--accent-2": "#0ea5e9", "--title-bg": "#ca8a04", "--title-fg": "#fffbeb",
    "--body-bg": "rgba(255, 252, 235, 0.96)", "--ink": "#241c0e", "--rule": "rgba(202, 138, 4, 0.18)",
  }),
  tpl("navy-ticket", "label", {
    "--accent": "#1e3a8a", "--accent-2": "#f97316", "--title-bg": "#1e3a8a", "--title-fg": "#eff6ff",
    "--body-bg": "rgba(248, 250, 252, 0.95)", "--ink": "#13203a", "--body-left": "155px", "--body-width": "710px",
    "--rule": "rgba(30, 58, 138, 0.16)",
  }),
  tpl("fresh-poster", "poster", {
    "--accent": "#16a34a", "--accent-2": "#ec4899", "--title-bg": "#dcfce7", "--title-fg": "#14532d",
    "--body-bg": "rgba(244, 253, 246, 0.94)", "--ink": "#102318", "--rule": "rgba(22, 163, 74, 0.18)",
  }),
  tpl("signal-split", "split", {
    "--accent": "#dc2626", "--accent-2": "#facc15", "--title-bg": "#facc15", "--title-fg": "#450a0a",
    "--body-bg": "rgba(255, 250, 245, 0.95)", "--ink": "#21100f", "--body-left": "285px", "--body-width": "650px",
    "--rule": "rgba(220, 38, 38, 0.16)",
  }),
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function pickLifehackTemplate(input: {
  deck?: string;
  profession?: string;
  title?: string;
  text?: string;
}): LifehackTemplate {
  const seed = `${input.deck ?? ""}|${input.profession ?? ""}|${input.title ?? ""}|${input.text ?? ""}`;
  return LIFEHACK_TEMPLATES[hash(seed) % LIFEHACK_TEMPLATES.length];
}

export function lifehackTemplateStyle(t: LifehackTemplate): string {
  return Object.entries(t.vars).map(([k, v]) => `${k}:${v}`).join(";");
}

import type { MapIdea } from "./planner.ts";
import type { CountryMeta, Metric, Observation } from "./sources.ts";
import { displayNumber } from "./narration.ts";

export const VIDEO_SECONDS = 180;
export const BANNER_SLOT = { left: 90, top: 1580, width: 900, height: 180 };
const palette = ["#ffbe55", "#36c9b0"];
export function countryName(meta: CountryMeta): string {
  if (meta.nameRu) return meta.nameRu.replace("Фарерские острова", "Фареры");
  if (meta.iso2 && /^[A-Z]{2}$/.test(meta.iso2)) {
    const name = new Intl.DisplayNames(["ru"], { type: "region" }).of(meta.iso2);
    if (name) return name.replace("Беларусь", "Белоруссия").replace("Киргизия", "Киргизстан").replace("Кыргызстан", "Киргизстан");
  }
  return meta.name;
}
export function buildMapTheme(template: any, meta: Record<string, CountryMeta>, values: Record<string, Observation>, metric: Metric, idea: MapIdea, id: string, mode: "binary" | "numeric" = "binary") {
  const theme = structuredClone(template);
  theme.id = id;
  theme.name = idea.title;
  const factor = VIDEO_SECONDS / template.duration;
  theme.duration = VIDEO_SECONDS;
  theme.stops = template.stops.map((s: any) => ({ ...s, time: s.time * factor }));
  theme.reveals = template.reveals.map((s: any) => ({ ...s, time: s.time * factor }));
  theme.chapters = template.chapters.map((s: any) => ({ ...s, start: s.start * factor, end: s.end * factor }));
  const measured = Object.values(values).filter(v => !v.estimated).map(v => v.value).sort((a, b) => a - b);
  if (!measured.length) throw new Error("Нет подтверждённых данных для вопроса.");
  const scale = metric.id === "population" ? 1_000_000 : ["gdp-person", "gdp-ppp"].includes(metric.id) ? 1000 : 1;
  const thresholdText = displayNumber(measured[Math.floor(measured.length / 2)], metric);
  const threshold = Number(thresholdText.replace(/\s/g, "").replace(",", ".")) * scale;
  if (!Number.isFinite(threshold)) throw new Error("Некорректная граница вопроса.");
  const unit = metric.unit === "%" ? "процентов" : metric.id === "population" ? "миллионов человек" :
    metric.id === "gdp-person" ? "тысяч долларов на человека" : metric.id === "gdp-ppp" ? "тысяч международных долларов на человека" :
    metric.unit === "чел./км²" ? "человек на квадратный километр" : metric.unit === "дет./жен." ? "ребёнка на женщину" :
    metric.unit === "на 1000 чел." ? "на тысячу человек" : metric.unit === "на 100 чел." ? "на сто человек" : metric.unit;
  idea.title = mode === "numeric" ? `Какой показатель «${metric.name}» (${unit})?` : `Показатель «${metric.name}» выше ${thresholdText} ${unit}?`;
  idea.hook = idea.title;
  theme.name = idea.title;
  theme.countryStyles = Object.fromEntries(Object.entries(values).map(([key, o]) => {
    const bin = o.value > threshold ? 1 : 0;
    const label = mode === "numeric" ? displayNumber(o.value, metric, o.estimated) : `${o.estimated ? "≈" : ""}${bin ? "ДА" : "НЕТ"}`;
    const color = mode === "numeric" ? palette[1] : palette[bin];
    return [key, { color, value: label, valueRu: label,
      category: `bin${bin}`, markerBg: "#ffffff", textColor: "#183941", borderColor: color }];
  }));
  theme.legend = mode === "numeric" ? [] : ["НЕТ", "ДА"].map((label, i) => ({ id: `bin${i}`, label, labelRu: label, color: palette[i] }));
  theme.winner = {
    showAt: VIDEO_SECONDS - 8,
    badge: { ru: "РЕЗУЛЬТАТЫ" },
    title: { ru: mode === "numeric" ? "ПОКАЗАТЕЛИ ПО СТРАНАМ" : "ОТВЕТЫ ПО СТРАНАМ" },
    caption: { ru: `Всемирный банк, ${metric.year}. ≈ — оценка.` },
    cta: { ru: "Какие страны сравнить дальше?" },
  };
  return theme;
}

function stamp(time: number) {
  const cs = Math.round(time * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
export function mapSubtitles(idea: MapIdea, metric: Metric, hookSeconds: number): string {
  hookSeconds = Math.max(1, hookSeconds);
  const safe = (s: string) => s.replace(/[{}\\\r\n%]/g, " ");
  const words = safe(idea.title).split(/\s+/);
  const lines: string[] = [""];
  for (const word of words) {
    if ((lines[lines.length - 1] + " " + word).trim().length > 25 && lines.length < 4) lines.push(word);
    else lines[lines.length - 1] = (lines[lines.length - 1] + " " + word).trim();
  }
  const end = stamp(VIDEO_SECONDS);
  const script = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Header,Lato Heavy,54,&H00FFFFFF,&H0000FFFF,&H00173A42,&H70000000,-1,0,0,0,100,100,0,0,1,4,2,8,60,60,65,1\nStyle: Hook,Lato Heavy,64,&H00FFFFFF,&H0000FFFF,&H000D2024,&HB0000000,-1,0,0,0,100,100,0,0,1,6,2,2,75,75,500,1\nStyle: Source,Lato Heavy,26,&H00FFFFFF,&H0000FFFF,&H00173A42,&H70000000,0,0,0,0,100,100,0,0,1,2,0,2,60,60,410,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,${end},Header,,0,0,0,,${lines.join("\\N")}\nDialogue: 0,0:00:00.00,${end},Source,,0,0,0,,Всемирный банк · ${metric.year} · ≈ оценка\n`;
  // ASS karaoke follows the measured speech interval; weights approximate word length.
  const hook = safe(idea.hook).split(/\s+/);
  const weight = hook.reduce((sum, w) => sum + w.length, 0);
  const tokens = hook.map(w => `{\\kf${Math.max(1, Math.round(hookSeconds * 100 * w.length / weight))}}${w}`).join(" ");
  return script + `Dialogue: 1,0:00:00.20,${stamp(hookSeconds + 0.45)},Hook,,0,0,0,,{\\fad(0,250)}${tokens}\n`;
}

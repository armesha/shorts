import type { Metric } from "./sources.ts";
import type { MapIdea } from "./planner.ts";

export function displayNumber(value: number, metric: Metric, estimated = false): string {
  const scale = metric.id === "population" ? 1_000_000 : ["gdp-person", "gdp-ppp"].includes(metric.id) ? 1000 : 1;
  const number = value / scale;
  return (estimated ? "≈" : "") + new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: number !== 0 && Math.abs(number) < 1 ? Math.min(6, Math.ceil(-Math.log10(Math.abs(number))) + 1) : Math.abs(number) < 100 ? 1 : 0,
    notation: "standard",
  }).format(number);
}

export function mapNarration(idea: MapIdea, _metric: Metric): string {
  return idea.title;
}

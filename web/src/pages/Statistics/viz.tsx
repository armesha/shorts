// Shared visual primitives for the Statistics page: sparklines, delta chips, rank badges,
// composition strips and the custom Recharts tooltip. Colours come from the --stx-* tokens
// (classic values in index.css, СЕЧЕНИЕ editorial values in styles/sechenie.css) so every
// chart follows the active skin instead of hardcoded Recharts colours.
import type { ReactNode } from "react";
import type { YoutubeBreakdownRow } from "../../lib/api";
import { fmt, labelValue } from "../../lib/statsFormat";

type T = (key: string, vars?: Record<string, string | number>) => string;

/* ---------------------------------------------------------------- Recharts tooltip content */

interface TipPayloadItem {
  name?: string | number;
  value?: number | string;
  color?: string;
  stroke?: string;
  dataKey?: string | number;
}

export function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: TipPayloadItem[];
  label?: string | number;
  format?: (value: number, dataKey?: string | number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="stx-tip">
      {label != null && label !== "" && <div className="stx-cap mb-1">{label}</div>}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="inline-block h-2 w-2 shrink-0"
                style={{ background: p.color || p.stroke || "var(--stx-series)" }}
                aria-hidden="true"
              />
              <span className="truncate text-base-content/70">{p.name}</span>
            </span>
            <span className="stx-num font-bold">
              {format ? format(Number(p.value), p.dataKey) : fmt(Number(p.value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------ Sparkline */

// Halftone bar sparkline: quiet bars, the peak bar in full series colour, negatives in red.
// Pure SVG (no Recharts) so it is cheap enough for KPI tiles and channel-card headers.
export function Sparkline({ values, height = 30, className = "" }: { values: number[]; height?: number; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const W = 100;
  const n = values.length;
  const step = W / n;
  const gap = Math.min(1.2, step * 0.22);
  const bw = Math.max(0.4, step - gap);
  const zeroY = (max / span) * height;
  const peak = values.indexOf(Math.max(...values));
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className={`block ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      {values.map((v, i) => {
        const h = Math.max(0.75, (Math.abs(v) / span) * height);
        const y = v >= 0 ? zeroY - h : zeroY;
        const cls = v < 0 ? "stx-spark-bar is-neg" : i === peak && v > 0 ? "stx-spark-bar is-max" : "stx-spark-bar";
        return <rect key={i} x={i * step + gap / 2} y={y} width={bw} height={h} className={cls} />;
      })}
    </svg>
  );
}

/* ----------------------------------------------------------------------------- Delta chip */

export function DeltaChip({ delta, t }: { delta: number | null; t: T }) {
  if (delta == null) return <span className="text-xs text-base-content/40">{t("stats.firstSnapshot")}</span>;
  if (delta === 0) return <span className="text-xs text-base-content/40">{t("stats.noChange")}</span>;
  const up = delta > 0;
  return (
    <span className={`stx-num inline-flex items-center gap-0.5 text-xs font-bold ${up ? "text-success" : "text-error"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {up ? "+" : "−"}
      {fmt(Math.abs(delta))}
    </span>
  );
}

/* ----------------------------------------------------------------------------- Rank badge */

// 1-based rank. Top-3 wear an ink square (rank 1 — the accent square), the rest plain numerals.
export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="stx-rank1 stx-num inline-grid h-5 w-5 shrink-0 place-items-center text-[11px] font-extrabold">
        1
      </span>
    );
  }
  if (rank <= 3) {
    return (
      <span className="stx-num inline-grid h-5 w-5 shrink-0 place-items-center bg-base-content text-[11px] font-extrabold text-base-100">
        {rank}
      </span>
    );
  }
  return <span className="stx-num inline-block w-5 shrink-0 text-center text-xs text-base-content/45">{rank}</span>;
}

/* ---------------------------------------------------------------------- Composition strip */

// Ink-halftone shares of the strip segments, by rank (darkest = biggest share).
const STRIP_MIX = [100, 74, 52, 34, 20, 12];

function stripColor(rank: number): string {
  const mix = STRIP_MIX[Math.min(rank, STRIP_MIX.length - 1)];
  return `color-mix(in srgb, var(--stx-strip-base) ${mix}%, var(--stx-strip-dilute))`;
}

// One 100% composition strip + a compact legend. Shows the top `cap` rows, folds the tail
// into «Прочие»; the full list stays reachable through a quiet <details> expander.
export function CompositionStrip({
  title,
  subtitle,
  rows,
  t,
  cap = 5,
}: {
  title: string;
  subtitle?: string;
  rows: YoutubeBreakdownRow[];
  t: T;
  cap?: number;
}) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => sum + r.views, 0) || 1;
  const head = rows.slice(0, cap);
  const tail = rows.slice(cap);
  const tailViews = tail.reduce((sum, r) => sum + r.views, 0);
  const segments: { key: string; label: string; views: number; color: string; muted?: boolean }[] = head.map((r, i) => ({
    key: r.key,
    label: labelValue(r.key),
    views: r.views,
    color: stripColor(i),
  }));
  if (tailViews > 0) {
    segments.push({ key: "__other", label: t("stats.otherRows"), views: tailViews, color: "var(--stx-strip-rest)", muted: true });
  }
  return (
    <div className="stx-panel p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && (
            <div className="truncate text-xs text-base-content/50" title={subtitle}>
              {subtitle}
            </div>
          )}
        </div>
        <div className="stx-cap shrink-0">{fmt(total)}</div>
      </div>
      <div className="flex h-3.5 w-full gap-[2px]" role="img" aria-label={title}>
        {segments.map((s) => (
          <div
            key={s.key}
            className="min-w-[3px]"
            style={{ width: `${Math.max(1, (s.views / total) * 100)}%`, background: s.color }}
            title={`${s.label} · ${fmt(s.views)} · ${Math.round((s.views / total) * 100)}%`}
          />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-y-1">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0" style={{ background: s.color }} aria-hidden="true" />
              <span className={`truncate ${s.muted ? "text-base-content/45" : "text-base-content/75"}`}>{s.label}</span>
            </span>
            <span className="stx-num shrink-0 font-semibold">
              {fmt(s.views)}
              <span className="ml-1.5 inline-block w-8 text-right text-base-content/40">
                {Math.round((s.views / total) * 100)}%
              </span>
            </span>
          </div>
        ))}
      </div>
      {tail.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none text-xs text-base-content/45 hover:text-base-content/70">
            {t("stats.showMore")} · {tail.length}
          </summary>
          <div className="mt-1.5 grid max-h-48 grid-cols-1 gap-y-1 overflow-auto pr-1">
            {tail.map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-base-content/60">{labelValue(r.key)}</span>
                <span className="stx-num shrink-0 font-semibold">
                  {fmt(r.views)}
                  <span className="ml-1.5 inline-block w-8 text-right text-base-content/40">
                    {Math.round((r.views / total) * 100)}%
                  </span>
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- Ledger strip */

// A slim "press ledger": a small source tag on top, then a symmetric grid of aligned
// value-over-caption cells (2×2 on narrow widths, one row of 4 from md up).
export function LedgerStrip({
  tag,
  items,
  trailing,
  className = "",
}: {
  tag: ReactNode;
  items: { label: string; value: ReactNode; hint?: string }[];
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card bg-base-100 border border-base-300 ${className}`}>
      <div className="card-body gap-2.5 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">{tag}</div>
          {trailing}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 md:grid-cols-4">
          {items.map((it) => (
            <div key={it.label} className="min-w-0" title={it.hint}>
              <div className="stx-num text-lg font-extrabold leading-tight">{it.value}</div>
              <div className="stx-cap leading-snug">{it.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// SQLite datetime('now') отдаёт "YYYY-MM-DD HH:MM:SS" в UTC без маркера зоны — нормализуем к
// парсибельному UTC (значения toISOString() уже с "T"/"Z" и проходят без изменений).
export function parseUtc(s: string): string {
  return s.includes("T") ? s : s.replace(" ", "T") + "Z";
}

// Локализованная дата-время (ru-RU → 24ч) из таймстампа БД: published_at (ISO) или created_at (UTC).
// Пусто/битое → «—».
export function formatDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(parseUtc(s));
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU");
}

export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const sign = n < 0 ? "-" : "";
  let value = Math.abs(n);
  const units = ["", "k", "m", "b", "t"];
  let unit = 0;

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }

  if (unit === 0) return `${sign}${Math.round(value).toLocaleString("ru-RU")}`;
  let decimals = value >= 100 || Number.isInteger(value) ? 0 : 1;
  let rounded = Number(value.toFixed(decimals));
  if (rounded >= 1000 && unit < units.length - 1) {
    value = rounded / 1000;
    unit += 1;
    decimals = value >= 100 || Number.isInteger(value) ? 0 : 1;
  }
  return `${sign}${value.toFixed(decimals).replace(/\.0$/, "")}${units[unit]}`;
}

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const DATA_YEAR = 2023;
export const SOURCE_LICENSE = "https://creativecommons.org/licenses/by/4.0/";
export const METRICS = [
  ["internet", "IT.NET.USER.ZS", "Пользователи интернета", "%"],
  ["urban", "SP.URB.TOTL.IN.ZS", "Городское население", "%"],
  ["electricity", "EG.ELC.ACCS.ZS", "Доступ к электричеству", "%"],
  ["forest", "AG.LND.FRST.ZS", "Леса на территории страны", "%"],
  ["density", "EN.POP.DNST", "Плотность населения", "чел./км²"],
  ["population", "SP.POP.TOTL", "Численность населения", "чел."],
  ["growth", "SP.POP.GROW", "Изменение населения за год", "%"],
  ["fertility", "SP.DYN.TFRT.IN", "Детей на одну женщину", ""],
  ["births", "SP.DYN.CBRT.IN", "Рождений на тысячу жителей", ""],
  ["life", "SP.DYN.LE00.IN", "Продолжительность жизни", "лет"],
  ["life-women", "SP.DYN.LE00.FE.IN", "Продолжительность жизни женщин", "лет"],
  ["life-men", "SP.DYN.LE00.MA.IN", "Продолжительность жизни мужчин", "лет"],
  ["young", "SP.POP.0014.TO.ZS", "Население младше 15 лет", "%"],
  ["older", "SP.POP.65UP.TO.ZS", "Население старше 65 лет", "%"],
  ["working-age", "SP.POP.1564.TO.ZS", "Население от 15 до 64 лет", "%"],
  ["women", "SP.POP.TOTL.FE.ZS", "Женщины среди населения", "%"],
  ["mobile", "IT.CEL.SETS.P2", "Мобильные подписки на 100 жителей", ""],
  ["broadband", "IT.NET.BBND.P2", "Проводной интернет на 100 жителей", ""],
  ["gdp-person", "NY.GDP.PCAP.CD", "ВВП на душу населения", "$"],
  ["gdp-ppp", "NY.GDP.PCAP.PP.CD", "ВВП на душу по ППС", "межд. $"],
  ["gdp-growth", "NY.GDP.MKTP.KD.ZG", "Рост экономики за год", "%"],
  ["agriculture", "NV.AGR.TOTL.ZS", "Сельское хозяйство в ВВП", "%"],
  ["industry", "NV.IND.TOTL.ZS", "Промышленность в ВВП", "%"],
  ["services", "NV.SRV.TOTL.ZS", "Услуги в экономике", "%"],
  ["unemployment", "SL.UEM.TOTL.ZS", "Безработица", "%"],
  ["youth-unemployment", "SL.UEM.1524.ZS", "Безработица среди молодёжи", "%"],
  ["agri-jobs", "SL.AGR.EMPL.ZS", "Занятость в сельском хозяйстве", "%"],
  ["industry-jobs", "SL.IND.EMPL.ZS", "Занятость в промышленности", "%"],
  ["service-jobs", "SL.SRV.EMPL.ZS", "Занятость в сфере услуг", "%"],
  ["labor", "SL.TLF.CACT.ZS", "Участие в рабочей силе", "%"],
  ["women-labor", "SL.TLF.CACT.FE.ZS", "Участие женщин в рабочей силе", "%"],
  ["arable", "AG.LND.ARBL.ZS", "Пахотные земли", "%"],
  ["farm-land", "AG.LND.AGRI.ZS", "Сельскохозяйственные земли", "%"],
  ["exports", "NE.EXP.GNFS.ZS", "Экспорт относительно ВВП", "%"],
  ["imports", "NE.IMP.GNFS.ZS", "Импорт относительно ВВП", "%"],
  ["trade", "NE.TRD.GNFS.ZS", "Торговля относительно ВВП", "%"],
  ["inflation", "FP.CPI.TOTL.ZG", "Изменение потребительских цен", "%"],
  ["military-spend", "MS.MIL.XPND.GD.ZS", "Военные расходы в ВВП", "%"],
].map(([id, indicator, name, unit]) => ({ id, indicator, name, unit, year: DATA_YEAR }));
export type Metric = (typeof METRICS)[number];
export type CountryMeta = { name: string; nameRu?: string; iso2?: string; iso3?: string; continent: string; center: [number, number] };
export type Observation = { value: number; year: number; iso3: string; estimated: boolean; donors?: string[]; method?: string };

async function jsonFrom(url: string, signal?: AbortSignal): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.any([AbortSignal.timeout(45_000), ...(signal ? [signal] : [])]) });
      if (!response.ok) throw new Error(`Источник данных недоступен: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (signal?.aborted || attempt === 1) throw error;
      await delay(1000, undefined, { signal });
    }
  }
  throw new Error("Источник данных недоступен.");
}

export async function fetchMetric(metric: Metric, directory: string, signal?: AbortSignal) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${metric.indicator}?source=2&format=json&date=${metric.year}&per_page=400`;
  const payload = await jsonFrom(url, signal);
  if (!Array.isArray(payload?.[1]) || payload[0].pages !== 1) throw new Error("Неполный ответ источника данных.");
  const byIso3 = Object.fromEntries(payload[1].filter((r: any) =>
    typeof r.countryiso3code === "string" && Number.isFinite(r.value) && String(r.date) === String(metric.year),
  ).map((r: any) => [r.countryiso3code, r.value as number]));
  const snapshot = { metric, url, license: SOURCE_LICENSE, licenseEvidence: "https://datacatalog.worldbank.org/public-licenses", fetchedAt: new Date().toISOString(), byIso3 };
  await writeFile(resolve(directory, "source.json"), JSON.stringify({ ...snapshot, response: payload }, null, 2));
  return snapshot;
}

export function mapObservations(ids: string[], meta: Record<string, CountryMeta>, values: Record<string, number>, year: number) {
  const observations: Record<string, Observation> = {};
  for (const id of ids) {
    const iso3 = meta[id]?.iso3;
    if (iso3 && Number.isFinite(values[iso3])) observations[id] = { value: values[iso3], year, iso3, estimated: false };
  }
  if (Object.keys(observations).length < 100) throw new Error("Для этой темы недостаточно подтверждённых стран: нужно минимум 100.");
  const measured = Object.entries(observations);
  for (const id of ids) {
    if (observations[id]) continue;
    const country = meta[id];
    if (!country?.center || !country.continent) throw new Error("Для страны отсутствуют географические метаданные.");
    const distance = (other: CountryMeta) => {
      const dx = Math.min(Math.abs(country.center[0] - other.center[0]), 360 - Math.abs(country.center[0] - other.center[0]));
      return (dx * Math.cos(country.center[1] * Math.PI / 180)) ** 2 + (country.center[1] - other.center[1]) ** 2;
    };
    const donors = measured.filter(([key]) => meta[key]?.continent === country.continent)
      .sort(([a], [b]) => distance(meta[a]) - distance(meta[b])).slice(0, 3);
    if (!donors.length) throw new Error("Нельзя рассчитать прозрачную региональную оценку.");
    const numbers = donors.map(([, observation]) => observation.value).sort((a, b) => a - b);
    observations[id] = { value: numbers[Math.floor(numbers.length / 2)], year, iso3: country.iso3 || id,
      estimated: true, donors: donors.map(([key]) => key), method: "median of up to three nearest measured countries in the same continent" };
  }
  return observations;
}

export async function loadMapInputs(source: string) {
  const template = JSON.parse(await readFile(resolve(source, "public/data/themes/life-expectancy-ru.json"), "utf8"));
  const meta = JSON.parse(await readFile(resolve(source, "public/data/country-meta.json"), "utf8")).byId as Record<string, CountryMeta>;
  const { supplementalIslandFeatures } = await import(pathToFileURL(resolve(source, "src/island-labels.js")).href);
  for (const feature of supplementalIslandFeatures) {
    meta[feature.id] ??= feature.properties.metadata;
    meta[feature.id].iso3 ||= ({ "312": "GLP", "474": "MTQ", "638": "REU", "798": "TUV" } as Record<string, string>)[feature.id];
  }
  return { template, meta };
}

import { useEffect, useMemo, useState } from "react";
import { apiClient, type AnecdoteTemplateExampleItem, type AnecdoteTemplateExamplesResponse } from "../lib/api";
import { AppIcon } from "../components/AppIcon";

type FamilyFilter = "all" | AnecdoteTemplateExampleItem["family"];

const FAMILY_LABEL: Record<AnecdoteTemplateExampleItem["family"], string> = {
  "joke-animated": "GIF",
  "joke-pop": "Pop",
  "russian-bg": "RU сцены",
  "custom-pack": "Паки",
};
const PAGE_SIZE = 20;

export default function Examples() {
  const [data, setData] = useState<AnecdoteTemplateExamplesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<FamilyFilter>("all");
  const [lang, setLang] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.anecdoteTemplateExamples();
      setData(response);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить шаблоны");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, family, lang]);

  const items = data?.items ?? [];
  const familyCounts = useMemo(() => {
    const counts: Record<AnecdoteTemplateExampleItem["family"], number> = { "joke-animated": 0, "joke-pop": 0, "russian-bg": 0, "custom-pack": 0 };
    for (const item of items) counts[item.family] += 1;
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (family !== "all" && item.family !== family) return false;
      if (lang !== "all" && !item.languageCodes.includes(lang)) return false;
      if (!q) return true;
      return [
        item.no,
        item.key,
        item.title,
        item.subtitle,
        item.templateName,
        item.sampleTitle,
        item.sampleText,
        item.sourceDecks.join(" "),
        item.languageCodes.join(" "),
        item.accounts.map((account) => account.channelName).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, query, family, lang]);

  const pageSize = PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedItems = items.filter((item) => selected.has(item.key));
  const selectedOnPage = pageItems.filter((item) => selected.has(item.key)).length;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectItems(nextItems: AnecdoteTemplateExampleItem[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const item of nextItems) next.add(item.key);
      return next;
    });
  }

  async function copySelected() {
    const text = selectedItems.map((item) => `${item.no} | ${item.key} | ${item.title}`).join("\n");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="space-y-5 pb-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-normal">Шаблоны анекдотов armen</h1>
          {data && (
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-base-content/60">
              <span>{data.total} шаблона</span>
              <span>{data.accountCount} канала</span>
              <span>{data.sourceDecks.join(", ")}</span>
            </div>
          )}
        </div>
        <button className={`btn btn-sm gap-2 ${loading ? "loading" : ""}`} onClick={() => void load()}>
          <AppIcon name="refresh" size={15} />
          Обновить
        </button>
      </header>

      {error && (
        <div className="alert alert-error">
          <AppIcon name="warning" size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Всего" value={data?.total ?? (loading ? "..." : 0)} />
        <Metric label="GIF" value={familyCounts["joke-animated"]} />
        <Metric label="Pop" value={familyCounts["joke-pop"]} />
        <Metric label="RU сцены" value={familyCounts["russian-bg"]} />
        <Metric label="Паки" value={familyCounts["custom-pack"]} />
      </section>

      <section className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_160px_160px] xl:w-[640px]">
          <label className="input input-bordered input-sm flex items-center gap-2">
            <AppIcon name="search" size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="grow" placeholder="Поиск" />
          </label>
          <select className="select select-bordered select-sm" value={family} onChange={(e) => setFamily(e.target.value as FamilyFilter)}>
            <option value="all">Все типы</option>
            <option value="joke-animated">GIF</option>
            <option value="joke-pop">Pop</option>
            <option value="russian-bg">RU сцены</option>
            <option value="custom-pack">Паки</option>
          </select>
          <select className="select select-bordered select-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="all">Все языки</option>
            {data?.languageCodes.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm btn-ghost border border-base-300 gap-2" onClick={() => selectItems(pageItems)} disabled={!pageItems.length}>
            <AppIcon name="check" size={15} />
            Страница
          </button>
          <button className="btn btn-sm btn-ghost border border-base-300 gap-2" onClick={() => selectItems(filtered)} disabled={!filtered.length}>
            <AppIcon name="check" size={15} />
            Все в фильтре
          </button>
          <button className="btn btn-sm btn-ghost border border-base-300 gap-2" onClick={() => setSelected(new Set())} disabled={!selected.size}>
            <AppIcon name="close" size={15} />
            Снять
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-base-content/60">
        <span>
          Найдено {filtered.length}; выбрано {selected.size}
          {pageItems.length ? `; на странице ${selectedOnPage}/${pageItems.length}` : ""}
        </span>
        <Pagination page={safePage} totalPages={totalPages} setPage={setPage} />
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-20 text-base-content/50">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : pageItems.length ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {pageItems.map((item) => (
            <TemplateCard key={item.key} item={item} selected={selected.has(item.key)} toggle={() => toggle(item.key)} />
          ))}
        </section>
      ) : (
        <div className="rounded-lg border border-base-300 bg-base-100 p-8 text-center text-base-content/55">Нет шаблонов под фильтр</div>
      )}

      <Pagination page={safePage} totalPages={totalPages} setPage={setPage} alignEnd />

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[1320px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold">
            Выбрано: <span className="text-primary">{selected.size}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm btn-primary gap-2" disabled={!selected.size} onClick={() => void copySelected()}>
              <AppIcon name={copied ? "check" : "copy"} size={15} />
              {copied ? "Скопировано" : "Копировать выбранные"}
            </button>
            <button className="btn btn-sm btn-ghost border border-base-300" disabled={!selected.size} onClick={() => setSelected(new Set())}>
              Очистить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-4">
      <div className="text-sm text-base-content/55">{label}</div>
      <div className="mt-1 text-3xl font-black">{value}</div>
    </div>
  );
}

function TemplateCard({ item, selected, toggle }: { item: AnecdoteTemplateExampleItem; selected: boolean; toggle: () => void }) {
  const accountsTitle = item.accounts.map((account) => `${account.id}: ${account.channelName}`).join("\n");
  return (
    <article className={`overflow-hidden rounded-lg border bg-base-100 shadow-sm ${selected ? "border-primary ring-2 ring-primary/40" : "border-base-300"}`}>
      <label className="block cursor-pointer">
        <div className="relative aspect-[9/16] bg-base-200">
          {item.mediaType === "video" && item.videoReady && item.videoUrl ? (
            <video src={item.videoUrl} poster={item.imageReady ? item.imageUrl : undefined} autoPlay loop muted playsInline className="h-full w-full object-cover" />
          ) : item.imageReady ? (
            <img src={item.imageUrl} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-base-content/50">Превью не готово</div>
          )}
          <span className="absolute left-2 top-2 rounded-md bg-base-100/95 px-2 py-1 text-sm font-black shadow">{item.no}</span>
          <input
            type="checkbox"
            className="checkbox checkbox-primary absolute right-2 top-2 bg-base-100"
            checked={selected}
            onChange={toggle}
            aria-label={`Выбрать ${item.no}`}
          />
        </div>
      </label>
      <div className="space-y-3 p-4">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="min-w-0 text-base font-bold leading-snug">{item.title}</h2>
            <span className="badge badge-ghost badge-sm shrink-0">{FAMILY_LABEL[item.family]}</span>
          </div>
          <div className="mt-1 text-xs text-base-content/55">{item.templateName}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {item.languageCodes.map((code) => (
            <span key={code} className="badge badge-outline badge-sm">
              {code.toUpperCase()}
            </span>
          ))}
          <span className="badge badge-ghost badge-sm" title={accountsTitle}>
            {item.accountCount} каналов
          </span>
        </div>
        <div className="rounded-md bg-base-200 p-3 text-xs leading-relaxed">
          <div className="font-semibold">{item.sampleTitle}</div>
          <div className="mt-1 max-h-20 overflow-hidden whitespace-pre-wrap text-base-content/70">{item.sampleText}</div>
        </div>
        <div className="truncate text-xs text-base-content/45" title={item.key}>
          {item.key}
        </div>
      </div>
    </article>
  );
}

function Pagination({
  page,
  totalPages,
  setPage,
  alignEnd = false,
}: {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
  alignEnd?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={`join ${alignEnd ? "flex justify-end" : ""}`}>
      <button className="btn btn-sm join-item" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        <AppIcon name="chevron-left" size={15} />
      </button>
      <span className="btn btn-sm join-item pointer-events-none">
        {page} / {totalPages}
      </span>
      <button className="btn btn-sm join-item" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
        <AppIcon name="chevron-right" size={15} />
      </button>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { Rocket } from "lucide-react";
import { apiClient } from "../lib/api";

type Category = { name: string; items: string[] };
type Release = { heading: string; unreleased: boolean; categories: Category[] };

// Color per "Keep a Changelog" section so the eye can scan added/changed/fixed at a glance.
const CAT_BADGE: Record<string, string> = {
  Добавлено: "badge-success",
  Изменено: "badge-info",
  Исправлено: "badge-warning",
  Убрано: "badge-error",
  Удалено: "badge-error",
  Безопасность: "badge-error",
  Устарело: "badge-neutral",
};
const catBadge = (name: string) => CAT_BADGE[name] ?? "badge-neutral";

// Strip the version brackets: "[Unreleased] — 2026-06-13" → "Unreleased — 2026-06-13".
const cleanHeading = (h: string) => h.replace(/^\[(.+?)\]/, "$1").trim();

function parseChangelog(raw: string): Release[] {
  const releases: Release[] = [];
  let rel: Release | null = null;
  let cat: Category | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trimEnd();

    const mRel = line.match(/^##\s+(?!#)(.*)$/); // "## [version] — date" (but not "### …")
    const mCat = line.match(/^###\s+(.*)$/); // "### Добавлено"
    const mItem = line.match(/^\s*-\s+(.*)$/); // "- item"

    if (line.match(/^#\s+/)) continue; // skip the top-level "# Changelog"
    if (mCat) {
      if (!rel) {
        rel = { heading: "", unreleased: false, categories: [] };
        releases.push(rel);
      }
      cat = { name: mCat[1].trim(), items: [] };
      rel.categories.push(cat);
    } else if (mRel) {
      const heading = cleanHeading(mRel[1]);
      rel = { heading, unreleased: /unreleased/i.test(heading), categories: [] };
      releases.push(rel);
      cat = null;
    } else if (mItem) {
      if (!rel) {
        rel = { heading: "", unreleased: false, categories: [] };
        releases.push(rel);
      }
      if (!cat) {
        cat = { name: "", items: [] };
        rel.categories.push(cat);
      }
      cat.items.push(mItem[1].trim());
    } else {
      // Wrapped continuation of the previous bullet — re-join into one item.
      const text = line.trim();
      if (text && cat && cat.items.length) cat.items[cat.items.length - 1] += " " + text;
    }
  }
  return releases;
}

// Minimal inline markdown the changelog uses: **bold**, `code`, [text](url). Trusted content.
function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([\s\S]+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${key}-b${i}`} className="font-semibold text-base-content">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(
        <code
          key={`${key}-c${i}`}
          className="px-1 py-0.5 rounded bg-base-200 font-mono text-[0.82em] text-base-content/80"
        >
          {m[2]}
        </code>,
      );
    } else {
      nodes.push(
        <a
          key={`${key}-a${i}`}
          href={m[4]}
          target="_blank"
          rel="noreferrer"
          className="link link-primary"
        >
          {m[3]}
        </a>,
      );
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export default function Changelog() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .changelog()
      .then((r) => setReleases(parseChangelog(r.raw)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="text-primary" size={24} />
          Обновления
        </h1>
        <p className="text-base-content/60">Последние изменения проекта</p>
      </header>

      {loading ? (
        <div className="grid place-items-center py-16">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : releases.length === 0 ? (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body text-center text-base-content/50 py-12">
            Список изменений пока пуст
          </div>
        </div>
      ) : (
        releases.map((rel, ri) => (
          <div key={ri} className="card bg-base-100 border border-base-300">
            <div className="card-body gap-5">
              <div className="flex items-center gap-3 flex-wrap border-b border-base-300 pb-3">
                <h2 className="text-lg font-bold">{rel.heading || "Изменения"}</h2>
                {rel.unreleased && <span className="badge badge-primary badge-sm">текущая</span>}
              </div>

              {rel.categories.map((cat, ci) => (
                <div key={ci} className="space-y-2">
                  {cat.name && (
                    <span className={`badge badge-sm ${catBadge(cat.name)}`}>{cat.name}</span>
                  )}
                  <ul className="space-y-1.5">
                    {cat.items.map((it, ii) => (
                      <li key={ii} className="flex gap-2 text-sm leading-relaxed">
                        <span className="text-base-content/30 select-none mt-0.5">•</span>
                        <span className="text-base-content/80">{inline(it, `${ri}-${ci}-${ii}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

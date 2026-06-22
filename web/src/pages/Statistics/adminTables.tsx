import { Bug } from "lucide-react";
import { Link } from "react-router-dom";
import type { AdminAnalytics as AdminAnalyticsData } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { fmt, formatSeconds } from "../../lib/statsFormat";
import { formatWatchMinutes } from "./adminCharts";

type T = (key: string, vars?: Record<string, string | number>) => string;

export function TopChannels({ rows }: { rows: AdminAnalyticsData["topChannels"] }) {
  const { t } = useT();
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">{t("analytics.topChannels")}</div>
        {rows.length === 0 ? (
          <Empty text={t("analytics.noPublicationsPeriod")} compact />
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.accountId} className="rounded-lg bg-base-200/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                        {r.channelName}
                      </Link>
                      {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold leading-none">{fmt(r.published)}</div>
                      <div className="text-xs text-base-content/50">{t("analytics.colPublished")}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-base-content/50">{t("analytics.colQueue")}</div>
                      <div className="font-medium">{fmt(r.queued)}</div>
                      <div className="text-xs text-base-content/50">{runwayText(r.runwayDays, t)}</div>
                    </div>
                    <div>
                      <div className="text-base-content/50">{t("analytics.colViews")}</div>
                      <div className="font-medium">{fmt(r.views)}</div>
                      <div className="text-xs text-base-content/50">
                        {formatWatchMinutes(r.watchMinutes)} · {formatSeconds(r.avgViewDuration)}
                      </div>
                      {(r.scheduled > 0 || r.failed > 0) && (
                        <div className="text-xs text-base-content/50">
                          {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("analytics.colChannel")}</th>
                    <th>{t("analytics.colPublished")}</th>
                    <th>{t("analytics.colQueue")}</th>
                    <th>{t("analytics.colViews")}</th>
                    <th>{t("analytics.colWatchTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.accountId}>
                      <td>
                        <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                          {r.channelName}
                        </Link>
                        {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                      </td>
                      <td>
                        <span className="font-semibold">{fmt(r.published)}</span>
                        {(r.scheduled > 0 || r.failed > 0) && (
                          <div className="text-xs text-base-content/50">
                            {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                          </div>
                        )}
                      </td>
                      <td>
                        {fmt(r.queued)}
                        <div className="text-xs text-base-content/50">{runwayText(r.runwayDays, t)}</div>
                      </td>
                      <td>{fmt(r.views)}</td>
                      <td>
                        {formatWatchMinutes(r.watchMinutes)}
                        <div className="text-xs text-base-content/50">{formatSeconds(r.avgViewDuration)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function Runway({ rows }: { rows: AdminAnalyticsData["runway"] }) {
  const { t } = useT();
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">{t("analytics.runwayTitle")}</div>
        {rows.length === 0 ? (
          <Empty text={t("analytics.noChannels")} compact />
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.accountId} className="rounded-lg bg-base-200/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                        {r.channelName}
                      </Link>
                      {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                    </div>
                    <span className={`badge badge-sm ${runwayClass(r.runwayDays)}`}>{runwayText(r.runwayDays, t)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-base-content/50">{t("analytics.colQueue")}</div>
                      <div className="font-medium">{fmt(r.queued)}</div>
                    </div>
                    <div>
                      <div className="text-base-content/50">{t("analytics.colPostsPerDay")}</div>
                      <div className="font-medium">{fmt(r.postsPerDay)}</div>
                    </div>
                  </div>
                  {!r.connected && <div className="text-xs text-warning mt-2">{t("analytics.notConnected")}</div>}
                  {!r.enabled && <div className="text-xs text-base-content/50 mt-1">{t("analytics.disabledChannel")}</div>}
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("analytics.colChannel")}</th>
                    <th>{t("analytics.colQueue")}</th>
                    <th>{t("analytics.colPostsPerDay")}</th>
                    <th>{t("analytics.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.accountId}>
                      <td>
                        <Link to={`/accounts/${r.accountId}`} className="link link-hover font-medium">
                          {r.channelName}
                        </Link>
                        {r.ownerUsername && <div className="text-xs text-base-content/50">@{r.ownerUsername}</div>}
                      </td>
                      <td>{fmt(r.queued)}</td>
                      <td>{fmt(r.postsPerDay)}</td>
                      <td>
                      <span className={`badge badge-sm ${runwayClass(r.runwayDays)}`}>{runwayText(r.runwayDays, t)}</span>
                      {!r.connected && <div className="text-xs text-warning mt-1">{t("analytics.notConnected")}</div>}
                      {!r.enabled && <div className="text-xs text-base-content/50 mt-1">{t("analytics.disabledChannel")}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function TopUsers({ rows }: { rows: AdminAnalyticsData["topUsers"] }) {
  const { t } = useT();
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="font-semibold">{t("analytics.usersTitle")}</div>
        {rows.length === 0 ? (
          <Empty text={t("analytics.noActivityPeriod")} compact />
        ) : (
          <>
            <div className="sm:hidden space-y-3">
              {rows.map((r) => (
                <div key={r.userId} className="rounded-lg bg-base-200/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium">@{r.username}</div>
                    <div className="text-right">
                      <div className="text-lg font-bold leading-none">{fmt(r.published)}</div>
                      <div className="text-xs text-base-content/50">{t("analytics.colPublished")}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <div className="text-base-content/50">{t("analytics.colChannels")}</div>
                      <div className="font-medium">{fmt(r.channels)}</div>
                    </div>
                    <div>
                      <div className="text-base-content/50">{t("analytics.colQueue")}</div>
                      <div className="font-medium">{fmt(r.queued)}</div>
                      <div className="text-xs text-base-content/50">{t("analytics.postsPerDayUnit", { n: fmt(r.postsPerDay) })}</div>
                    </div>
                  </div>
                  {(r.scheduled > 0 || r.failed > 0) && (
                    <div className="text-xs text-base-content/50 mt-2">
                      {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>{t("analytics.colUser")}</th>
                    <th>{t("analytics.colPublished")}</th>
                    <th>{t("analytics.colChannels")}</th>
                    <th>{t("analytics.colQueue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId}>
                      <td className="font-medium">@{r.username}</td>
                      <td>
                        {fmt(r.published)}
                      {(r.scheduled > 0 || r.failed > 0) && (
                        <div className="text-xs text-base-content/50">
                          {t("analytics.schedFailShort", { sched: fmt(r.scheduled), failed: fmt(r.failed) })}
                        </div>
                      )}
                      </td>
                      <td>{fmt(r.channels)}</td>
                      <td>
                        {fmt(r.queued)}
                        <div className="text-xs text-base-content/50">{t("analytics.postsPerDayUnit", { n: fmt(r.postsPerDay) })}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function Problems({
  failures,
  recentErrors,
}: {
  failures: AdminAnalyticsData["failures"];
  recentErrors: AdminAnalyticsData["recentErrors"];
}) {
  const { t } = useT();
  const empty = failures.length === 0 && recentErrors.length === 0;
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <Bug size={18} className={empty ? "text-success" : "text-error"} />
          {t("analytics.problemsTitle")}
        </div>
        {empty ? (
          <Empty text={t("analytics.noErrorsPeriod")} compact />
        ) : (
          <div className="space-y-4">
            {failures.length > 0 && (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>{t("analytics.colPublication")}</th>
                      <th>{t("analytics.colChannel")}</th>
                      <th>{t("analytics.colError")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failures.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <div className="font-medium">{f.title}</div>
                          <div className="text-xs text-base-content/50">{formatDateTime(f.publishedAt || f.createdAt)}</div>
                        </td>
                        <td>{f.channelName}</td>
                        <td className="max-w-[18rem] whitespace-pre-wrap break-words text-error/80">
                          {f.error || t("analytics.noDescription")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {recentErrors.length > 0 && (
              <div className="space-y-2">
                {recentErrors.map((e) => (
                  <div key={e.id} className="rounded-lg bg-base-200/70 p-3 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`badge badge-xs ${e.level === "error" ? "badge-error" : "badge-warning"}`}>
                        {e.source}
                      </span>
                      <span className="text-xs text-base-content/50">{formatDateTime(e.createdAt)}</span>
                    </div>
                    <div className="font-medium mt-1 break-words">{e.message}</div>
                    {e.context && <div className="text-xs text-base-content/50 mt-1 break-words">{e.context}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function Empty({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div className={`text-center text-base-content/50 ${compact ? "py-6" : "py-12"}`}>
      {text}
    </div>
  );
}

function runwayText(days: number | null, t: T): string {
  if (days == null) return t("analytics.runwayNone");
  if (days === 0) return t("analytics.runwayZero");
  if (days < 1) return t("analytics.runwayLessDay");
  return t("analytics.runwayDays", { n: days.toFixed(days < 10 ? 1 : 0) });
}

function runwayClass(days: number | null): string {
  if (days == null) return "badge-ghost";
  if (days < 1) return "badge-error";
  if (days < 3) return "badge-warning";
  return "badge-success";
}

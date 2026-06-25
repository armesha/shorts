import type { Dispatch, SetStateAction } from "react";
import { RefreshCw } from "lucide-react";
import type { Account, OAuthClient } from "../../lib/api";
import type { useT } from "../../lib/i18n";
import { formatDateTime } from "../../lib/format";
import { AppIcon } from "../../components/AppIcon";
import { BrandIcon } from "../../components/BrandIcon";

type TFn = ReturnType<typeof useT>["t"];

type YouTubeConnectionCardProps = {
  account: Account;
  clients: OAuthClient[];
  boundClient: OAuthClient | null;
  keyChoices: OAuthClient[] | null;
  justConnected: boolean;
  startConnect: () => void | Promise<void>;
  connect: (clientId?: number) => void | Promise<void>;
  setKeyChoices: Dispatch<SetStateAction<OAuthClient[] | null>>;
  t: TFn;
};

export default function YouTubeConnectionCard({
  account,
  clients,
  boundClient,
  keyChoices,
  justConnected,
  startConnect,
  connect,
  setKeyChoices,
  t,
}: YouTubeConnectionCardProps) {
  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body">
        <h2 className="card-title text-base">{t("account.youtubeConnection")}</h2>
        {account.authError && (
          <div className="alert alert-error text-sm items-start py-2.5">
            <AppIcon name="warning" size={16} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">{t("account.authErrorTitle")}</div>
              <div className="opacity-90">{account.authError}</div>
              {account.authFailedAt && (
                <div className="text-xs opacity-70 mt-0.5">
                  {t("account.authErrorSince", { time: formatDateTime(account.authFailedAt) })}
                </div>
              )}
              <button className="btn btn-sm btn-neutral mt-2 gap-1" onClick={startConnect}>
                <RefreshCw size={14} /> {t("account.reconnect")}
              </button>
            </div>
          </div>
        )}
        {account.ytChannelTitle ? (
          <>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              {account.authError ? (
                <span className="badge badge-error gap-1">
                  <AppIcon name="warning" size={12} /> {t("account.reconnectBadge")}
                </span>
              ) : (
                <span className="badge badge-success">{t("account.connected")}</span>
              )}
              <span>
                {t("account.channelColon")} <b>{account.ytChannelTitle}</b>
              </span>
              {account.ytChannelId && (
                <a
                  href={`https://www.youtube.com/channel/${account.ytChannelId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link link-primary inline-flex items-center gap-1"
                >
                  <BrandIcon name="youtube" size={14} />
                  {t("account.openOnYouTube")}
                  <AppIcon name="external" size={13} />
                </a>
              )}
              <button className="btn btn-ghost btn-xs gap-1" onClick={startConnect} title={t("account.reconnectTitle")}>
                <RefreshCw size={13} /> {t("account.reconnect")}
              </button>
            </div>
            {clients.length > 1 && boundClient && (
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-base-content/60 flex-wrap">
                <BrandIcon name="youtube" size={12} />
                <span>{t("account.connectedViaKey")}:</span>
                <b className="truncate max-w-[14rem]">{boundClient.label}</b>
                {boundClient.projectId && <span className="text-base-content/45 truncate">· {boundClient.projectId}</span>}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-base-content/60">{t("account.connectIntro")}</p>
            {justConnected && <p className="text-success text-sm">{t("account.connectedRefresh")}</p>}
            <div>
              <button className="btn btn-primary btn-sm" onClick={startConnect}>
                {t("account.connectChannel")}
              </button>
            </div>
          </>
        )}

        {keyChoices && (
          <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="text-sm font-medium">{t("account.chooseKey")}</div>
            <div className="flex flex-col gap-1.5">
              {keyChoices.map((k) => (
                <button key={k.id} className="btn btn-sm btn-outline justify-start gap-2 normal-case" onClick={() => connect(k.id)}>
                  <BrandIcon name="youtube" size={14} />
                  <span className="truncate">{k.label}</span>
                  {k.projectId && <span className="text-xs text-base-content/50 truncate">· {k.projectId}</span>}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => setKeyChoices(null)}>
              {t("common.cancel")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

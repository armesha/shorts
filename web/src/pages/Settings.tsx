import { useEffect, useState, type ChangeEvent } from "react";
import {
  KeyRound,
  Check,
  AlertTriangle,
  Trash2,
  Lock,
  Send,
  Copy,
  Plus,
  Pencil,
  Link2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiClient, ApiError, type OAuthClient, type OAuthClientsResponse } from "../lib/api";
import TelegramConnect from "../components/TelegramConnect";
import { confirmDialog } from "../lib/confirm";
import { AppIcon } from "../components/AppIcon";
import { DEFAULT_DESIGN, DESIGNS, getSavedDesign, saveDesign, type DesignId } from "../lib/design";
import { useSkin } from "../lib/skin";
import { useT } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import {
  ADMIN_NAV_GROUPS,
  canSeeNav,
  navKeyFor,
  readHiddenNavKeys,
  readPinnedNavKeys,
  writeHiddenNavKeys,
  writePinnedNavKeys,
} from "../components/layout/navConfig";

export default function Settings() {
  const { t } = useT();

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-base-content/60">{t("settings.subtitle")}</p>
      </header>

      <SkinSettings />

      <DesignSettings />

      <FavoriteNavSettings />

      <GoogleKeysManager />

      <TelegramLink />

      <ChangePassword />
    </div>
  );
}

function FavoriteNavSettings() {
  const { t } = useT();
  const { user } = useAuth();
  const [pinnedKeys, setPinnedKeys] = useState<string[]>(readPinnedNavKeys);
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(readHiddenNavKeys);
  const [hasClipDemos, setHasClipDemos] = useState(user?.role === "admin");

  useEffect(() => {
    if (user?.role === "admin") {
      setHasClipDemos(true);
      return;
    }
    let alive = true;
    fetch("/api/clip-demos/packs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((d) => {
        if (alive) setHasClipDemos((d.packs?.length ?? 0) > 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [user?.role]);

  if (!user) return null;

  const groups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => canSeeNav(item, user, { hasClipDemos }))
      .map((item) => ({ ...item, navKey: navKeyFor(item) })),
  })).filter((group) => group.items.length > 0);
  const visibleKeys = new Set(groups.flatMap((group) => group.items.map((item) => item.navKey)));
  const pinnedKeySet = new Set(pinnedKeys);
  const hiddenKeySet = new Set(hiddenKeys);
  const selectedCount = pinnedKeys.filter((key) => visibleKeys.has(key) && !hiddenKeySet.has(key)).length;
  const hiddenCount = hiddenKeys.filter((key) => visibleKeys.has(key)).length;

  function commit(nextPinned: string[], nextHidden: string[]) {
    const normalizedHidden = [...new Set(nextHidden)];
    const normalizedHiddenSet = new Set(normalizedHidden);
    const normalizedPinned = [...new Set(nextPinned)].filter((key) => !normalizedHiddenSet.has(key));

    setPinnedKeys(normalizedPinned);
    setHiddenKeys(normalizedHidden);
    writePinnedNavKeys(normalizedPinned);
    writeHiddenNavKeys(normalizedHidden);
    window.dispatchEvent(new Event("sidebar:pinned-nav-changed"));
  }

  function togglePinned(navKey: string) {
    const isPinned = pinnedKeySet.has(navKey) && !hiddenKeySet.has(navKey);
    commit(
      isPinned ? pinnedKeys.filter((key) => key !== navKey) : [navKey, ...pinnedKeys.filter((key) => key !== navKey)],
      hiddenKeys.filter((key) => key !== navKey),
    );
  }

  function toggleHidden(navKey: string) {
    const isHidden = hiddenKeySet.has(navKey);
    commit(
      pinnedKeys.filter((key) => key !== navKey),
      isHidden ? hiddenKeys.filter((key) => key !== navKey) : [navKey, ...hiddenKeys.filter((key) => key !== navKey)],
    );
  }

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <AppIcon name="deck" className="text-primary mt-0.5" size={18} />
            <div>
              <h2 className="card-title text-base">{t("settings.favoriteNavTitle")}</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="badge badge-sm badge-ghost">{t("settings.favoriteNavCount", { n: selectedCount })}</span>
                <span className="badge badge-sm badge-ghost">{t("settings.hiddenNavCount", { n: hiddenCount })}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm btn-ghost gap-1" onClick={() => commit([], hiddenKeys)} disabled={selectedCount === 0}>
              <AppIcon name="refresh" size={14} />
              {t("settings.favoriteNavReset")}
            </button>
            <button className="btn btn-sm btn-ghost gap-1" onClick={() => commit(pinnedKeys, [])} disabled={hiddenCount === 0}>
              <AppIcon name="refresh" size={14} />
              {t("settings.hiddenNavReset")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {groups.map((group) => (
            <div key={group.labelKey} className="rounded-lg border border-base-300 bg-base-100 p-3">
              <div className="mb-2 grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-base-content/45">
                <span>{t(group.labelKey)}</span>
                <span className="text-center">{t("settings.favoriteNavColumn")}</span>
                <span className="text-center">{t("settings.hiddenNavColumn")}</span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isHidden = hiddenKeySet.has(item.navKey);
                  const isPinned = pinnedKeySet.has(item.navKey) && !isHidden;
                  return (
                    <div
                      key={item.navKey}
                      className={`grid min-h-9 grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 rounded-md px-1.5 hover:bg-base-200/60 ${
                        isHidden ? "text-base-content/45" : ""
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <AppIcon name={item.icon} size={16} className="shrink-0 text-base-content/65" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t(item.labelKey)}</span>
                        {item.adminBadge && <span className="admin-nav-badge">adm</span>}
                      </div>
                      <label className="flex cursor-pointer justify-center" title={t("settings.favoriteNavColumn")}>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm"
                          checked={isPinned}
                          onChange={() => togglePinned(item.navKey)}
                          aria-label={`${t("settings.favoriteNavColumn")}: ${t(item.labelKey)}`}
                        />
                      </label>
                      <label className="flex cursor-pointer justify-center" title={t("settings.hiddenNavColumn")}>
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={isHidden}
                          onChange={() => toggleHidden(item.navKey)}
                          aria-label={`${t("settings.hiddenNavColumn")}: ${t(item.labelKey)}`}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Manage up to N uploaded Google OAuth keys (client_secret.json). Each channel is bound to one key at
// connect time; the raw secret never leaves the server — we only ever show label/project/short id.
function GoogleKeysManager() {
  const { t } = useT();
  const [data, setData] = useState<OAuthClientsResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warn, setWarn] = useState("");
  const [copied, setCopied] = useState(false);
  const [label, setLabel] = useState("");
  const [showHow, setShowHow] = useState(false);

  const redirectUrl = data?.redirectUri || `${window.location.origin}/api/youtube/callback`;
  const clients = data?.clients ?? [];
  const max = data?.max ?? 5;
  const atMax = clients.length >= max;

  const load = () =>
    apiClient
      .youtubeClients()
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : t("settings.errLoad")));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setWarn("");
    setBusy(true);
    try {
      const text = await f.text();
      const res = await apiClient.addYoutubeClient(text, label.trim() || undefined);
      if (!res.redirectOk) setWarn(t("settings.redirectMismatch"));
      setLabel("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.errUpload"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function remove(c: OAuthClient) {
    if (c.channelCount > 0) return; // UI guard; backend also blocks in-use keys
    if (
      !(await confirmDialog(t("settings.removeKeyConfirm"), {
        title: t("settings.removeKeyTitle"),
        confirmText: t("settings.removeKey"),
        danger: true,
      }))
    )
      return;
    setError("");
    setBusy(true);
    try {
      await apiClient.deleteYoutubeClient(c.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.errRemove"));
    } finally {
      setBusy(false);
    }
  }

  async function copyRedirect() {
    try {
      await navigator.clipboard.writeText(redirectUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) — the URI is shown for manual copy */
    }
  }

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <KeyRound className="text-primary" size={18} />
          <h2 className="card-title text-base">{t("settings.googleKeysTitle")}</h2>
          {data && (
            <span className={`badge badge-sm ${clients.length ? "badge-success" : "badge-warning"}`}>
              {t("settings.keysCount", { n: clients.length, max })}
            </span>
          )}
        </div>

        <p className="text-sm text-base-content/70">{t("settings.googleIntro")}</p>

        {/* Step-by-step instructions — collapsible so a list of 5 keys stays compact. */}
        <button
          type="button"
          className="btn btn-ghost btn-xs w-fit gap-1 -ml-1 text-base-content/70"
          onClick={() => setShowHow((v) => !v)}
        >
          {showHow ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {t("settings.howToTitle")}
        </button>
        {showHow && (
          <div className="text-sm text-base-content/70 space-y-2 rounded-lg bg-base-200/50 p-3">
            <ol className="list-decimal list-inside space-y-1 text-base-content/80 marker:text-primary marker:font-semibold">
              <li>
                {t("settings.step1Open")}{" "}
                <a
                  className="link link-primary"
                  href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  YouTube Data API v3
                </a>{" "}
                {t("settings.step1Tail")} <b>Enable</b>.
              </li>
              <li>
                {t("settings.step2Open")}{" "}
                <a
                  className="link link-primary"
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                >
                  Credentials
                </a>{" "}
                → <b>Create credentials → OAuth client ID</b>.
              </li>
              <li>
                <b>Application type → Web application</b> {t("settings.step3Pre")}
                <u>{t("settings.step3NotDesktop")}</u>
                {t("settings.step3Post")}
              </li>
              <li>
                {t("settings.step4Section")} <b>Authorized redirect URIs</b> → <b>+ ADD URI</b> → {t("settings.step4Tail")}
              </li>
              <li>
                <b>Create</b> → <b>Download JSON</b> → {t("settings.step5Tail")}
              </li>
            </ol>
            <p className="text-xs text-base-content/50">
              {t("settings.testingNote1")} <b>OAuth consent screen → Test users</b>
              {t("settings.testingNote2")}
            </p>
          </div>
        )}

        {/* Redirect URI to paste into every key's Authorized redirect URIs. */}
        <div>
          <div className="text-xs text-base-content/60 mb-1 flex items-center gap-1">
            <Link2 size={12} /> {t("settings.redirectUriLabel")}
          </div>
          <div className="flex items-stretch gap-2">
            <code className="flex-1 bg-base-200 rounded p-2 text-xs break-all self-center">{redirectUrl}</code>
            <button className="btn btn-ghost btn-sm gap-1" onClick={copyRedirect} title={t("settings.copy")}>
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
              {copied ? t("settings.copied") : t("settings.copy")}
            </button>
          </div>
        </div>

        {/* Existing keys */}
        {data && clients.length === 0 && (
          <p className="text-sm text-base-content/50 italic">{t("settings.noKeys")}</p>
        )}
        {clients.length > 0 && (
          <ul className="space-y-2">
            {clients.map((c) => (
              <OAuthKeyCard key={c.id} client={c} busy={busy} onRemove={() => remove(c)} onChanged={load} />
            ))}
          </ul>
        )}

        {/* Add a key */}
        {atMax ? (
          <p className="text-xs text-warning flex items-center gap-1">
            <AlertTriangle size={14} /> {t("settings.maxKeysReached", { max })}
          </p>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              className="input input-bordered input-sm w-52"
              placeholder={t("settings.keyLabelPlaceholder")}
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              disabled={busy}
            />
            <label className="btn btn-primary btn-sm gap-2">
              {busy ? <span className="loading loading-spinner loading-sm" /> : <Plus size={16} />}
              {t("settings.addKey")}
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onFile}
                disabled={busy}
              />
            </label>
          </div>
        )}

        {error && (
          <div className="text-error text-sm flex items-center gap-1">
            <AlertTriangle size={14} /> {error}
          </div>
        )}
        {warn && (
          <div className="text-warning text-sm flex items-start gap-1">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {warn}
          </div>
        )}
        <p className="text-xs text-base-content/50">{t("settings.keyPrivacy")}</p>
      </div>
    </section>
  );
}

// One stored key row: label (inline-editable), project + short client id, channel usage, delete.
function OAuthKeyCard({
  client,
  busy,
  onRemove,
  onChanged,
}: {
  client: OAuthClient;
  busy: boolean;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(client.label);
  const [saving, setSaving] = useState(false);
  const inUse = client.channelCount > 0;

  async function save() {
    const next = label.trim();
    if (!next || next === client.label) {
      setEditing(false);
      setLabel(client.label);
      return;
    }
    setSaving(true);
    try {
      await apiClient.renameYoutubeClient(client.id, next);
      setEditing(false);
      onChanged();
    } catch {
      setLabel(client.label);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg border border-base-300 bg-base-100 p-3 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Check size={14} className="text-success shrink-0" />
          {editing ? (
            <input
              type="text"
              className="input input-bordered input-xs w-44"
              value={label}
              maxLength={60}
              autoFocus
              disabled={saving}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setEditing(false);
                  setLabel(client.label);
                }
              }}
              onBlur={save}
            />
          ) : (
            <>
              <span className="font-semibold text-sm truncate">{client.label}</span>
              <button
                className="btn btn-ghost btn-xs btn-square text-base-content/50"
                onClick={() => setEditing(true)}
                title={t("settings.rename")}
              >
                <Pencil size={12} />
              </button>
            </>
          )}
        </div>
        <div className="text-xs text-base-content/55 break-all">
          {client.projectId && (
            <>
              {t("settings.keyProject")}: <b>{client.projectId}</b> ·{" "}
            </>
          )}
          <span className="font-mono">{client.clientIdShort}</span>
        </div>
        <div className="text-xs text-base-content/45">
          {inUse ? t("settings.keyUsedBy", { n: client.channelCount }) : t("settings.keyUnused")}
        </div>
      </div>
      <button
        className="btn btn-ghost btn-xs text-error gap-1 shrink-0"
        onClick={onRemove}
        disabled={busy || inUse}
        title={inUse ? t("settings.deleteKeyInUse") : t("settings.removeKey")}
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

// Admin-only "СЕЧЕНИЕ" skin — a bold editorial re-style layered over the classic look. Renders
// nothing for non-admins (regular users keep the classic dashboard). The preference is per-browser.
function SkinSettings() {
  const { t } = useT();
  const { skinOn, canUseSkin, setSkinOn } = useSkin();
  if (!canUseSkin) return null;

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <AppIcon name="skin" className="text-primary mt-0.5" size={18} />
            <div>
              <h2 className="card-title text-base">{t("skin.settingsTitle")}</h2>
              <p className="text-sm text-base-content/60 mt-1">{t("skin.settingsDesc")}</p>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <span className="text-sm font-medium">{skinOn ? t("skin.on") : t("skin.off")}</span>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={skinOn}
              onChange={(e) => setSkinOn(e.target.checked)}
              aria-label={t("skin.toggleHint")}
            />
          </label>
        </div>

      </div>
    </section>
  );
}

function DesignSettings() {
  const { t } = useT();
  const [design, setDesign] = useState<DesignId>(() => getSavedDesign());

  function choose(next: DesignId) {
    setDesign(next);
    saveDesign(next);
  }

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <AppIcon name="settings" className="text-primary mt-0.5" size={18} />
            <div>
              <h2 className="card-title text-base">{t("settings.designTitle")}</h2>
              <p className="text-sm text-base-content/60 mt-1">{t("settings.designIntro")}</p>
            </div>
          </div>
          <button
            className="btn btn-sm btn-ghost gap-1"
            onClick={() => choose("classic")}
            disabled={design === "classic"}
          >
            <AppIcon name="refresh" size={14} />
            {t("settings.designResetClassic")}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {DESIGNS.map((item) => {
            const active = item.id === design;
            return (
              <button
                key={item.id}
                type="button"
                className={`text-left rounded-lg border p-2.5 transition-colors ${
                  active
                    ? "border-primary bg-primary/5 shadow-[inset_0_0_0_1px_var(--color-primary)]"
                    : "border-base-300 bg-base-100 hover:border-primary/60"
                }`}
                onClick={() => choose(item.id)}
                aria-pressed={active}
              >
                <DesignPreview id={item.id} />
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-semibold text-sm">{t(item.labelKey)}</span>
                  {active && <span className="badge badge-primary badge-xs">{t("settings.designCurrent")}</span>}
                </div>
                <div className="text-xs text-base-content/55 mt-1 leading-snug">{t(item.descKey)}</div>
              </button>
            );
          })}
        </div>

        {design !== DEFAULT_DESIGN && (
          <div className="rounded-lg border border-base-300 bg-base-200/55 px-3 py-2 text-xs text-base-content/60">
            {t("settings.designDefaultHint", { name: t(DESIGNS.find((d) => d.id === DEFAULT_DESIGN)?.labelKey || "") })}
          </div>
        )}
      </div>
    </section>
  );
}

function DesignPreview({ id }: { id: DesignId }) {
  const p = previewPalette(id);
  return (
    <svg viewBox="0 0 260 150" className="block w-full rounded-md border border-base-300 bg-base-200" aria-hidden="true">
      <rect width="260" height="150" rx="10" fill={p.bg} />
      <rect x="12" y="12" width="54" height="126" rx="8" fill={p.sidebar} />
      <rect x="22" y="25" width="30" height="6" rx="3" fill={p.primary} />
      <rect x="22" y="48" width="34" height="5" rx="2.5" fill={p.muted} />
      <rect x="22" y="66" width="26" height="5" rx="2.5" fill={p.muted} />
      <rect x="22" y="84" width="38" height="5" rx="2.5" fill={p.primary} opacity="0.88" />
      <rect x="80" y="16" width="168" height="30" rx="7" fill={p.card} />
      <rect x="94" y="27" width="72" height="6" rx="3" fill={p.text} opacity="0.88" />
      <rect x="196" y="24" width="36" height="12" rx="6" fill={p.secondary} />
      <rect x="80" y="58" width="76" height="34" rx="8" fill={p.card} />
      <rect x="94" y="70" width="30" height="6" rx="3" fill={p.primary} />
      <rect x="94" y="82" width="46" height="5" rx="2.5" fill={p.muted} />
      <rect x="168" y="58" width="80" height="34" rx="8" fill={p.card} />
      <rect x="182" y="70" width="32" height="6" rx="3" fill={p.accent} />
      <rect x="182" y="82" width="50" height="5" rx="2.5" fill={p.muted} />
      <rect x="80" y="104" width="168" height="34" rx="8" fill={p.card} />
      <path d="M96 126c18-18 31 4 48-12 18-17 32 9 52-10 10-9 18-8 30 0" stroke={p.primary} strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="212" cy="121" r="8" fill={p.secondary} />
    </svg>
  );
}

function previewPalette(id: DesignId) {
  switch (id) {
    case "harbor":
      return {
        bg: "#eef8f8",
        sidebar: "#dceff0",
        card: "#ffffff",
        primary: "#1f6d77",
        secondary: "#586fb8",
        accent: "#56a56f",
        muted: "#9bb7bc",
        text: "#1a3440",
      };
    case "berry":
      return {
        bg: "#f8f2f7",
        sidebar: "#eaddea",
        card: "#ffffff",
        primary: "#7a3f68",
        secondary: "#b45359",
        accent: "#429c8a",
        muted: "#bba8b8",
        text: "#34243a",
      };
    case "classic":
      return {
        bg: "#f4f2eb",
        sidebar: "#ffffff",
        card: "#ffffff",
        primary: "#08776f",
        secondary: "#8b5a28",
        accent: "#6e59a5",
        muted: "#b9b1a3",
        text: "#252a35",
      };
	    case "atelier":
	    default:
	      return {
	        bg: "#f4f6f8",
	        sidebar: "#ffffff",
	        card: "#ffffff",
	        primary: "#2563eb",
	        secondary: "#15803d",
	        accent: "#d97706",
	        muted: "#aab4c0",
	        text: "#111827",
	      };
	  }
	}

// Link a Telegram account → enables one-click "Login with Telegram" and bot-delivered password recovery.
function TelegramLink() {
  const { t } = useT();
  const [st, setSt] = useState<{
    enabled: boolean;
    bot: string | null;
    linked: boolean;
    username: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    apiClient
      .telegramStatus()
      .then(setSt)
      .catch(() => setSt({ enabled: false, bot: null, linked: false, username: null }));
  useEffect(() => {
    load();
  }, []);

  async function unbind() {
    if (!(await confirmDialog(t("settings.tgUnbindConfirm"), { title: t("settings.tgUnbindTitle"), confirmText: t("settings.tgUnbind"), danger: true }))) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiClient.telegramUnbind();
      setMsg({ ok: true, text: t("settings.tgUnbound") });
      await load();
    } catch (err) {
      setMsg({ ok: false, text: err instanceof ApiError ? err.message : t("settings.tgUnbindErr") });
    } finally {
      setBusy(false);
    }
  }

  if (!st) return null; // still loading

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Send className="text-primary" size={18} />
          <h2 className="card-title text-base">{t("settings.tgTitle")}</h2>
          {st.enabled &&
            (st.linked ? (
              <span className="badge badge-success badge-sm">{t("settings.tgLinked")}</span>
            ) : (
              <span className="badge badge-ghost badge-sm">{t("settings.tgNotLinked")}</span>
            ))}
        </div>

        {!st.enabled ? (
          <p className="text-sm text-base-content/60">
            {t("settings.tgNotConfigured")}
          </p>
        ) : st.linked ? (
          <>
            <p className="text-sm text-base-content/70">
              {t("settings.tgLinkedPre")} <b>{st.username}</b>. {t("settings.tgLinkedPost")}
            </p>
            <div>
              <button className="btn btn-ghost btn-sm text-error gap-1" onClick={unbind} disabled={busy}>
                <Trash2 size={14} /> {t("settings.tgUnbind")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-base-content/70">
              {t("settings.tgBindPre")}{st.bot ? <> ({t("settings.tgBot")} <b>@{st.bot}</b>)</> : null}{t("settings.tgBindMid")} <b>Start</b> {t("settings.tgBindPost")}
            </p>
            <TelegramConnect mode="bind" onDone={() => load()} />
          </>
        )}

        {msg && (
          <div className={`text-sm flex items-center gap-1 ${msg.ok ? "text-success" : "text-error"}`}>
            {msg.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {msg.text}
          </div>
        )}
        {st.enabled && (
          <p className="text-xs text-base-content/50">
            {t("settings.tgDomainNote")}
          </p>
        )}
      </div>
    </section>
  );
}

// Self-service password change — any logged-in user changes their OWN password.
function ChangePassword() {
  const { t } = useT();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const valid = cur.length > 0 && next.length >= 6 && next === confirm;

  async function submit() {
    setMsg(null);
    if (next !== confirm) return setMsg({ ok: false, text: t("settings.pwMismatch") });
    if (next.length < 6) return setMsg({ ok: false, text: t("settings.pwTooShort") });
    setBusy(true);
    try {
      const r = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: next }),
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || data?.error) {
        setMsg({ ok: false, text: data?.error || t("settings.pwChangeErr") });
        return;
      }
      setMsg({ ok: true, text: t("settings.pwChanged") });
      setCur("");
      setNext("");
      setConfirm("");
    } catch {
      setMsg({ ok: false, text: t("settings.netError") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <div className="flex items-center gap-2">
          <Lock className="text-primary" size={18} />
          <h2 className="card-title text-base">{t("settings.pwTitle")}</h2>
        </div>
        <p className="text-sm text-base-content/70">
          {t("settings.pwIntro")}
        </p>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && valid) submit();
          }}
        >
          <label className="form-control w-44">
            <span className="label-text">{t("settings.pwCurrent")}</span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <label className="form-control w-44">
            <span className="label-text">{t("settings.pwNew")}</span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label className="form-control w-44">
            <span className="label-text">{t("settings.pwRepeat")}</span>
            <input
              type="password"
              className="input input-bordered input-sm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm gap-1" disabled={busy || !valid}>
            {busy ? <span className="loading loading-spinner loading-sm" /> : <KeyRound size={14} />}
            {t("settings.pwSubmit")}
          </button>
        </form>
        {msg && (
          <div className={`text-sm flex items-center gap-1 ${msg.ok ? "text-success" : "text-error"}`}>
            {msg.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {msg.text}
          </div>
        )}
      </div>
    </section>
  );
}

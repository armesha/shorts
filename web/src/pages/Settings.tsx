import { useEffect, useState, type ChangeEvent } from "react";
import { KeyRound, Check, AlertTriangle, Upload, Trash2, Lock, Send } from "lucide-react";
import { apiClient, ApiError, type AppSettings } from "../lib/api";
import TelegramConnect from "../components/TelegramConnect";
import { confirmDialog } from "../lib/confirm";
import { useT } from "../lib/i18n";

export default function Settings() {
  const { t } = useT();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const redirectUrl = `${window.location.origin}/api/youtube/callback`;

  useEffect(() => {
    apiClient
      .settings()
      .then(setSettings)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("settings.errLoad")));
  }, [t]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setBusy(true);
    try {
      const text = await f.text();
      setSettings(await apiClient.uploadGoogleKey(text));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.errUpload"));
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function removeKey() {
    if (!(await confirmDialog(t("settings.removeKeyConfirm"), { title: t("settings.removeKeyTitle"), confirmText: t("settings.removeKey"), danger: true }))) return;
    setError("");
    setBusy(true);
    try {
      setSettings(await apiClient.removeGoogleKey());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("settings.errRemove"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-bold">{t("settings.title")}</h1>
        <p className="text-base-content/60">{t("settings.subtitle")}</p>
      </header>

      <section className="card bg-base-100 border border-base-300">
        <div className="card-body gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <KeyRound className="text-primary" size={18} />
            <h2 className="card-title text-base">{t("settings.googleKeyTitle")}</h2>
            {settings &&
              (settings.hasGoogleKey ? (
                <span className="badge badge-success badge-sm">{t("settings.badgeLoaded")}</span>
              ) : (
                <span className="badge badge-warning badge-sm">{t("settings.badgeNotLoaded")}</span>
              ))}
          </div>

          <div className="text-sm text-base-content/70 space-y-2">
            <p>{t("settings.googleIntro")}</p>
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
                <b>Application type → Web application</b> {t("settings.step3Pre")}<u>{t("settings.step3NotDesktop")}</u>{t("settings.step3Post")}
              </li>
              <li>
                {t("settings.step4Section")} <b>Authorized redirect URIs</b> → <b>+ ADD URI</b> → {t("settings.step4Tail")} 👇
              </li>
              <li>
                <b>Create</b> → <b>Download JSON</b> → {t("settings.step5Tail")}
              </li>
            </ol>
            <p className="text-xs text-base-content/50">
              {t("settings.testingNote1")} <b>OAuth consent screen → Test
              users</b>{t("settings.testingNote2")}
            </p>
          </div>
          <code className="block bg-base-200 rounded p-2 text-xs break-all">{redirectUrl}</code>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="btn btn-primary btn-sm gap-2">
              {busy ? <span className="loading loading-spinner loading-sm" /> : <Upload size={16} />}
              {settings?.hasGoogleKey ? t("settings.replaceKey") : t("settings.uploadKey")}
              <input type="file" accept=".json,application/json" className="hidden" onChange={onFile} disabled={busy} />
            </label>
            {settings?.hasGoogleKey && (
              <button className="btn btn-ghost btn-sm text-error gap-1" onClick={removeKey} disabled={busy}>
                <Trash2 size={14} /> {t("settings.removeKey")}
              </button>
            )}
          </div>
          {error && (
            <div className="text-error text-sm flex items-center gap-1">
              <AlertTriangle size={14} /> {error}
            </div>
          )}
          <p className="text-xs text-base-content/50">
            {t("settings.keyPrivacy")}
          </p>
        </div>
      </section>

      <TelegramLink />

      <ChangePassword />
    </div>
  );
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

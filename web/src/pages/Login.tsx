import { useEffect, useState, type FormEvent } from "react";
import { apiClient, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import TelegramConnect from "../components/TelegramConnect";
import { AppIcon } from "../components/AppIcon";

export default function Login() {
  const { t } = useT();
  const [mode, setMode] = useState<"login" | "recover">("login");

  return (
    <div className="min-h-screen grid place-items-center bg-base-200 px-4 py-8">
      <div className="card w-full max-w-sm bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body gap-4">
          <div className="text-center">
            <div className="flex items-center gap-2 justify-center">
              <AppIcon name="clips" className="text-primary" size={28} />
              <span className="font-bold text-xl tracking-tight">Shorts Factory</span>
            </div>
            <p className="text-sm text-base-content/60 mt-1">
              {mode === "login" ? t("login.subtitleLogin") : t("login.subtitleRecover")}
            </p>
          </div>
          {mode === "login" ? (
            <LoginForm onRecover={() => setMode("recover")} />
          ) : (
            <RecoverForm onBack={() => setMode("login")} />
          )}
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onRecover }: { onRecover: () => void }) {
  const { setUser } = useAuth();
  const { t } = useT();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tgEnabled, setTgEnabled] = useState(false);

  useEffect(() => {
    apiClient
      .telegramInfo()
      .then((i) => setTgEnabled(i.enabled))
      .catch(() => setTgEnabled(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setLocked(false);
    try {
      const u = await apiClient.login(username.trim(), password);
      setUser(u);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.status === 423) setLocked(true); // account locked after too many tries
      } else {
        setError(t("login.errServerDown"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <label className="form-control">
        <span className="label-text">{t("login.username")}</span>
        <input
          id="login-username"
          name="username"
          className="input input-bordered w-full"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
          autoFocus
          autoComplete="username"
        />
      </label>

      <label className="form-control">
        <span className="label-text">{t("login.password")}</span>
        <input
          id="login-password"
          name="password"
          type="password"
          className="input input-bordered w-full"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          autoComplete="current-password"
        />
      </label>

      {error && (
        <div className={`alert ${locked ? "alert-warning" : "alert-error"} py-2 text-sm`} role="alert">
          <AppIcon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <button className="btn btn-primary w-full" disabled={busy || !username || !password}>
        {busy ? <span className="loading loading-spinner loading-sm" /> : <AppIcon name="login" size={16} />}
        {t("login.signIn")}
      </button>

      <button
        type="button"
        className="btn btn-ghost btn-sm self-center text-base-content/60"
        onClick={onRecover}
      >
        {t("login.forgotPassword")}
      </button>

      {tgEnabled && (
        <>
          <div className="divider text-xs text-base-content/40 my-0">{t("login.or")}</div>
          <div className="flex justify-center">
            <TelegramConnect mode="login" onDone={(u) => u && setUser(u)} />
          </div>
        </>
      )}
    </form>
  );
}

// Password recovery via the Telegram bot: enter login → bot DMs a code → enter code + new password.
function RecoverForm({ onBack }: { onBack: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState<"request" | "verify" | "done">("request");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(e: FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.recoverStart(username.trim());
      setStep("verify"); // always advance — the response is intentionally generic (no enumeration)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.errNetwork"));
    } finally {
      setBusy(false);
    }
  }

  async function complete(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (pw.length < 6) return setError(t("login.errPwTooShort"));
    if (pw !== pw2) return setError(t("login.errPwMismatch"));
    setBusy(true);
    try {
      await apiClient.recoverComplete(username.trim(), code.trim(), pw);
      setStep("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.errNetwork"));
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div className="flex flex-col gap-4">
        <div className="alert alert-success py-2 text-sm" role="alert">
          <AppIcon name="check" size={16} />
          <span>{t("login.pwChanged")}</span>
        </div>
        <button className="btn btn-primary w-full" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> {t("login.backToLogin")}
        </button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={step === "request" ? request : complete}>
      {step === "request" ? (
        <>
          <p className="text-sm text-base-content/70">{t("login.recoverHint")}</p>
          <label className="form-control">
            <span className="label-text">{t("login.username")}</span>
            <input
              className="input input-bordered w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy}
              autoFocus
              autoComplete="username"
            />
          </label>
        </>
      ) : (
        <>
          <div className="alert alert-info py-2 text-xs">
            <AppIcon name="check" size={16} />
            <span>{t("login.codeSentHint")}</span>
          </div>
          <label className="form-control">
            <span className="label-text">{t("login.codeFromTelegram")}</span>
            <input
              className="input input-bordered w-full tracking-[0.4em] text-center"
              value={code}
              inputMode="numeric"
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              autoFocus
              placeholder="000000"
            />
          </label>
          <label className="form-control">
            <span className="label-text">{t("login.newPassword")}</span>
            <input
              type="password"
              className="input input-bordered w-full"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
            />
          </label>
          <label className="form-control">
            <span className="label-text">{t("login.repeatPassword")}</span>
            <input
              type="password"
              className="input input-bordered w-full"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
            />
          </label>
        </>
      )}

      {error && (
        <div className="alert alert-error py-2 text-sm" role="alert">
          <AppIcon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <button
        className="btn btn-primary w-full"
        disabled={busy || (step === "request" ? !username.trim() : !code.trim() || !pw)}
      >
        {busy ? (
          <span className="loading loading-spinner loading-sm" />
        ) : step === "request" ? (
          <AppIcon name="login" size={16} />
        ) : (
          <AppIcon name="check" size={16} />
        )}
        {step === "request" ? t("login.getCode") : t("login.changePassword")}
      </button>

      <div className="flex justify-between">
        <button type="button" className="btn btn-ghost btn-sm text-base-content/60" onClick={onBack}>
          <AppIcon name="chevron-left" size={14} /> {t("login.backToLogin")}
        </button>
        {step === "verify" && (
          <button
            type="button"
            className="btn btn-ghost btn-sm text-base-content/60"
            onClick={() => setStep("request")}
          >
            {t("login.requestCodeAgain")}
          </button>
        )}
      </div>
    </form>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiClient, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import TelegramConnect from "../components/TelegramConnect";
import { AppIcon } from "../components/AppIcon";
import PasswordInput from "../components/PasswordInput";

export default function Login() {
  const { t } = useT();
  const [mode, setMode] = useState<"login" | "recover">("login");

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="login-title">
        <header className="auth-header">
          <div className="auth-brand" id="login-title">
            <AppIcon name="clips" size={28} />
            <span>Shorts Factory</span>
          </div>
          <p className="auth-subtitle">
            {mode === "login" ? t("login.subtitleLogin") : t("login.subtitleRecover")}
          </p>
        </header>
        {mode === "login" ? (
          <LoginForm onRecover={() => setMode("recover")} />
        ) : (
          <RecoverForm onBack={() => setMode("login")} />
        )}
      </section>
    </main>
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
    <>
      <form className="auth-form" onSubmit={submit}>
        <label className="auth-field">
          <span className="auth-label">{t("login.username")}</span>
          <input
            id="login-username"
            name="username"
            className="auth-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={busy}
            autoFocus
            autoComplete="username"
          />
        </label>

        <label className="auth-field">
          <span className="auth-label">{t("login.password")}</span>
          <PasswordInput
            id="login-password"
            name="password"
            inputClassName="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="current-password"
            showLabel={t("common.showPassword")}
            hideLabel={t("common.hidePassword")}
          />
        </label>

        {error && (
          <div className={`auth-alert ${locked ? "auth-alert--info" : ""}`} role="alert">
            <AppIcon name="warning" size={16} />
            <span>{error}</span>
          </div>
        )}

        <button className="auth-button auth-button--primary" disabled={busy || !username || !password}>
          {busy ? <span className="loading loading-spinner loading-sm" /> : <AppIcon name="login" size={16} />}
          {t("login.signIn")}
        </button>

        <button type="button" className="auth-button auth-button--quiet" onClick={onRecover}>
          {t("login.forgotPassword")}
        </button>
      </form>

      <p className="auth-footer">
        {t("login.noAccount")}{" "}
        <Link className="auth-link" to="/register">
          {t("login.register")}
        </Link>
      </p>

      {tgEnabled && (
        <>
          <div className="auth-divider">{t("login.or")}</div>
          <div className="auth-telegram">
            <TelegramConnect
              mode="login"
              onDone={(u) => u && setUser(u)}
              buttonClassName="auth-button auth-button--telegram"
              linkClassName="auth-button auth-button--telegram"
              quietButtonClassName="auth-button auth-button--quiet"
              statusClassName="auth-status"
              successClassName="auth-alert auth-alert--success"
              errorClassName="auth-alert"
            />
          </div>
        </>
      )}
    </>
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
    if (pw.length < 3) return setError(t("login.errPwTooShort"));
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
      <div className="auth-form">
        <div className="auth-alert auth-alert--success" role="alert">
          <AppIcon name="check" size={16} />
          <span>{t("login.pwChanged")}</span>
        </div>
        <button type="button" className="auth-button auth-button--primary" onClick={onBack}>
          <AppIcon name="chevron-left" size={16} /> {t("login.backToLogin")}
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={step === "request" ? request : complete}>
      {step === "request" ? (
        <>
          <p className="auth-note">{t("login.recoverHint")}</p>
          <label className="auth-field">
            <span className="auth-label">{t("login.username")}</span>
            <input
              className="auth-input"
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
          <div className="auth-alert auth-alert--info">
            <AppIcon name="check" size={16} />
            <span>{t("login.codeSentHint")}</span>
          </div>
          <label className="auth-field">
            <span className="auth-label">{t("login.codeFromTelegram")}</span>
            <input
              className="auth-input auth-input--code"
              value={code}
              inputMode="numeric"
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
              autoFocus
              placeholder="000000"
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">{t("login.newPassword")}</span>
            <PasswordInput
              inputClassName="auth-input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              showLabel={t("common.showPassword")}
              hideLabel={t("common.hidePassword")}
            />
          </label>
          <label className="auth-field">
            <span className="auth-label">{t("login.repeatPassword")}</span>
            <PasswordInput
              inputClassName="auth-input"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              showLabel={t("common.showPassword")}
              hideLabel={t("common.hidePassword")}
            />
          </label>
        </>
      )}

      {error && (
        <div className="auth-alert" role="alert">
          <AppIcon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <button
        className="auth-button auth-button--primary"
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

      <div className="auth-action-row">
        <button type="button" className="auth-button auth-button--quiet" onClick={onBack}>
          <AppIcon name="chevron-left" size={14} /> {t("login.backToLogin")}
        </button>
        {step === "verify" && (
          <button
            type="button"
            className="auth-button auth-button--quiet"
            onClick={() => setStep("request")}
          >
            {t("login.requestCodeAgain")}
          </button>
        )}
      </div>
    </form>
  );
}

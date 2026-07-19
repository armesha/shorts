import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import TelegramConnect from "../components/TelegramConnect";
import { AppIcon } from "../components/AppIcon";
import { apiClient, ApiError, type AuthUser } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import PasswordInput from "../components/PasswordInput";
import { LanguageToggle } from "../components/layout/widgets";

export default function Register() {
  const { t, lang, setLang } = useT();
  const { setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tgEnabled, setTgEnabled] = useState(false);

  useEffect(() => {
    apiClient
      .telegramInfo()
      .then((i) => setTgEnabled(i.enabled))
      .catch(() => setTgEnabled(false));
  }, []);

  function done(user?: AuthUser) {
    if (!user) return;
    setUser(user);
    window.location.replace("/channels");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 3) return setError(t("register.errPwTooShort"));
    if (password !== password2) return setError(t("register.errPwMismatch"));
    setBusy(true);
    try {
      const user = await apiClient.register(username.trim(), password);
      done(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("register.errNetwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel" aria-labelledby="register-title">
        <header className="auth-header">
          <div className="auth-brand" id="register-title">
            <AppIcon name="clips" size={28} />
            <span>Shorts Factory</span>
          </div>
          <p className="auth-subtitle">{t("register.subtitle")}</p>
          <LanguageToggle lang={lang} setLang={setLang} t={t} className="auth-language-toggle" />
        </header>

        <form className="auth-form" onSubmit={submit}>
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

          <label className="auth-field">
            <span className="auth-label">{t("login.password")}</span>
            <PasswordInput
              inputClassName="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              showLabel={t("common.showPassword")}
              hideLabel={t("common.hidePassword")}
            />
          </label>

          <label className="auth-field">
            <span className="auth-label">{t("register.repeatPassword")}</span>
            <PasswordInput
              inputClassName="auth-input"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              showLabel={t("common.showPassword")}
              hideLabel={t("common.hidePassword")}
            />
          </label>

          {error && (
            <div className="auth-alert" role="alert">
              <AppIcon name="warning" size={16} />
              <span>{error}</span>
            </div>
          )}

          <button
            className="auth-button auth-button--primary"
            disabled={busy || !username.trim() || password.length < 3 || password !== password2}
          >
            {busy ? <span className="loading loading-spinner loading-sm" /> : <AppIcon name="users" size={16} />}
            {t("register.create")}
          </button>
        </form>

        {tgEnabled && (
          <>
            <div className="auth-divider">{t("login.or")}</div>
            <div className="auth-telegram">
              <TelegramConnect
                mode="register"
                onDone={done}
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

        <p className="auth-footer">
          {t("register.haveAccount")}{" "}
          <Link className="auth-link" to="/login">
            {t("login.signIn")}
          </Link>
        </p>
      </section>
    </main>
  );
}

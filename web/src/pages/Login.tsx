import { useState, type FormEvent } from "react";
import { Clapperboard, LogIn, AlertTriangle, Lock } from "lucide-react";
import { apiClient, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Login() {
  const { setUser } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

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
        setError("Не удалось войти — сервер недоступен?");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-base-200 px-4">
      <div className="card w-full max-w-sm bg-base-100 border border-base-300 shadow-sm">
        <form className="card-body gap-4" onSubmit={submit}>
          <div className="flex items-center gap-2 justify-center">
            <Clapperboard className="text-primary" size={28} />
            <span className="font-bold text-xl tracking-tight">Shorts Factory</span>
          </div>
          <p className="text-center text-sm text-base-content/60 -mt-3">Вход в панель управления</p>

          <div>
            <span className="label-text">Логин</span>
            <input
              className="input input-bordered w-full mt-1"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <span className="label-text">Пароль</span>
            <input
              type="password"
              className="input input-bordered w-full mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div
              className={`text-sm flex items-center gap-1 ${locked ? "text-warning" : "text-error"}`}
            >
              {locked ? <Lock size={14} /> : <AlertTriangle size={14} />} {error}
            </div>
          )}

          <button className="btn btn-primary w-full" disabled={busy || !username || !password}>
            {busy ? <span className="loading loading-spinner loading-sm" /> : <LogIn size={16} />}
            Войти
          </button>
        </form>
      </div>
    </div>
  );
}

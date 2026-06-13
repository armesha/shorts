import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiClient, type AuthUser } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiClient
      .me()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setLoading(false));
    // Any API call that 401s mid-session drops us back to the login screen.
    const onUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => {
      alive = false;
      window.removeEventListener("auth:unauthorized", onUnauthorized);
    };
  }, []);

  async function logout() {
    try {
      await apiClient.logout();
    } catch {
      /* ignore — clear locally regardless */
    }
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>{children}</AuthContext.Provider>
  );
}

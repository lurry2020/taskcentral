import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { UNAUTHORIZED_EVENT, clearToken, getToken, setToken } from "./authToken";

type AuthStatus = "loading" | "authed" | "anon";

interface AuthContextValue {
  status: AuthStatus;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  username: null,
  login: async () => {},
  logout: () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? "loading" : "anon"));
  const [username, setUsername] = useState<string | null>(null);

  const logout = useCallback(() => {
    clearToken();
    setUsername(null);
    setStatus("anon");
    qc.clear();
  }, [qc]);

  // Verify any stored token on load so a stale one bounces straight to login.
  useEffect(() => {
    if (!getToken()) return;
    let active = true;
    api
      .get<{ username: string }>("/auth/me")
      .then((me) => {
        if (!active) return;
        setUsername(me.username);
        setStatus("authed");
      })
      .catch(() => {
        if (!active) return;
        clearToken();
        setStatus("anon");
      });
    return () => {
      active = false;
    };
  }, []);

  // Backend rejected the session mid-use → drop to the login screen.
  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [logout]);

  const login = useCallback(
    async (user: string, password: string) => {
      const res = await api.post<{ token: string; username: string }>("/auth/login", {
        username: user,
        password,
      });
      setToken(res.token);
      qc.clear();
      setUsername(res.username);
      setStatus("authed");
    },
    [qc],
  );

  return (
    <AuthContext.Provider value={{ status, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

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
import { UNAUTHORIZED_EVENT, clearLegacyToken } from "./authToken";

type AuthStatus = "loading" | "authed" | "anon";

interface AuthContextValue {
  status: AuthStatus;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  username: null,
  login: async () => {},
  logout: async () => {},
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [username, setUsername] = useState<string | null>(null);

  const clearAuthState = useCallback(() => {
    setUsername(null);
    setStatus("anon");
    qc.clear();
  }, [qc]);

  const logout = useCallback(async () => {
    try {
      await api.post<void>("/auth/logout");
    } catch {
      // Clear the local UI even when the server is unreachable.
    } finally {
      clearAuthState();
    }
  }, [clearAuthState]);

  // Verify the HttpOnly cookie on load. Legacy localStorage tokens are discarded.
  useEffect(() => {
    clearLegacyToken();
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
        clearLegacyToken();
        setStatus("anon");
      });
    return () => {
      active = false;
    };
  }, []);

  // Backend rejected the session mid-use → drop to the login screen.
  useEffect(() => {
    const onUnauthorized = () => clearAuthState();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [clearAuthState]);

  const login = useCallback(
    async (user: string, password: string) => {
      const res = await api.post<{ username: string }>("/auth/login", {
        username: user,
        password,
      });
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

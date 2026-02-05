import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { AxiosError } from "axios";

import { API_BASE, apiClient } from "../api/client";

export interface AuthUser {
  id: number;
  username: string;
  full_name: string | null;
  is_admin: boolean;
  is_active: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("butce_token")
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete apiClient.defaults.headers.common.Authorization;
    }
  }, [token]);

  const fetchCurrentUser = useCallback(
    async (authToken: string) => {
      try {
        const response = await apiClient.get<AuthUser>('/auth/me', {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        setUser(response.data);
        setError(null);
      } catch (err) {
        console.error("Failed to load current user", err);
        setError("Oturum doğrulanamadı (auth/me 500). Lütfen tekrar giriş yapın.");
        setUser(null);
        setToken(null);
        localStorage.removeItem("butce_token");
      }
    },
    []
  );

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, fetchCurrentUser]);

  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const normalizedUsername = username.trim().toLowerCase();
      const params = new URLSearchParams();
      params.append("username", normalizedUsername);
      params.append("password", password);
      params.append("grant_type", "password");
      console.log("API_BASE", API_BASE);
      const response = await apiClient.post<{ access_token: string }>(
        "/auth/token",
        params,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );
      const accessToken = response.data.access_token;
      localStorage.setItem("butce_token", accessToken);
      setToken(accessToken);
      await fetchCurrentUser(accessToken);
    } catch (err) {
      const error = err as AxiosError<{ detail?: string }>;
      const isConnectionRefused =
        error.message?.includes("ERR_CONNECTION_REFUSED") || error.code === "ERR_NETWORK";
      setError(
        isConnectionRefused
          ? `Sunucuya bağlanılamadı. API: ${API_BASE}`
          : (error.response?.data?.detail ?? "Giriş başarısız")
      );
      setUser(null);
      setToken(null);
      localStorage.removeItem("butce_token");
    } finally {
      setLoading(false);
    }
  }, [fetchCurrentUser]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("butce_token");
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, login, logout, loading, error }),
    [user, token, login, logout, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

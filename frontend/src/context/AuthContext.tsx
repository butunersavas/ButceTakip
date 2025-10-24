import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import axios, { AxiosError } from "axios";

export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem("butce_token")
  );
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentUser = useCallback(
    async (authToken: string) => {
      try {
        const response = await axios.get<AuthUser>(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
        setUser(response.data);
        setError(null);
      } catch (err) {
        console.error("Failed to load current user", err);
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

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.append("username", email);
      params.append("password", password);
      params.append("grant_type", "password");
      const response = await axios.post<{ access_token: string }>(
        `${API_URL}/auth/token`,
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
      setError(error.response?.data?.detail ?? "Giriş başarısız");
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

import axios from "axios";

const FALLBACK_API_URL = "http://localhost:8001";

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const legacyApiUrl = import.meta.env.VITE_API_URL?.trim();

function resolveApiUrl() {
  const configuredUrl = envApiBaseUrl || legacyApiUrl;

  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl);
      const isLocalHost = ["localhost", "127.0.0.1"].includes(url.hostname);

      if (
        isLocalHost &&
        typeof window !== "undefined" &&
        window.location.hostname &&
        !["localhost", "127.0.0.1"].includes(window.location.hostname)
      ) {
        // Deployments where VITE_API_URL was left as localhost should automatically
        // target the current host instead of the unreachable localhost reference.
        return `${window.location.protocol}//${window.location.host}`;
      }

      return url.toString().replace(/\/$/, "");
    } catch (error) {
      console.warn("API_URL could not be parsed, falling back to defaults", error);
    }
  }

  // Prefer the backend's default local port when running via Vite dev/preview
  // servers (commonly on 5173/4173) without an explicit API URL. This avoids
  // sending requests back to the frontend server, which results in 404s.
  const isViteClient = typeof window !== "undefined" &&
    ["5173", "4173", "4174"].includes(window.location?.port ?? "");

  if (import.meta.env.DEV || isViteClient) {
    return FALLBACK_API_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }

  return FALLBACK_API_URL;
}

const API_URL = resolveApiUrl();

export const apiClient = axios.create({
  baseURL: API_URL
});

export function authHeaders(token: string | null) {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};
}

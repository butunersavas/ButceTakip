import axios from "axios";

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

  // In development we keep the /api prefix to leverage Vite's proxy, otherwise
  // default to the current origin.
  if (import.meta.env.DEV) {
    return "/api";
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.host}`;
  }

  return "/api";
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

import axios from "axios";

const envApiUrl = import.meta.env.VITE_API_URL?.trim();

const browserOrigin =
  typeof window !== "undefined" && typeof window.location?.origin === "string"
    ? window.location.origin
    : undefined;

const isLocalhost = (value?: string) =>
  Boolean(value && (value.includes("localhost") || value.includes("127.0.0.1")));

const shouldUseBrowserOrigin =
  Boolean(
    browserOrigin &&
      !isLocalhost(browserOrigin) &&
      (!envApiUrl || isLocalhost(envApiUrl))
  );

const API_URL = shouldUseBrowserOrigin
  ? browserOrigin
  : envApiUrl || "http://localhost:8000";

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

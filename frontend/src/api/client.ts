import axios from "axios";

const DEFAULT_API_PORT = "8000";
const FALLBACK_API_URL = `http://localhost:${DEFAULT_API_PORT}`;

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

function resolveApiUrl() {
  if (envApiBaseUrl) {
    try {
      const url = new URL(envApiBaseUrl);
      return url.toString().replace(/\/$/, "");
    } catch (error) {
      console.warn(
        "VITE_API_BASE_URL could not be parsed, falling back to defaults",
        error
      );
    }
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
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

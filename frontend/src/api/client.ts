import axios from "axios";

const envApiBase =
  import.meta.env.VITE_API_BASE_URL?.trim() ||
  import.meta.env.VITE_API_BASE?.trim();

const normalizeApiBase = (value: string) => {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

const API_BASE =
  envApiBase && envApiBase.length > 0 ? normalizeApiBase(envApiBase) : "/api";

export const apiClient = axios.create({
  baseURL: API_BASE
});

export function authHeaders(token: string | null) {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};
}

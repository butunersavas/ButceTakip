import axios from "axios";

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const legacyApiUrl = import.meta.env.VITE_API_URL?.trim();

const API_URL = envApiBaseUrl || legacyApiUrl || "/api";

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

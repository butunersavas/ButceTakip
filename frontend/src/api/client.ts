import axios from "axios";

const envApiBase = import.meta.env.VITE_API_BASE?.trim();
const API_BASE = envApiBase && envApiBase.length > 0 ? envApiBase : "/api";

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

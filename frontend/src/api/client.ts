import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL?.trim();

if (!API_BASE) {
  throw new Error("VITE_API_BASE_URL is not set");
}

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

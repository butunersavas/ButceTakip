import axios from "axios";

import { getApiBase } from "../config/apiBase";

export const API_BASE = getApiBase();
console.log("API_BASE", API_BASE);

export const apiClient = axios.create({
  baseURL: API_BASE
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 422 || status === 500) {
      const detail =
        error?.response?.data?.detail ??
        error?.response?.data?.message ??
        "Beklenmedik bir hata oluştu.";
      window.dispatchEvent(
        new CustomEvent("api-error", {
          detail: { status, message: String(detail) }
        })
      );
    }
    return Promise.reject(error);
  }
);

export function authHeaders(token: string | null) {
  return token
    ? {
        Authorization: `Bearer ${token}`
      }
    : {};
}

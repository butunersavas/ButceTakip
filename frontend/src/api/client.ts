import axios from "axios";

import { getApiBase } from "../config/apiBase";

declare module "axios" {
  export interface AxiosRequestConfig {
    suppressGlobalError?: boolean;
  }
}

export const API_BASE = getApiBase();

export const apiClient = axios.create({
  baseURL: API_BASE
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("butce_token");
  if (token) {
    const headers: any = config.headers ?? {};
    if (!headers.Authorization && !headers.authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
    config.headers = headers;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.config?.suppressGlobalError) {
      return Promise.reject(error);
    }

    const status = error?.response?.status;
    const fallbackMessage =
      error?.message === "Network Error"
        ? "Sunucuya ulaşılamadı. API bağlantısı veya CORS ayarı kontrol edilmeli."
        : error?.message;
    const detail =
      error?.response?.data?.detail ??
      error?.response?.data?.message ??
      fallbackMessage ??
      "Beklenmedik bir hata oluştu.";
    if (detail) {
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

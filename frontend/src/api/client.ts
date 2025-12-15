import axios from "axios";

const DEFAULT_API_PORT = "8001";
const FALLBACK_API_URL = `http://localhost:${DEFAULT_API_PORT}`;

const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const legacyApiUrl = import.meta.env.VITE_API_URL?.trim();

function resolveApiUrl() {
  const configuredUrl = envApiBaseUrl || legacyApiUrl;

  if (configuredUrl) {
    try {
      const url = new URL(configuredUrl);
      const isLocalHost = ["localhost", "127.0.0.1"].includes(url.hostname);

      if (typeof window !== "undefined") {
        const currentHostIsLocal = ["localhost", "127.0.0.1"].includes(
          window.location.hostname
        );

        // Eğer env'de localhost/127.0.0.1 yazılıysa ama sayfaya uzak bir IP/hostname
        // üzerinden giriyorsak (ör: 172.24.2.194:5173), backend'in o host üzerinde
        // DEFAULT_API_PORT (8001) portunda çalıştığını varsay:
        if (isLocalHost && !currentHostIsLocal) {
          const port = url.port || DEFAULT_API_PORT;
          return `${window.location.protocol}//${window.location.hostname}:${port}`;
        }
      }

      // Geçerli bir URL ise sonundaki / işaretini temizleyip aynen kullan
      return url.toString().replace(/\/$/, "");
    } catch (error) {
      console.warn("API_URL could not be parsed, falling back to defaults", error);
    }
  }

  // Buraya düştüysek: env'den düzgün bir URL gelmedi.
  // Vite dev/preview ortamında isek localhost:8001 kullan.
  const isViteClient =
    typeof window !== "undefined" &&
    ["5173", "4173", "4174"].includes(window.location?.port ?? "");

  if (import.meta.env.DEV || isViteClient) {
    return FALLBACK_API_URL;
  }

  // Production: backend'in aynı host üzerinde 8001 portunda çalıştığını varsay.
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_API_PORT}`;
  }

  // Tarayıcı yoksa (SSR vb.) en güvenli fallback
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

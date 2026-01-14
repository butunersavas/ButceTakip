export function getApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1";

  if (envBase && isLocal) return envBase;

  if (envBase && !isLocal && envBase.includes("localhost")) {
    return `${window.location.protocol}//${host}:8000/api`;
  }

  return envBase || `${window.location.protocol}//${host}:8000/api`;
}

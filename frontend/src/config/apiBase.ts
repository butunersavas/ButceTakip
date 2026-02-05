export function getApiBase(): string {
  const envBase = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE as string | undefined)
  )?.trim();
  if (envBase) {
    return envBase;
  }
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (port === "5173" || port === "4173") {
      return `${protocol}//${hostname}:8000/api`;
    }
  }
  return "/api";
}

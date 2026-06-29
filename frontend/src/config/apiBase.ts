export function getApiBase(): string {
  const envBase = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE as string | undefined)
  )?.trim();
  const configuredBase = envBase || "/api";
  if (
    configuredBase === "/api" &&
    typeof window !== "undefined" &&
    window.location.port === "5173"
  ) {
    return `${window.location.protocol}//${window.location.hostname}:8000/api`;
  }
  return configuredBase;
}

export function getApiBase(): string {
  const envBase = (
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
    (import.meta.env.VITE_API_BASE as string | undefined)
  )?.trim();
  return envBase || "/api";
}

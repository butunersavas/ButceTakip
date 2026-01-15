export function getApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  return envBase || "/api";
}

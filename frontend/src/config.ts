const deriveDefaultApiUrl = () => {
  if (typeof window === "undefined") {
    return "http://localhost:8000";
  }

  const protocol = window.location.protocol === "https:" ? "https" : "http";
  const hostname = window.location.hostname || "localhost";

  return `${protocol}://${hostname}:8000`;
};

export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? deriveDefaultApiUrl();


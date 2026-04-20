export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  if (import.meta.env.DEV) return "http://localhost:3001/api";

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (origin) return `${origin}/api`;

  return "/api";
}

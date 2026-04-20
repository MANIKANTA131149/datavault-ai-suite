export function getApiBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL;
  if (!configuredUrl) {
    throw new Error("VITE_API_URL is required. Set it to your backend URL.");
  }

  return configuredUrl.replace(/\/$/, "");
}

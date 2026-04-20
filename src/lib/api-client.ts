function getBaseUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL;
  if (!configuredUrl) {
    throw new Error("VITE_API_URL is required. Set it to your backend URL, for example http://localhost:3001/api or https://datavault-ai-suite.onrender.com/api.");
  }

  return configuredUrl.replace(/\/$/, "");
}

const BASE_URL = getBaseUrl();

/** Pull the JWT from the persisted auth store in localStorage */
function getToken(): string | null {
  try {
    const raw = localStorage.getItem("datavault-auth");
    if (!raw) return null;
    return JSON.parse(raw)?.state?.token ?? null;
  } catch {
    return null;
  }
}

async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body?.error ?? "Request failed");
  }

  return res.json() as Promise<T>;
}



export const api = {
  get: <T = unknown>(path: string) =>
    apiFetch<T>(path, { method: "GET" }),

  post: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) }),

  put: <T = unknown>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) }),

  delete: <T = unknown>(path: string) =>
    apiFetch<T>(path, { method: "DELETE" }),
};

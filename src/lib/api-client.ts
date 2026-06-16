import { getApiBaseUrl } from "@/lib/api-base";

const BASE_URL = getApiBaseUrl();

let unauthorizedDispatched = false;

// Reset after sign-in so the 401 guard fires again in the new session
window.addEventListener("datavault:session-start", () => { unauthorizedDispatched = false; });

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
    const text = await res.text();
    const body = (() => {
      try {
        return JSON.parse(text || "{}");
      } catch {
        return { error: text || res.statusText };
      }
    })();

    // Only treat 401 as an expired/invalid session token signal.
    // Do NOT auto-logout on 403 because it may be a permissions/RBAC error.
    if (!unauthorizedDispatched && res.status === 401) {
      const msg = String(body?.error ?? body?.message ?? "").toLowerCase();
      const looksLikeTokenIssue =
        msg.includes("token") || msg.includes("jwt") || msg.includes("expired") || msg.includes("unauthorized");

      if (looksLikeTokenIssue || !msg) {
        unauthorizedDispatched = true;
        window.dispatchEvent(
          new CustomEvent("datavault:unauthorized", {
            detail: { status: res.status, path, message: body?.error ?? body?.message ?? "" },
          })
        );
      }
    }

    throw new Error(body?.error ?? body?.message ?? "Request failed");
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

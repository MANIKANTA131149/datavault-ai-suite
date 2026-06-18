// ─── Live Events Client (F6) ──────────────────────────────────────────────────
// Subscribes to the server's SSE stream (/api/events/stream) for instant
// notification pushes (scheduled runs, alerts firing, PII warnings). Behind
// Lambda + API Gateway the stream gets buffered and dies quickly — that's
// detected and treated as "SSE unavailable", in which case this module simply
// does nothing and the app's existing polling keeps working. Pure enhancement,
// zero regression risk.

import { getApiBaseUrl } from "@/lib/api-base";

export interface ServerNotificationEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  icon?: string;
  link?: string;
  createdAt: string;
}

type Listener = (event: ServerNotificationEvent) => void;

const RECONNECT_BASE_MS = 5_000;
const MAX_FAILURES_BEFORE_GIVE_UP = 3;

let source: EventSource | null = null;
let listeners = new Set<Listener>();
let failures = 0;
let gaveUp = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getToken(): string | null {
  try {
    const raw = localStorage.getItem("datavault-auth");
    if (!raw) return null;
    return JSON.parse(raw)?.state?.token ?? null;
  } catch {
    return null;
  }
}

// SSE requires a long-lived HTTP response. Lambda + API Gateway buffers and
// caps responses, returning a 503 (with no CORS header → a noisy console error)
// instead of streaming. Detect that environment up front and skip SSE entirely
// — the app's polling already covers notifications there. We only attempt SSE
// against a real long-lived server (localhost dev / self-hosted).
function environmentSupportsSSE(): boolean {
  try {
    const base = getApiBaseUrl();
    const { hostname } = new URL(base, window.location.origin);
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    // Managed serverless gateways that buffer responses — never stream here.
    if (/execute-api\.[a-z0-9-]+\.amazonaws\.com$/i.test(hostname)) return false;
    if (hostname.endsWith(".lambda-url.amazonaws.com")) return false;
    return true; // a normal long-lived server (EC2, container, self-hosted)
  } catch {
    return false;
  }
}

function connect(): void {
  if (gaveUp || source || listeners.size === 0) return;
  if (!environmentSupportsSSE()) { gaveUp = true; return; }
  const token = getToken();
  if (!token || typeof EventSource === "undefined") return;

  try {
    source = new EventSource(`${getApiBaseUrl()}/events/stream?token=${encodeURIComponent(token)}`);
  } catch {
    gaveUp = true;
    return;
  }

  source.addEventListener("connected", () => {
    failures = 0;
  });

  source.addEventListener("notification", (e) => {
    try {
      const data = JSON.parse((e as MessageEvent).data) as ServerNotificationEvent;
      for (const fn of listeners) fn(data);
    } catch {
      /* malformed event — ignore */
    }
  });

  source.onerror = () => {
    source?.close();
    source = null;
    failures++;
    if (failures >= MAX_FAILURES_BEFORE_GIVE_UP) {
      // Environment doesn't support SSE (buffered Lambda responses) — stop
      // trying for this session; polling covers everything.
      gaveUp = true;
      return;
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, RECONNECT_BASE_MS * failures);
  };
}

/**
 * Subscribe to live server notifications. Returns an unsubscribe function.
 * Safe to call in any environment — silently inert when SSE is unavailable.
 */
export function subscribeToServerEvents(listener: Listener): () => void {
  listeners.add(listener);
  connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
    }
  };
}

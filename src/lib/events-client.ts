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

function connect(): void {
  if (gaveUp || source || listeners.size === 0) return;
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

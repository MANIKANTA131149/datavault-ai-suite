import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/react";
import { useAuthStore } from "@/stores/auth-store";

// Bridges Clerk's session into our Zustand auth-store.
//
// Lifecycle:
//   sign-in  → getToken() → POST /auth/me → hydrate store → dispatch session-start
//   sign-out → clear store
//   token expiry → Clerk auto-refreshes; we pick it up on next refresh tick
//   profile change (name/email) → synced to store on next hydration

const REFRESH_INTERVAL_MS  = 50_000; // refresh token every 50 s (Clerk TTL ~60 s)
const HYDRATION_RETRY_MS   = 3_000;  // retry /auth/me after this delay on failure
const MAX_RETRIES           = 4;

export function ClerkAuthBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const { hydrateFromClerk, logout, user: storeUser } = useAuthStore();

  const hydratedRef     = useRef<string | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef   = useRef(0);

  // ── Core hydration: fetch token → /auth/me → populate store ──────────────
  const hydrate = async (clerkId: string, isNew = false): Promise<boolean> => {
    try {
      const token = await getToken();
      if (!token) return false;
      await hydrateFromClerk(token, isNew);
      hydratedRef.current = clerkId;
      retryCountRef.current = 0;
      // Signal api-client to reset its 401 guard for the new session
      window.dispatchEvent(new CustomEvent("datavault:session-start"));
      return true;
    } catch (err: any) {
      console.error("ClerkAuthBridge hydration error:", err?.message);
      return false;
    }
  };

  // ── Retry hydration with back-off on failure ───────────────────────────────
  const scheduleRetry = (clerkId: string, isNew: boolean) => {
    if (retryCountRef.current >= MAX_RETRIES) return;
    retryCountRef.current += 1;
    const delay = HYDRATION_RETRY_MS * retryCountRef.current;
    retryTimerRef.current = setTimeout(async () => {
      if (hydratedRef.current === clerkId) return; // already succeeded
      const ok = await hydrate(clerkId, isNew);
      if (!ok) scheduleRetry(clerkId, isNew);
    }, delay);
  };

  // ── Token refresh loop ────────────────────────────────────────────────────
  const startRefreshTimer = (clerkId: string) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(async () => {
      try {
        const token = await getToken({ skipCache: true });
        if (token) useAuthStore.setState((s) => ({ ...s, token }));
      } catch {
        // Session ended — ClerkAuthBridge useEffect will handle sign-out
      }
    }, REFRESH_INTERVAL_MS);
  };

  const stopTimers = () => {
    if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null; }
    if (retryTimerRef.current)   { clearTimeout(retryTimerRef.current);    retryTimerRef.current   = null; }
  };

  // ── Main effect: react to Clerk session changes ───────────────────────────
  useEffect(() => {
    if (!isLoaded || !userLoaded) return;

    if (!isSignedIn) {
      // Clerk session ended — clear local store
      if (storeUser) logout();
      hydratedRef.current = null;
      retryCountRef.current = 0;
      stopTimers();
      return;
    }

    const clerkId = clerkUser?.id;
    if (!clerkId) return;

    const isNew = Boolean(
      clerkUser?.createdAt &&
      Date.now() - new Date(clerkUser.createdAt).getTime() < 30_000
    );

    if (hydratedRef.current !== clerkId) {
      // New session — hydrate then start refresh loop
      void (async () => {
        const ok = await hydrate(clerkId, isNew);
        if (!ok) scheduleRetry(clerkId, isNew);
        startRefreshTimer(clerkId);
      })();
    } else if (storeUser) {
      // Already hydrated — sync name/email drift from Clerk profile
      const clerkName  = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
                         clerkUser.emailAddresses?.[0]?.emailAddress?.split("@")[0] || "";
      const clerkEmail = clerkUser.primaryEmailAddress?.emailAddress || "";
      const nameDrifted  = clerkName  && clerkName  !== storeUser.name;
      const emailDrifted = clerkEmail && clerkEmail !== storeUser.email;
      if (nameDrifted || emailDrifted) void hydrate(clerkId, false);
    }
  }, [isLoaded, userLoaded, isSignedIn, clerkUser?.id, clerkUser?.firstName, clerkUser?.lastName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => () => stopTimers(), []);

  return null;
}

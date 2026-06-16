import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getApiBaseUrl } from "@/lib/api-base";
import type { PlanTier } from "@/lib/plans";

const API = getApiBaseUrl();

export type UserRole = "admin" | "analyst" | "viewer";

interface User {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  role: UserRole;
  planTier: PlanTier;
  planStatus: string;
  ownPlanTier: PlanTier;
  organizationId: string;
  organizationOwnerId: string;
  planOwnerId: string;
  isPlanOwner: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isFirstLogin: boolean;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  hydrateFromClerk: (clerkToken: string, isNew?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  setFirstLoginDone: () => void;
  updateUserName: (name: string) => void;
  updateUserRole: (role: UserRole) => void;
  updateUserPlan: (planTier: PlanTier, planStatus?: string) => void;
  hydrateRole: () => Promise<void>;
  isAdmin: () => boolean;
  isAnalyst: () => boolean;
  canQuery: () => boolean;
  canUpload: () => boolean;
  canManageUsers: () => boolean;
  canAccessAdmin: () => boolean;
}

function buildInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isFirstLogin: false,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      // Called by ClerkAuthBridge whenever Clerk has an active session.
      // Stores the Clerk token, then calls /auth/me which lazily creates the Mongo user.
      hydrateFromClerk: async (clerkToken: string, isNew = false) => {
        const res = await fetch(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${clerkToken}` },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Auth failed" }));
          throw new Error(err.error ?? "Failed to authenticate");
        }
        const user = await res.json();
        set({
          token: clerkToken,
          user: {
            name: user.name,
            email: user.email,
            id: user.id || "",
            avatarInitials: buildInitials(user.name || "U"),
            role: user.role || "viewer",
            planTier: user.planTier || "free",
            planStatus: user.planStatus || "active",
            ownPlanTier: user.ownPlanTier || user.planTier || "free",
            organizationId: user.organizationId || user.id || "",
            organizationOwnerId: user.organizationOwnerId || user.id || "",
            planOwnerId: user.planOwnerId || user.organizationOwnerId || user.id || "",
            isPlanOwner: Boolean(user.isPlanOwner ?? true),
          },
          isFirstLogin: isNew,
        });
      },

      // Clears local session only — Clerk handles the actual sign-out
      logout: async () => {
        try {
          const { useLLMStore } = await import("./llm-store");
          useLLMStore.getState().clearProviderConfigs();
        } catch {
          // ignore
        }
        try {
          const { useSettingsStore } = await import("./settings-store");
          useSettingsStore.setState({
            selectedDatasetId: "",
            selectedSheet: "",
            selectedTable: "",
          });
        } catch {}
        set({ user: null, token: null, isFirstLogin: false });
      },

      setFirstLoginDone: () => set({ isFirstLogin: false }),

      updateUserName: (name: string) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, name, avatarInitials: buildInitials(name) } });
      },

      updateUserRole: (role: UserRole) => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, role } });
      },

      updateUserPlan: (planTier: PlanTier, planStatus = "active") => {
        const u = get().user;
        if (!u) return;
        set({ user: { ...u, planTier, planStatus } });
      },

      // Fetches fresh role/plan from server — called after admin changes
      hydrateRole: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const res = await fetch(`${API}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const u = get().user;
            if (u && data.role) {
              set({
                user: {
                  ...u,
                  role: data.role,
                  planTier: data.planTier || u.planTier || "free",
                  planStatus: data.planStatus || u.planStatus || "active",
                  ownPlanTier: data.ownPlanTier || u.ownPlanTier || data.planTier || "free",
                  organizationId: data.organizationId || u.organizationId,
                  organizationOwnerId: data.organizationOwnerId || u.organizationOwnerId,
                  planOwnerId: data.planOwnerId || u.planOwnerId,
                  isPlanOwner: Boolean(data.isPlanOwner ?? u.isPlanOwner),
                },
              });
            }
          }
        } catch {
          // ignore — will use cached role
        }
      },

      // ─── RBAC Permission Helpers ──────────────────────────────────────────────
      isAdmin: () => get().user?.role === "admin",
      isAnalyst: () => get().user?.role === "analyst" || get().user?.role === "admin",
      // viewer = regular signed-in user, can query and upload within plan limits
      canQuery: () => Boolean(get().user),
      canUpload: () => Boolean(get().user),
      canManageUsers: () => get().user?.role === "admin",
      canAccessAdmin: () => {
        const u = get().user;
        return Boolean(u?.isPlanOwner && ["standard", "professional", "enterprise"].includes(u.planTier));
      },
    }),
    {
      name: "datavault-auth",
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isFirstLogin: state.isFirstLogin,
      }),
      onRehydrateStorage: () => (state, error) => {
        // state can be undefined when localStorage key is absent or corrupt.
        // Either way, mark hydration complete so AppLayout doesn't spin forever.
        if (state) {
          state.setHasHydrated(true);
        }
        // Fallback: set directly on the store instance after it's created.
        // Zustand calls this callback synchronously after create(), so the
        // instance is available via the closure reference set below.
        setTimeout(() => {
          const s = useAuthStore.getState();
          if (!s.hasHydrated) s.setHasHydrated(true);
        }, 0);
      },
    }
  )
);

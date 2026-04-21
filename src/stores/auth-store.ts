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
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
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

      // ─── Sign In ───────────────────────────────────────────────────────────
      login: async (email: string, password: string) => {
        const res = await fetch(`${API}/auth/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Login failed" }));
          throw new Error(err.error ?? "Login failed");
        }
        const { token, user } = await res.json();
        set({
          token,
          user: {
            name: user.name,
            email: user.email,
            id: user.id || "",
            avatarInitials: buildInitials(user.name),
            role: user.role || "viewer",
            planTier: user.planTier || "free",
            planStatus: user.planStatus || "active",
            ownPlanTier: user.ownPlanTier || user.planTier || "free",
            organizationId: user.organizationId || user.id || "",
            organizationOwnerId: user.organizationOwnerId || user.id || "",
            planOwnerId: user.planOwnerId || user.organizationOwnerId || user.id || "",
            isPlanOwner: Boolean(user.isPlanOwner ?? true),
          },
          isFirstLogin: false,
        });
      },

      // ─── Sign Up ───────────────────────────────────────────────────────────
      signup: async (name: string, email: string, password: string) => {
        const res = await fetch(`${API}/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Signup failed" }));
          throw new Error(err.error ?? "Signup failed");
        }
        const { token, user } = await res.json();
        set({
          token,
          user: {
            name: user.name,
            email: user.email,
            id: user.id || "",
            avatarInitials: buildInitials(user.name),
            role: user.role || "viewer",
            planTier: user.planTier || "free",
            planStatus: user.planStatus || "active",
            ownPlanTier: user.ownPlanTier || user.planTier || "free",
            organizationId: user.organizationId || user.id || "",
            organizationOwnerId: user.organizationOwnerId || user.id || "",
            planOwnerId: user.planOwnerId || user.organizationOwnerId || user.id || "",
            isPlanOwner: Boolean(user.isPlanOwner ?? true),
          },
          isFirstLogin: true,
        });
      },

      // ─── Logout — clears local session only; all data stays in MongoDB ────────
      logout: async () => {
        const token = get().token;
        if (token) {
          try {
            await fetch(`${API}/auth/signout`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });
          } catch {
            // Ignore network errors on logout
          }
        }
        try {
          const { useLLMStore } = await import("./llm-store");
          useLLMStore.getState().clearProviderConfigs();
        } catch {
          // Ignore store cleanup errors on logout
        }
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

      // Fetch fresh role from server (handles role changes by admin)
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
          // Ignore — will use cached role
        }
      },

      // ─── RBAC Permission Helpers ───────────────────────────────────────────
      isAdmin: () => get().user?.role === "admin",
      isAnalyst: () => get().user?.role === "analyst" || get().user?.role === "admin",
      canQuery: () => {
        const role = get().user?.role;
        return role === "admin" || role === "analyst";
      },
      canUpload: () => {
        const role = get().user?.role;
        return role === "admin" || role === "analyst";
      },
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
    }
  )
);

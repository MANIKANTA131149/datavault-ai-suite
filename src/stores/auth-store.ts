import { create } from "zustand";
import { persist } from "zustand/middleware";

const API = "http://localhost:3001/api";

export type UserRole = "admin" | "analyst" | "viewer";

interface User {
  name: string;
  email: string;
  avatarInitials: string;
  role: UserRole;
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
  hydrateRole: () => Promise<void>;
  isAdmin: () => boolean;
  isAnalyst: () => boolean;
  canQuery: () => boolean;
  canUpload: () => boolean;
  canManageUsers: () => boolean;
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
            avatarInitials: buildInitials(user.name),
            role: user.role || "viewer",
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
            avatarInitials: buildInitials(user.name),
            role: user.role || "viewer",
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
              set({ user: { ...u, role: data.role } });
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

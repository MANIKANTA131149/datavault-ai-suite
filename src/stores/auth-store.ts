import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
  name: string;
  email: string;
  avatarInitials: string;
}

interface AuthState {
  user: User | null;
  isFirstLogin: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  setFirstLoginDone: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isFirstLogin: false,
      login: async (email: string, _password: string) => {
        await new Promise((r) => setTimeout(r, 800));
        const name = email.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        set({
          user: {
            name,
            email,
            avatarInitials: name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
          },
        });
      },
      signup: async (name: string, email: string, _password: string) => {
        await new Promise((r) => setTimeout(r, 800));
        set({
          user: {
            name,
            email,
            avatarInitials: name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
          },
          isFirstLogin: true,
        });
      },
      logout: () => {
        set({ user: null, isFirstLogin: false });
        localStorage.removeItem("datavault-datasets");
        localStorage.removeItem("datavault-history");
      },
      setFirstLoginDone: () => set({ isFirstLogin: false }),
    }),
    { name: "datavault-auth" }
  )
);

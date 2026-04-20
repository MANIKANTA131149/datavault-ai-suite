import { create } from "zustand";
import { api } from "@/lib/api-client";

export interface Notification {
  id: string;
  userId: string;
  type: "dataset_upload" | "query_complete" | "admin_action" | "alert" | "system";
  title: string;
  message: string;
  icon: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const notifications = await api.get<Notification[]>("/notifications");
      const unreadCount = notifications.filter((n) => !n.read).length;
      set({ notifications, unreadCount });
    } catch (err) {
      console.error("fetchNotifications:", err);
    } finally {
      set({ loading: false });
    }
  },

  markRead: async (id: string) => {
    try {
      await api.put(`/notifications/${id}/read`, {});
      set((state) => ({
        notifications: state.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (err) {
      console.error("markRead:", err);
    }
  },

  markAllRead: async () => {
    try {
      await api.put("/notifications/read-all", {});
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      console.error("markAllRead:", err);
    }
  },

  dismiss: async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      set((state) => {
        const n = state.notifications.find((x) => x.id === id);
        return {
          notifications: state.notifications.filter((x) => x.id !== id),
          unreadCount: n && !n.read ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
        };
      });
    } catch (err) {
      console.error("dismiss:", err);
    }
  },

  clearAll: async () => {
    try {
      await api.delete("/notifications");
      set({ notifications: [], unreadCount: 0 });
    } catch (err) {
      console.error("clearAll:", err);
    }
  },
}));

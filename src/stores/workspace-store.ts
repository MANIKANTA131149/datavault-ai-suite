import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BrandAccent = "blue" | "emerald" | "amber" | "rose";

export interface InsightBoard {
  id: string;
  name: string;
  description: string;
  color: BrandAccent;
  insightIds: string[];
  createdAt: string;
}

export interface SavedQuerySession {
  id: string;
  title: string;
  datasetId: string;
  datasetName: string;
  lastQuery: string;
  messageCount: number;
  finalResult: any;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceState {
  presentationMode: boolean;
  brandName: string;
  brandTagline: string;
  brandAccent: BrandAccent;
  showProviderBadge: boolean;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  leftPanelSize: number;
  centerPanelSize: number;
  rightPanelSize: number;
  pinnedHistoryIds: string[];
  boards: InsightBoard[];
  savedSessions: SavedQuerySession[];
  compareHistoryIds: string[];

  setPresentationMode: (value: boolean) => void;
  setBranding: (patch: Partial<Pick<WorkspaceState, "brandName" | "brandTagline" | "brandAccent" | "showProviderBadge">>) => void;
  setPanelLayout: (patch: Partial<Pick<WorkspaceState, "leftPanelCollapsed" | "rightPanelCollapsed" | "leftPanelSize" | "centerPanelSize" | "rightPanelSize">>) => void;
  togglePinnedHistory: (id: string) => void;
  setCompareHistoryIds: (ids: string[]) => void;
  addBoard: (board: Omit<InsightBoard, "id" | "createdAt" | "insightIds">) => string;
  updateBoard: (id: string, patch: Partial<Pick<InsightBoard, "name" | "description" | "color">>) => void;
  removeBoard: (id: string) => void;
  assignInsightToBoard: (boardId: string, insightId: string) => void;
  removeInsightFromBoard: (boardId: string, insightId: string) => void;
  saveQuerySession: (session: Omit<SavedQuerySession, "id" | "createdAt" | "updatedAt"> & { id?: string }) => string;
  removeQuerySession: (id: string) => void;
}

function uniqueIds(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      presentationMode: false,
      brandName: "DataVault Agent",
      brandTagline: "Enterprise data conversations",
      brandAccent: "blue",
      showProviderBadge: true,
      leftPanelCollapsed: false,
      rightPanelCollapsed: false,
      leftPanelSize: 21,
      centerPanelSize: 46,
      rightPanelSize: 33,
      pinnedHistoryIds: [],
      boards: [
        {
          id: crypto.randomUUID(),
          name: "Executive Briefing",
          description: "Client-facing highlights and polished results",
          color: "blue",
          insightIds: [],
          createdAt: new Date().toISOString(),
        },
      ],
      savedSessions: [],
      compareHistoryIds: [],

      setPresentationMode: (value) => set({ presentationMode: value }),
      setBranding: (patch) => set((state) => ({ ...patch, brandName: patch.brandName ?? state.brandName, brandTagline: patch.brandTagline ?? state.brandTagline, brandAccent: patch.brandAccent ?? state.brandAccent, showProviderBadge: patch.showProviderBadge ?? state.showProviderBadge })),
      setPanelLayout: (patch) => set((state) => ({ ...patch, leftPanelCollapsed: patch.leftPanelCollapsed ?? state.leftPanelCollapsed, rightPanelCollapsed: patch.rightPanelCollapsed ?? state.rightPanelCollapsed, leftPanelSize: patch.leftPanelSize ?? state.leftPanelSize, centerPanelSize: patch.centerPanelSize ?? state.centerPanelSize, rightPanelSize: patch.rightPanelSize ?? state.rightPanelSize })),
      togglePinnedHistory: (id) =>
        set((state) => ({
          pinnedHistoryIds: state.pinnedHistoryIds.includes(id)
            ? state.pinnedHistoryIds.filter((item) => item !== id)
            : [id, ...state.pinnedHistoryIds],
        })),
      setCompareHistoryIds: (ids) => set({ compareHistoryIds: uniqueIds(ids).slice(0, 2) }),
      addBoard: (board) => {
        const nextId = crypto.randomUUID();
        set((state) => ({
          boards: [
            {
              id: nextId,
              createdAt: new Date().toISOString(),
              insightIds: [],
              ...board,
            },
            ...state.boards,
          ],
        }));
        return nextId;
      },
      updateBoard: (id, patch) =>
        set((state) => ({
          boards: state.boards.map((board) => (board.id === id ? { ...board, ...patch } : board)),
        })),
      removeBoard: (id) =>
        set((state) => ({
          boards: state.boards.filter((board) => board.id !== id),
        })),
      assignInsightToBoard: (boardId, insightId) =>
        set((state) => ({
          boards: state.boards.map((board) =>
            board.id === boardId ? { ...board, insightIds: uniqueIds([insightId, ...board.insightIds]) } : board
          ),
        })),
      removeInsightFromBoard: (boardId, insightId) =>
        set((state) => ({
          boards: state.boards.map((board) =>
            board.id === boardId ? { ...board, insightIds: board.insightIds.filter((id) => id !== insightId) } : board
          ),
        })),
      saveQuerySession: (session) => {
        const nextId = session.id || crypto.randomUUID();
        const createdAt = new Date().toISOString();
        set((state) => {
          const existing = state.savedSessions.find((item) => item.id === nextId);
          const payload: SavedQuerySession = {
            id: nextId,
            createdAt: existing?.createdAt || createdAt,
            updatedAt: createdAt,
            ...session,
          };
          return {
            savedSessions: [payload, ...state.savedSessions.filter((item) => item.id !== nextId)].slice(0, 24),
          };
        });
        return nextId;
      },
      removeQuerySession: (id) =>
        set((state) => ({
          savedSessions: state.savedSessions.filter((session) => session.id !== id),
        })),
    }),
    {
      name: "datavault-workspace",
      partialize: (state) => ({
        presentationMode: state.presentationMode,
        brandName: state.brandName,
        brandTagline: state.brandTagline,
        brandAccent: state.brandAccent,
        showProviderBadge: state.showProviderBadge,
        leftPanelCollapsed: state.leftPanelCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
        leftPanelSize: state.leftPanelSize,
        centerPanelSize: state.centerPanelSize,
        rightPanelSize: state.rightPanelSize,
        pinnedHistoryIds: state.pinnedHistoryIds,
        boards: state.boards,
        savedSessions: state.savedSessions,
        compareHistoryIds: state.compareHistoryIds,
      }),
    },
  ),
);

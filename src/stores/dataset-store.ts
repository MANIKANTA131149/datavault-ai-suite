import { create } from "zustand";
import { api } from "@/lib/api-client";
import type { ParsedFile } from "@/lib/file-parser";

export interface StoredDataset {
  id: string;
  fileName: string;
  fileType: "csv" | "xlsx" | "xls";
  sheetNames: string[];
  rowCounts: Record<string, number>;
  columnCounts: Record<string, number>;
  uploadDate: string;
  data?: ParsedFile; // in-memory cache — loaded lazily from MongoDB when needed
}

// Module-level in-memory cache for parsed file data (avoids redundant fetches)
const dataCache = new Map<string, ParsedFile>();

interface DatasetState {
  datasets: StoredDataset[];
  loading: boolean;
  /** Load dataset metadata list from MongoDB (called after login) */
  fetchDatasets: () => Promise<void>;
  addDataset: (file: ParsedFile) => Promise<string>;
  removeDataset: (id: string) => Promise<void>;
  getDataset: (id: string) => StoredDataset | undefined;
  /** Lazily fetch full file content from MongoDB for a specific dataset */
  loadDatasetData: (id: string) => Promise<ParsedFile | null>;
  /** Clear in-memory state on logout (MongoDB data stays intact) */
  clearDatasets: () => void;
}

export const useDatasetStore = create<DatasetState>()((set, get) => ({
  datasets: [],
  loading: false,

  // ─── Fetch metadata list from MongoDB ──────────────────────────────────────
  fetchDatasets: async () => {
    set({ loading: true });
    try {
      const remote = await api.get<StoredDataset[]>("/datasets");
      // Merge with any in-memory data we already have for this session
      const merged = remote.map((ds) => ({
        ...ds,
        data: dataCache.get(ds.id),
      }));
      set({ datasets: merged });
    } catch (err) {
      console.error("fetchDatasets:", err);
    } finally {
      set({ loading: false });
    }
  },

  // ─── Lazy-load full file content for a dataset ─────────────────────────────
  loadDatasetData: async (id: string): Promise<ParsedFile | null> => {
    // Return from cache if already loaded this session
    if (dataCache.has(id)) return dataCache.get(id)!;

    try {
      const fileData = await api.get<ParsedFile>(`/datasets/${id}/data`);
      dataCache.set(id, fileData);
      // Update the in-memory store entry too
      set((state) => ({
        datasets: state.datasets.map((ds) =>
          ds.id === id ? { ...ds, data: fileData } : ds
        ),
      }));
      return fileData;
    } catch (err) {
      console.error(`loadDatasetData(${id}):`, err);
      return null;
    }
  },

  // ─── Upload: parse locally, persist metadata + file content to MongoDB ─────
  addDataset: async (file: ParsedFile) => {
    const id = crypto.randomUUID();
    const rowCounts: Record<string, number> = {};
    const columnCounts: Record<string, number> = {};
    for (const [sheet, data] of Object.entries(file.sheets)) {
      rowCounts[sheet] = data.rows.length;
      columnCounts[sheet] = data.columns.length;
    }

    // Put in memory cache immediately
    dataCache.set(id, file);

    const dataset: StoredDataset = {
      id,
      fileName: file.fileName,
      fileType: file.fileType,
      sheetNames: Object.keys(file.sheets),
      rowCounts,
      columnCounts,
      uploadDate: new Date().toISOString(),
      data: file,
    };

    // Optimistic UI update
    set((state) => ({ datasets: [dataset, ...state.datasets] }));

    // Persist metadata + full file content to MongoDB
    try {
      await api.post("/datasets", {
        id,
        fileName: dataset.fileName,
        fileType: dataset.fileType,
        sheetNames: dataset.sheetNames,
        rowCounts,
        columnCounts,
        uploadDate: dataset.uploadDate,
        fileData: file, // full parsed content — stored in MongoDB
      });
    } catch (err) {
      console.error("Failed to save dataset to MongoDB:", err);
      // Dataset still works in-memory for this session even if persistence failed
    }

    return id;
  },

  // ─── Delete ────────────────────────────────────────────────────────────────
  removeDataset: async (id: string) => {
    dataCache.delete(id);
    set((state) => ({ datasets: state.datasets.filter((d) => d.id !== id) }));
    try {
      await api.delete(`/datasets/${id}`);
    } catch (err) {
      console.error("Failed to delete dataset from MongoDB:", err);
    }
  },

  // ─── Get with in-memory data — triggers lazy load if needed ────────────────
  getDataset: (id: string) => {
    const ds = get().datasets.find((d) => d.id === id);
    if (!ds) return undefined;
    const cached = dataCache.get(id);
    if (cached) return { ...ds, data: cached };
    // Trigger background lazy load (async — caller may need to wait)
    get().loadDatasetData(id);
    return ds;
  },

  clearDatasets: () => {
    dataCache.clear();
    set({ datasets: [] });
  },
}));

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParsedFile } from "@/lib/file-parser";

export interface StoredDataset {
  id: string;
  fileName: string;
  fileType: "csv" | "xlsx" | "xls";
  sheetNames: string[];
  rowCounts: Record<string, number>;
  columnCounts: Record<string, number>;
  uploadDate: string;
  data: ParsedFile;
}

interface DatasetState {
  datasets: StoredDataset[];
  addDataset: (file: ParsedFile) => string;
  removeDataset: (id: string) => void;
  getDataset: (id: string) => StoredDataset | undefined;
}

export const useDatasetStore = create<DatasetState>()(
  persist(
    (set, get) => ({
      datasets: [],
      addDataset: (file: ParsedFile) => {
        const id = crypto.randomUUID();
        const rowCounts: Record<string, number> = {};
        const columnCounts: Record<string, number> = {};
        for (const [sheet, data] of Object.entries(file.sheets)) {
          rowCounts[sheet] = data.rows.length;
          columnCounts[sheet] = data.columns.length;
        }
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
        set((state) => ({ datasets: [...state.datasets, dataset] }));
        return id;
      },
      removeDataset: (id: string) =>
        set((state) => ({ datasets: state.datasets.filter((d) => d.id !== id) })),
      getDataset: (id: string) => get().datasets.find((d) => d.id === id),
    }),
    { name: "datavault-datasets" }
  )
);

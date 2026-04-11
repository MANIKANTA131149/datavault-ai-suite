import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ColumnInfo {
  name: string;
  dtype: "string" | "number" | "date" | "boolean";
  nonNullCount: number;
  uniqueCount: number;
  sampleValues: any[];
}

export interface SheetData {
  columns: ColumnInfo[];
  rows: Record<string, any>[];
}

export interface ParsedFile {
  fileName: string;
  fileType: "csv" | "xlsx" | "xls";
  sheets: Record<string, SheetData>;
}

function detectDtype(values: any[]): ColumnInfo["dtype"] {
  const nonNull = values.filter((v) => v != null && v !== "");
  if (nonNull.length === 0) return "string";

  let numCount = 0, boolCount = 0, dateCount = 0;
  for (const v of nonNull.slice(0, 100)) {
    if (typeof v === "boolean") boolCount++;
    else if (typeof v === "number" || (!isNaN(Number(v)) && v !== "")) numCount++;
    else if (v instanceof Date || (!isNaN(Date.parse(String(v))) && String(v).length > 4 && /\d{4}/.test(String(v)))) dateCount++;
  }

  const sample = nonNull.slice(0, 100).length;
  if (boolCount > sample * 0.8) return "boolean";
  if (numCount > sample * 0.8) return "number";
  if (dateCount > sample * 0.8) return "date";
  return "string";
}

function buildColumnInfo(rows: Record<string, any>[]): ColumnInfo[] {
  if (rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((name) => {
    const values = rows.map((r) => r[name]);
    const nonNull = values.filter((v) => v != null && v !== "");
    const unique = new Set(nonNull);
    return {
      name,
      dtype: detectDtype(values),
      nonNullCount: nonNull.length,
      uniqueCount: unique.size,
      sampleValues: nonNull.slice(0, 5),
    };
  });
}

export function parseCSV(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as Record<string, any>[];
        resolve({
          fileName: file.name,
          fileType: "csv",
          sheets: {
            Sheet1: { columns: buildColumnInfo(rows), rows },
          },
        });
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`)),
    });
  });
}

export function parseExcel(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheets: Record<string, SheetData> = {};
        for (const name of workbook.SheetNames) {
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[name]);
          sheets[name] = { columns: buildColumnInfo(rows), rows };
        }
        resolve({
          fileName: file.name,
          fileType: file.name.endsWith(".xlsx") ? "xlsx" : "xls",
          sheets,
        });
      } catch (err: any) {
        reject(new Error(`Excel parse error: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") return parseCSV(file);
  if (ext === "xlsx" || ext === "xls") return parseExcel(file);
  throw new Error(`Unsupported file type: .${ext}`);
}

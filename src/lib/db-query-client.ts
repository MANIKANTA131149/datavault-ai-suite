import { api } from "@/lib/api-client";
import type { ColumnInfo } from "@/lib/file-parser";
import type { DbType } from "@/stores/connection-store";

export interface DatabaseTableData {
  name: string;
  kind: string;
  description?: string;
  rowCount?: number;
  columns: ColumnInfo[];
  rows: Record<string, any>[];
}

export interface DatabaseSchema {
  connectionId: string;
  connectionName: string;
  dbType: DbType;
  database: string;
  host: string;
  tables: DatabaseTableData[];
  ready: boolean;
  message: string;
}

export interface DatabaseTableSummary {
  name: string;
  kind: string;
  rowCount?: number;
  columnCount: number;
  description?: string;
}

export interface DatabaseExecutionResult {
  data: Record<string, any>[];
  columns: ColumnInfo[];
  rowCount: number;
  sql?: string;
  executionTime: number;
  message: string;
  dbType: DbType;
  connectionName: string;
}

export function fetchDatabaseSchema(
  connectionId: string,
  tableName?: string,
  options: { refresh?: boolean } = {}
) {
  const params = new URLSearchParams();
  if (tableName) params.set("table", tableName);
  if (options.refresh) params.set("_", String(Date.now()));
  const query = params.toString() ? `?${params.toString()}` : "";
  return api.get<{ schema: DatabaseSchema }>(`/db-query/${connectionId}/schema${query}`);
}

export function fetchDatabaseTables(connectionId: string) {
  return api.post<{ tables: DatabaseTableSummary[] }>(`/db-query/${connectionId}/tables`, {});
}

export function executeDatabaseQuery(
  connectionId: string,
  body: { sql?: string; operation?: string; params?: Record<string, any> }
) {
  return api.post<DatabaseExecutionResult>(`/db-query/${connectionId}/execute`, body);
}

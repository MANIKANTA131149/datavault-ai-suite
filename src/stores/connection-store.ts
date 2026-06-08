import { create } from "zustand";
import { api } from "@/lib/api-client";

// ─── Database Type Definitions ────────────────────────────────────────────────
export type DbType =
  | "mysql"
  | "postgresql"
  | "sqlserver"
  | "oracle"
  | "mariadb"
  | "sqlite"
  | "mongodb"
  | "snowflake"
  | "bigquery"
  | "redshift"
  | "databricks"
  | "clickhouse"
  | "duckdb"
  | "elasticsearch";

export type ConnectionStatus = "untested" | "connected" | "error";
export type ConnectionType = "credentials" | "file" | "uri" | "token" | "service_account";

export interface DbTypeInfo {
  label: string;
  fields: string[];
  defaults: Record<string, unknown>;
  connectionType: ConnectionType;
}

export interface Connection {
  _id: string;
  userId: string;
  userEmail: string;
  name: string;
  dbType: DbType;
  config: Record<string, string>;
  description: string;
  tags: string[];
  status: ConnectionStatus;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Field Metadata ────────────────────────────────────────────────────────────
export const DB_FIELD_LABELS: Record<string, string> = {
  host: "Host",
  port: "Port",
  database: "Database",
  username: "Username",
  password: "Password",
  serviceName: "Service Name",
  filePath: "File Path",
  connectionUri: "Connection URI",
  account: "Account",
  warehouse: "Warehouse",
  schema: "Schema",
  projectId: "Project ID",
  serviceAccountJson: "Service Account JSON",
  serverHostname: "Server Hostname",
  httpPath: "HTTP Path",
  accessToken: "Access Token",
  url: "URL",
  apiKey: "API Key",
};

export const DB_SENSITIVE_FIELDS = new Set([
  "password",
  "accessToken",
  "apiKey",
  "serviceAccountJson",
  "connectionUri",
]);

export const DB_TYPE_LABELS: Record<DbType, string> = {
  mysql: "MySQL",
  postgresql: "PostgreSQL",
  sqlserver: "SQL Server",
  oracle: "Oracle DB",
  mariadb: "MariaDB",
  sqlite: "SQLite",
  mongodb: "MongoDB Atlas",
  snowflake: "Snowflake",
  bigquery: "BigQuery",
  redshift: "Redshift",
  databricks: "Databricks SQL",
  clickhouse: "ClickHouse",
  duckdb: "DuckDB",
  elasticsearch: "Elasticsearch / OpenSearch",
};

export const DB_TYPE_ICONS: Record<DbType, string> = {
  mysql: "🐬",
  postgresql: "🐘",
  sqlserver: "🗄️",
  oracle: "☁️",
  mariadb: "🦭",
  sqlite: "📄",
  mongodb: "🍃",
  snowflake: "❄️",
  bigquery: "📊",
  redshift: "🔴",
  databricks: "⚡",
  clickhouse: "🏠",
  duckdb: "🦆",
  elasticsearch: "🔍",
};

export const DB_CONNECTION_TYPE_LABELS: Record<ConnectionType, string> = {
  credentials: "Username / Password",
  file: "File Path",
  uri: "Connection URI",
  token: "Token / Key",
  service_account: "Service Account",
};

export const DB_TYPE_FIELDS: Record<DbType, string[]> = {
  mysql: ["host", "port", "database", "username", "password"],
  postgresql: ["host", "port", "database", "username", "password"],
  sqlserver: ["host", "database", "username", "password"],
  oracle: ["host", "port", "serviceName", "username", "password"],
  mariadb: ["host", "port", "database", "username", "password"],
  sqlite: ["filePath"],
  mongodb: ["connectionUri", "database"],
  snowflake: ["account", "warehouse", "database", "schema", "username", "password"],
  bigquery: ["projectId", "serviceAccountJson"],
  redshift: ["host", "port", "database", "username", "password"],
  databricks: ["serverHostname", "httpPath", "accessToken"],
  clickhouse: ["host", "port", "database", "username", "password"],
  duckdb: ["filePath"],
  elasticsearch: ["url", "username", "password", "apiKey"],
};

export const DB_TYPE_DEFAULTS: Record<DbType, Record<string, string>> = {
  mysql: { port: "3306" },
  postgresql: { port: "5432" },
  sqlserver: {},
  oracle: { port: "1521" },
  mariadb: { port: "3306" },
  sqlite: {},
  mongodb: {},
  snowflake: {},
  bigquery: {},
  redshift: { port: "5439" },
  databricks: {},
  clickhouse: { port: "8123" },
  duckdb: {},
  elasticsearch: {},
};

export const DB_TYPE_CONNECTION_TYPE: Record<DbType, ConnectionType> = {
  mysql: "credentials",
  postgresql: "credentials",
  sqlserver: "credentials",
  oracle: "credentials",
  mariadb: "credentials",
  sqlite: "file",
  mongodb: "uri",
  snowflake: "credentials",
  bigquery: "service_account",
  redshift: "credentials",
  databricks: "token",
  clickhouse: "credentials",
  duckdb: "file",
  elasticsearch: "credentials",
};

// Group databases by category
export const DB_CATEGORIES: { label: string; types: DbType[] }[] = [
  {
    label: "Relational (SQL)",
    types: ["mysql", "postgresql", "sqlserver", "oracle", "mariadb", "sqlite"],
  },
  {
    label: "Cloud Data Warehouses",
    types: ["snowflake", "bigquery", "redshift", "databricks"],
  },
  {
    label: "NoSQL & Search",
    types: ["mongodb", "elasticsearch"],
  },
  {
    label: "Embedded / Analytical",
    types: ["clickhouse", "duckdb"],
  },
];

// ─── Store ────────────────────────────────────────────────────────────────────
interface ConnectionState {
  connections: Connection[];
  loading: boolean;
  fetchConnections: () => Promise<void>;
  addConnection: (data: {
    name: string;
    dbType: DbType;
    config: Record<string, string>;
    description?: string;
    tags?: string[];
  }) => Promise<Connection>;
  updateConnection: (
    id: string,
    data: Partial<{
      name: string;
      config: Record<string, string>;
      description: string;
      tags: string[];
    }>
  ) => Promise<Connection>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<{ success: boolean; message: string }>;
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  connections: [],
  loading: false,

  fetchConnections: async () => {
    set({ loading: true });
    try {
      const res = await api.get<{ connections: Connection[] }>("/connections");
      set({ connections: res.connections });
    } catch (err) {
      console.error("Failed to fetch connections:", err);
    } finally {
      set({ loading: false });
    }
  },

  addConnection: async (data) => {
    const res = await api.post<{ connection: Connection }>("/connections", data);
    set({ connections: [res.connection, ...get().connections] });
    return res.connection;
  },

  updateConnection: async (id, data) => {
    const res = await api.put<{ connection: Connection }>(`/connections/${id}`, data);
    set({
      connections: get().connections.map((c) =>
        c._id === id ? res.connection : c
      ),
    });
    return res.connection;
  },

  deleteConnection: async (id) => {
    await api.delete(`/connections/${id}`);
    set({ connections: get().connections.filter((c) => c._id !== id) });
  },

  testConnection: async (id) => {
    const res = await api.post<{ success: boolean; message: string }>(
      `/connections/${id}/test`,
      {}
    );
    // Refresh to get updated status
    await get().fetchConnections();
    return res;
  },
}));

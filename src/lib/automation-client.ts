// ─── Typed client for the automation / platform APIs ──────────────────────────
// Thin wrappers around api-client for schedules (F3), alerts (F11), API keys
// (F7), glossary (F9) and dashboards (F22). Pure data layer — no UI state.

import { api } from "@/lib/api-client";

// ── Schedules ────────────────────────────────────────────────────────────────
export type ScheduleInterval = "hourly" | "every6h" | "daily" | "weekly";

export interface Schedule {
  id: string;
  name: string;
  question: string;
  sql: string;
  datasetId: string | null;
  connectionId: string | null;
  sheetName: string | null;
  interval: ScheduleInterval;
  enabled: boolean;
  lastRun: string | null;
  lastStatus: "success" | "error" | null;
  lastError: string | null;
  nextRun: string;
  runCount: number;
  createdAt: string;
}

export interface ScheduleRun {
  id: string;
  ts: string;
  status: "success" | "error";
  error: string | null;
  rowCount: number;
  preview: Record<string, unknown>[];
}

export const schedulesApi = {
  list: () => api.get<Schedule[]>("/schedules"),
  create: (body: {
    name: string;
    question?: string;
    sql: string;
    datasetId?: string;
    connectionId?: string;
    sheetName?: string;
    interval: ScheduleInterval;
  }) => api.post<Schedule>("/schedules", body),
  update: (id: string, body: { enabled?: boolean; name?: string; interval?: ScheduleInterval }) =>
    api.put<{ success: boolean }>(`/schedules/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`/schedules/${id}`),
  runs: (id: string) => api.get<ScheduleRun[]>(`/schedules/${id}/runs`),
};

// ── Alerts ───────────────────────────────────────────────────────────────────
export type AlertOperator = "<" | "<=" | ">" | ">=" | "=" | "!=";

export interface DataAlert {
  id: string;
  label: string;
  conditionNl: string;
  metricSql: string;
  operator: AlertOperator;
  threshold: number;
  datasetId: string | null;
  connectionId: string | null;
  sheetName: string | null;
  checkInterval: "hourly" | "every6h" | "daily";
  enabled: boolean;
  lastChecked: string | null;
  lastValue: number | null;
  lastError?: string | null;
  lastFired: string | null;
  fireCount: number;
  createdAt: string;
}

export interface TranslatedAlertRule {
  metricSql: string;
  operator: AlertOperator;
  threshold: number;
  label: string;
}

export const alertsApi = {
  list: () => api.get<DataAlert[]>("/alerts"),
  translate: (body: { condition: string; schemaDescription: string; dialect?: string }) =>
    api.post<TranslatedAlertRule>("/alerts/translate", body),
  create: (body: {
    conditionNl?: string;
    metricSql: string;
    operator: AlertOperator;
    threshold: number;
    label?: string;
    datasetId?: string;
    connectionId?: string;
    sheetName?: string;
    checkInterval?: "hourly" | "every6h" | "daily";
  }) => api.post<DataAlert>("/alerts", body),
  update: (id: string, body: { enabled?: boolean; label?: string; threshold?: number; operator?: AlertOperator }) =>
    api.put<{ success: boolean }>(`/alerts/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`/alerts/${id}`),
};

// ── API keys ─────────────────────────────────────────────────────────────────
export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  revoked: boolean;
  lastUsedAt: string | null;
  callCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface CreatedApiKey {
  id: string;
  name: string;
  key: string; // plaintext — shown exactly once
  keyPrefix: string;
  createdAt: string;
}

export const apiKeysApi = {
  list: () => api.get<ApiKeyInfo[]>("/api-keys"),
  create: (name: string) => api.post<CreatedApiKey>("/api-keys", { name }),
  revoke: (id: string) => api.delete<{ success: boolean }>(`/api-keys/${id}`),
};

// ── Glossary ─────────────────────────────────────────────────────────────────
export interface GlossaryTermRecord {
  id: string;
  term: string;
  definition: string;
  sqlExpression: string | null;
  aliases: string[];
  datasetId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const glossaryApi = {
  list: () => api.get<GlossaryTermRecord[]>("/glossary"),
  create: (body: { term: string; definition: string; sqlExpression?: string; aliases?: string[]; datasetId?: string | null }) =>
    api.post<GlossaryTermRecord>("/glossary", body),
  update: (id: string, body: { definition?: string; sqlExpression?: string; aliases?: string[] }) =>
    api.put<{ success: boolean }>(`/glossary/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`/glossary/${id}`),
};

// ── Dashboards ───────────────────────────────────────────────────────────────
export interface DashboardPanel {
  id: string;
  title: string;
  question: string;
  sql: string;
  chartType: "bar" | "line" | "area" | "pie" | "table" | "metric";
  layout: { w: number; h: number };
}

export interface DashboardRecord {
  id: string;
  name: string;
  description: string;
  datasetId: string | null;
  connectionId: string | null;
  sheetName: string | null;
  panels: DashboardPanel[];
  sourceQuestion: string;
  createdAt: string;
  updatedAt: string;
}

export const dashboardsApi = {
  list: () => api.get<DashboardRecord[]>("/dashboards"),
  get: (id: string) => api.get<DashboardRecord>(`/dashboards/${id}`),
  update: (id: string, body: { name?: string; description?: string; panels?: DashboardPanel[]; datasetId?: string }) =>
    api.put<{ success: boolean }>(`/dashboards/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`/dashboards/${id}`),
};

// ─── Typed client for the new enterprise platform APIs ────────────────────────
// Thin api-client wrappers for: Traces (F-OBS), Templates (F-MKT),
// Metrics/Semantic layer (F-SEM), Eval (F-EVAL), Collaboration (F-COLLAB).
// Pure data layer — no UI state. Mirrors the style of automation-client.ts.

import { api } from "@/lib/api-client";

// ── Traces (F-OBS) ─────────────────────────────────────────────────────────────
export interface TraceStep {
  index: number;
  command: string;
  summary?: string;
  reasoning?: string;
  sql?: string;
  rows?: number;
  final?: boolean;
  tokens?: number;
  latencyMs?: number;
}
export interface TraceSummary {
  id: string;
  question: string;
  stepCount: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  model: string;
  provider: string;
  status: string;
  ts: string;
}
export interface Trace extends TraceSummary {
  steps: TraceStep[];
  datasetId: string | null;
  connectionId: string | null;
}
export interface TraceStats {
  windowDays: number;
  runs: number;
  totalTokens: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  errors: number;
  successRate: number;
}

export const tracesApi = {
  list: (page = 1, limit = 30) =>
    api.get<{ traces: TraceSummary[]; total: number; page: number; limit: number }>(`/traces?page=${page}&limit=${limit}`),
  stats: () => api.get<TraceStats>("/traces/stats"),
  get: (id: string) => api.get<Trace>(`/traces/${id}`),
  // Fire-and-forget from the client after an agent run completes.
  record: (body: {
    question: string;
    steps: unknown[];
    totalTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    model?: string;
    provider?: string;
    status?: string;
    datasetId?: string | null;
    connectionId?: string | null;
  }) => api.post<{ id: string | null }>("/traces", body).catch(() => ({ id: null })),
};

// ── Templates (F-MKT) ──────────────────────────────────────────────────────────
export type TemplateType = "query" | "dashboard";
export interface Template {
  id: string;
  type: TemplateType;
  name: string;
  description: string;
  payload: Record<string, unknown>;
  authorName: string;
  installs: number;
  tags: string[];
  createdAt: string;
  status?: string;
  public?: boolean;
}

export const templatesApi = {
  gallery: (opts: { type?: TemplateType; q?: string; page?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.type) p.set("type", opts.type);
    if (opts.q) p.set("q", opts.q);
    if (opts.page) p.set("page", String(opts.page));
    const qs = p.toString();
    return api.get<{ templates: Template[]; total: number; page: number; limit: number }>(`/templates${qs ? `?${qs}` : ""}`);
  },
  mine: () => api.get<Template[]>("/templates/mine/list"),
  publish: (body: { type: TemplateType; name: string; description?: string; payload: Record<string, unknown>; tags?: string[] }) =>
    api.post<Template>("/templates", body),
  fork: (id: string) =>
    api.post<{ type: TemplateType; id?: string; dashboard?: unknown; payload?: Record<string, unknown> }>(`/templates/${id}/fork`, {}),
  remove: (id: string) => api.delete<{ success: boolean }>(`/templates/${id}`),
};

// ── Metrics / Semantic layer (F-SEM) ─────────────────────────────────────────────
export interface Metric {
  id: string;
  orgId: string;
  name: string;
  expression: string;
  description: string;
  dimensions: string[];
  datasetId: string | null;
  connectionId: string | null;
  certifiedBy: string;
  createdAt: string;
  updatedAt: string;
}

export const metricsApi = {
  list: () => api.get<Metric[]>("/metrics"),
  context: (opts: { datasetId?: string; connectionId?: string } = {}) => {
    const p = new URLSearchParams();
    if (opts.datasetId) p.set("datasetId", opts.datasetId);
    if (opts.connectionId) p.set("connectionId", opts.connectionId);
    const qs = p.toString();
    return api.get<{ context: string; hasMetrics: boolean }>(`/metrics/context${qs ? `?${qs}` : ""}`);
  },
  create: (body: { name: string; expression: string; description?: string; dimensions?: string[]; datasetId?: string; connectionId?: string }) =>
    api.post<Metric>("/metrics", body),
  update: (id: string, body: Partial<Pick<Metric, "name" | "expression" | "description" | "dimensions">>) =>
    api.put<{ success: boolean }>(`/metrics/${id}`, body),
  remove: (id: string) => api.delete<{ success: boolean }>(`/metrics/${id}`),
  validate: (expression: string, connectionId?: string) =>
    api.post<{ valid: boolean; error?: string }>("/metrics/validate", { expression, connectionId }),
};

// ── Evaluation (F-EVAL) ──────────────────────────────────────────────────────────
export interface EvalCase {
  id: string;
  question: string;
  datasetId: string | null;
  connectionId: string | null;
  sheetName: string | null;
  expectation: {
    minRows?: number;
    maxRows?: number;
    expectRows?: number;
    containsColumns?: string[];
    expectedSqlContains?: string[];
  };
  createdAt: string;
}
export interface EvalResult {
  caseId: string;
  question: string;
  sql: string | null;
  pass: boolean;
  reasons: string[];
  rowCount?: number;
  columns?: string[];
}
export interface EvalRun {
  id: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  tokensUsed: number;
  durationMs: number;
  results?: EvalResult[];
  ts: string;
}

export const evalApi = {
  listCases: () => api.get<EvalCase[]>("/eval/cases"),
  createCase: (body: {
    question: string;
    datasetId?: string;
    connectionId?: string;
    sheetName?: string;
    expectation?: EvalCase["expectation"];
  }) => api.post<EvalCase>("/eval/cases", body),
  removeCase: (id: string) => api.delete<{ success: boolean }>(`/eval/cases/${id}`),
  run: (caseIds?: string[]) => api.post<EvalRun>("/eval/run", caseIds ? { caseIds } : {}),
  listRuns: () => api.get<EvalRun[]>("/eval/runs"),
  getRun: (id: string) => api.get<EvalRun>(`/eval/runs/${id}`),
};

// ── Collaboration (F-COLLAB) ─────────────────────────────────────────────────────
export type CollabResourceType = "dashboard" | "query" | "trace";
export interface Comment {
  id: string;
  resourceType: CollabResourceType;
  resourceId: string;
  authorEmail: string;
  authorName: string;
  text: string;
  createdAt: string;
}
export interface Share {
  id: string;
  resourceType: CollabResourceType;
  resourceId: string;
  role: "viewer" | "editor";
  token: string;
  createdAt: string;
}

export const collabApi = {
  comments: (resourceType: CollabResourceType, resourceId: string) =>
    api.get<Comment[]>(`/collab/comments/${resourceType}/${resourceId}`),
  addComment: (resourceType: CollabResourceType, resourceId: string, text: string) =>
    api.post<Comment>("/collab/comments", { resourceType, resourceId, text }),
  removeComment: (id: string) => api.delete<{ success: boolean }>(`/collab/comments/${id}`),
  shares: (resourceType: CollabResourceType, resourceId: string) =>
    api.get<Share[]>(`/collab/shares/${resourceType}/${resourceId}`),
  createShare: (resourceType: CollabResourceType, resourceId: string, role: "viewer" | "editor") =>
    api.post<Share>("/collab/shares", { resourceType, resourceId, role }),
  revokeShare: (id: string) => api.delete<{ success: boolean }>(`/collab/shares/${id}`),
};

// ── Org roles (F-RBAC) ───────────────────────────────────────────────────────────
export const orgRolesApi = {
  changeRole: (orgId: string, userId: string, role: "admin" | "analyst" | "member" | "viewer") =>
    api.put<{ success: boolean }>(`/orgs/${orgId}/members/${userId}/role`, { role }),
  removeMember: (orgId: string, userId: string) =>
    api.delete<{ success: boolean }>(`/orgs/${orgId}/members/${userId}`),
};

// ── Organizations / workspace switching ──────────────────────────────────────────
export interface OrgSummary {
  id: string;
  name: string;
  type: string;
  role: string;
  createdAt: string;
}
export const orgsApi = {
  list: () => api.get<OrgSummary[]>("/orgs"),
  me: () => api.get<{ orgId: string; name: string; type: string; role: string; settings: Record<string, unknown> }>("/orgs/me"),
  create: (name: string) => api.post<OrgSummary>("/orgs", { name }),
  setActive: (orgId: string) => api.put<{ success: boolean; activeOrgId: string }>("/orgs/active", { orgId }),
};

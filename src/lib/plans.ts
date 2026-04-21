export type PlanTier = "free" | "standard" | "professional" | "enterprise";
export type ExportFormat = "csv" | "json" | "markdown" | "html" | "pdf" | "audit" | "history";

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  monthlyQueries: number | null;
  monthlyTokens: number | null;
  datasets: number | null;
  fileSizeLimitBytes: number | null;
  insights: number | null;
  members: number | null;
  adminPage: boolean;
  exports: ExportFormat[];
  features: string[];
}

export interface PlanUsage {
  monthlyQueries: number;
  monthlyTokens: number;
  datasets: number;
  insights: number;
  members: number;
}

export interface PlanContext {
  plan: PlanDefinition;
  usage: PlanUsage;
  planStatus: string;
  planSource: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  organizationId?: string;
  organizationOwnerId?: string;
  planOwnerId?: string;
  planOwnerEmail?: string;
  isPlanOwner?: boolean;
}

export const PLAN_TIERS: PlanTier[] = ["free", "standard", "professional", "enterprise"];

export const PLAN_DEFINITIONS: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    name: "Free",
    monthlyQueries: 25,
    monthlyTokens: 50000,
    datasets: 2,
    fileSizeLimitBytes: 1 * 1024 * 1024,
    insights: 3,
    members: 0,
    adminPage: false,
    exports: ["csv", "json"],
    features: ["25 monthly queries", "2 datasets", "1 MB files", "CSV and JSON exports"],
  },
  standard: {
    tier: "standard",
    name: "Standard",
    monthlyQueries: 500,
    monthlyTokens: 1000000,
    datasets: 20,
    fileSizeLimitBytes: 15 * 1024 * 1024,
    insights: 25,
    members: 1,
    adminPage: true,
    exports: ["csv", "json", "markdown", "pdf"],
    features: ["500 monthly queries", "20 datasets", "15 MB files", "1 shared member", "PDF exports", "Admin page"],
  },
  professional: {
    tier: "professional",
    name: "Professional",
    monthlyQueries: 2500,
    monthlyTokens: 5000000,
    datasets: 100,
    fileSizeLimitBytes: 35 * 1024 * 1024,
    insights: 100,
    members: 3,
    adminPage: true,
    exports: ["csv", "json", "markdown", "html", "pdf"],
    features: ["2,500 monthly queries", "100 datasets", "35 MB files", "3 shared members", "PDF exports"],
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise",
    monthlyQueries: null,
    monthlyTokens: null,
    datasets: null,
    fileSizeLimitBytes: null,
    insights: null,
    members: null,
    adminPage: true,
    exports: ["csv", "json", "markdown", "html", "pdf", "audit", "history"],
    features: ["Unlimited usage", "No file size limit", "Unlimited members", "All exports", "Audit and history export"],
  },
};

export function getPlanDefinition(tier?: string): PlanDefinition {
  return PLAN_DEFINITIONS[PLAN_TIERS.includes(tier as PlanTier) ? (tier as PlanTier) : "free"];
}

export function isUnlimited(limit: number | null | undefined): boolean {
  return limit === null || limit === undefined;
}

export function formatPlanLimit(limit: number | null | undefined): string {
  return isUnlimited(limit) ? "Unlimited" : Number(limit).toLocaleString();
}

export function formatFileSizeLimit(bytes: number | null | undefined): string {
  if (isUnlimited(bytes)) return "No size limit";
  const mb = Number(bytes) / (1024 * 1024);
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
}

export function planAllowsExport(plan: PlanDefinition | undefined, format: ExportFormat): boolean {
  return Boolean(plan?.exports.includes(format));
}

export function canAccessAdmin(tier?: string, isPlanOwner = false, role?: string): boolean {
  return getPlanDefinition(tier).adminPage && (isPlanOwner || role === "admin");
}

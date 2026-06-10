import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Users, MessageSquare, Zap, Activity, RefreshCw, TrendingUp,
  Database, Cable, CheckCircle2, XCircle, Clock, Crown, Server,
  BarChart2, Eye, EyeOff, LogOut, Sun, Moon, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiBaseUrl } from "@/lib/api-base";
import { formatDistanceToNow } from "date-fns";

// ── Auth helpers ───────────────────────────────────────────────────────────────

const STORAGE_KEY       = "datavault-analytics-token";
const THEME_STORAGE_KEY = "datavault-analytics-theme";
const API               = getApiBaseUrl();

const getAnalyticsToken  = ()      => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };
const setAnalyticsToken  = (t: string) => localStorage.setItem(STORAGE_KEY, t);
const clearAnalyticsToken = ()     => localStorage.removeItem(STORAGE_KEY);

async function analyticsLogin(username: string, password: string): Promise<string> {
  const res  = await fetch(`${API}/analytics/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data.token as string;
}

async function fetchAnalytics(token: string) {
  const res  = await fetch(`${API}/analytics`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load analytics");
  return data;
}

async function fetchUsers(
  token: string,
  page: number,
  pageSize: number,
  sortBy: string,
  order: "asc" | "desc"
) {
  const url  = `${API}/analytics/users?page=${page}&pageSize=${pageSize}&sortBy=${sortBy}&order=${order}`;
  const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load users");
  return data as { users: UserRow[]; total: number; page: number; pageSize: number; pages: number };
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRow {
  userId: string; name: string; email: string; planTier: string;
  createdAt: string | null; queryCount: number; totalTokens: number;
  errorCount: number; lastQuery: string | null;
}

interface AnalyticsData {
  generatedAt: string;
  users: {
    total: number; newToday: number; activeToday: number;
    byPlan: { tier: string; count: number }[];
    byRole: { role: string; count: number }[];
    dailyTrend: { date: string; newUsers: number }[];
  };
  queries: {
    total: number; today: number; successCount: number; errorCount: number;
    successRate: number; avgDurationMs: number; avgTurns: number; totalTokens: number;
    byProvider: { provider: string; count: number; tokens: number }[];
  };
  trends: {
    dailyQueries: { date: string; count: number; errors: number; success: number }[];
    dailyTokens:  { date: string; tokens: number }[];
    dailyUsers:   { date: string; newUsers: number }[];
  };
  connections: { total: number; byType: { type: string; count: number }[] };
  datasets:    { total: number; uploadedToday: number };
  recentActivity: {
    query: string; status: string; provider: string; model: string;
    turns: number; totalTokens: number; durationMs: number; date: string;
  }[];
  system: { mongoConnected: boolean; uptimeSeconds: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
  n >= 1_000     ? `${(n / 1_000).toFixed(1)}K`     : String(n);

const fmtDur = (ms: number) =>
  ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

const shortDate = (iso: string) => iso.slice(5);

const PLAN_COLORS: Record<string, string> = {
  free: "#6b7280", standard: "#3b82f6", professional: "#8b5cf6", enterprise: "#f59e0b",
};
const CHART_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#06b6d4"];

const AXIS_STYLE  = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const GRID_STROKE = "hsl(var(--border))";
const TT = {
  contentStyle: {
    background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
    borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))",
  },
};

// ── Theme hook ─────────────────────────────────────────────────────────────────

function useAnalyticsTheme() {
  // Snapshot both classes so we can restore exactly on unmount
  const origDark  = useRef(document.documentElement.classList.contains("dark"));
  const origLight = useRef(document.documentElement.classList.contains("light"));

  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved !== null) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    // The app CSS defines vars on both :root and .dark (both are dark),
    // and light vars only on .light — so we must ADD .light to get light mode.
    if (isDark) {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
  }, [isDark]);

  // Restore the app's original theme classes when leaving analytics
  useEffect(() => {
    return () => {
      document.documentElement.classList.remove("dark", "light");
      if (origDark.current)  document.documentElement.classList.add("dark");
      if (origLight.current) document.documentElement.classList.add("light");
    };
  }, []);

  return { isDark, toggle: () => setIsDark((v) => !v) };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color = "text-primary", delay = 0 }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; color?: string; delay?: number;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.25 }}>
      <Card className="border-border/60 bg-card/60">
        <CardContent className="flex items-start gap-3 p-4">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/40 ${color}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums leading-none text-foreground">
              {typeof value === "number" ? fmtNum(value) : value}
            </p>
            {sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Sort button ───────────────────────────────────────────────────────────────

function SortBtn({ col, current, order, onClick }: {
  col: string; current: string; order: "asc" | "desc"; onClick: () => void;
}) {
  const active = current === col;
  return (
    <button onClick={onClick} className="flex items-center gap-0.5 hover:text-foreground transition-colors">
      <span>{col === "queryCount" ? "Queries" : col === "totalTokens" ? "Tokens" : col === "errorCount" ? "Errors" : col === "lastQuery" ? "Last Active" : col}</span>
      <span className="ml-0.5">
        {active
          ? order === "desc" ? <ChevronDown size={11} className="text-primary" /> : <ChevronUp size={11} className="text-primary" />
          : <ChevronDown size={11} className="opacity-30" />}
      </span>
    </button>
  );
}

// ── Full users table ──────────────────────────────────────────────────────────

function UsersTable({ token }: { token: string }) {
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy,   setSortBy]   = useState("queryCount");
  const [order,    setOrder]    = useState<"asc" | "desc">("desc");

  function handleSort(col: string) {
    if (sortBy === col) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setOrder("desc");
    }
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["analytics-users", token, page, pageSize, sortBy, order],
    queryFn:  () => fetchUsers(token, page, pageSize, sortBy, order),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  } as any);

  const totalPages = (data as any)?.pages ?? 1;
  const total      = (data as any)?.total ?? 0;
  const users: UserRow[] = (data as any)?.users ?? [];

  function PageBtn({ p }: { p: number }) {
    return (
      <button
        onClick={() => setPage(p)}
        className={`flex h-7 min-w-[28px] items-center justify-center rounded-md px-2 text-xs transition-colors ${
          p === page
            ? "bg-primary text-primary-foreground font-semibold"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        {p}
      </button>
    );
  }

  // Generate page numbers with ellipsis
  const pageNums = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "…")[] = [1];
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.3 }}>
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Crown size={14} className="text-amber-400" />
              All Users
              {total > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-normal">
                  {fmtNum(total)} total
                </span>
              )}
              {isFetching && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
            </CardTitle>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Rows:</span>
              {[10, 25, 50].map((n) => (
                <button
                  key={n}
                  onClick={() => { setPageSize(n); setPage(1); }}
                  className={`rounded px-2 py-0.5 transition-colors ${
                    pageSize === n
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-xs">
              <thead>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <th className="px-4 py-2.5 text-left font-medium">#</th>
                  <th className="px-4 py-2.5 text-left font-medium">User</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    <SortBtn col="queryCount"  current={sortBy} order={order} onClick={() => handleSort("queryCount")} />
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    <SortBtn col="totalTokens" current={sortBy} order={order} onClick={() => handleSort("totalTokens")} />
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    <SortBtn col="errorCount"  current={sortBy} order={order} onClick={() => handleSort("errorCount")} />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">Plan</th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    <SortBtn col="lastQuery" current={sortBy} order={order} onClick={() => handleSort("lastQuery")} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: pageSize }).map((_, i) => (
                      <tr key={i} className="border-b border-border/20">
                        <td className="px-4 py-2.5"><Skeleton className="h-3 w-4" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-8 w-32" /></td>
                        <td className="px-3 py-2.5"><Skeleton className="h-3 w-10 ml-auto" /></td>
                        <td className="px-3 py-2.5"><Skeleton className="h-3 w-10 ml-auto" /></td>
                        <td className="px-3 py-2.5"><Skeleton className="h-3 w-6 ml-auto" /></td>
                        <td className="px-3 py-2.5"><Skeleton className="h-5 w-16" /></td>
                        <td className="px-4 py-2.5"><Skeleton className="h-3 w-20" /></td>
                      </tr>
                    ))
                  : users.map((u, i) => {
                      const rowNum = (page - 1) * pageSize + i + 1;
                      return (
                        <tr key={u.userId} className="border-b border-border/20 transition-colors hover:bg-muted/20">
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{rowNum}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                                {u.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate max-w-[140px] font-medium text-foreground">{u.name}</p>
                                <p className="truncate max-w-[140px] text-[10px] text-muted-foreground">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-foreground">
                            {fmtNum(u.queryCount)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {fmtNum(u.totalTokens)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <span className={u.errorCount > 0 ? "text-red-500" : "text-muted-foreground"}>
                              {u.errorCount}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize"
                              style={{
                                background: `${PLAN_COLORS[u.planTier] || "#6b7280"}20`,
                                color: PLAN_COLORS[u.planTier] || "#6b7280",
                              }}
                            >
                              {u.planTier}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                            {u.lastQuery
                              ? formatDistanceToNow(new Date(u.lastQuery), { addSuffix: true })
                              : "Never"}
                          </td>
                        </tr>
                      );
                    })}

                {!isLoading && users.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No users with query history yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {fmtNum(total)}
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsLeft size={13} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={13} />
                </button>
                {pageNums.map((p, i) =>
                  p === "…"
                    ? <span key={`el-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    : <PageBtn key={p} p={p as number} />
                )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronsRight size={13} />
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="p-4">
              <Skeleton className="h-3 w-20 mb-3" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-2.5 w-24 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-border/60">
            <CardHeader><Skeleton className="h-4 w-28" /></CardHeader>
            <CardContent><Skeleton className="h-44 w-full rounded-lg" /></CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Login screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const { isDark, toggle }      = useAnalyticsTheme();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const token = await analyticsLogin(username, password);
      onLogin(token);
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      {/* Theme toggle top-right */}
      <button
        onClick={toggle}
        className="fixed right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        aria-label="Toggle theme"
      >
        {isDark ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-[360px]"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-sm">
            <BarChart2 size={22} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Analytics Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Audit team access</p>
        </div>

        <Card className="border-border/60 bg-card shadow-lg">
          <CardContent className="pt-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="an-user" className="text-xs font-medium">Username</Label>
                <Input id="an-user" autoComplete="username" value={username}
                  onChange={(e) => setUsername(e.target.value)} placeholder="audit-team" required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="an-pass" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Input id="an-pass" type={showPw ? "text" : "password"}
                    autoComplete="current-password" value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    required className="pr-9" />
                  <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground">
                    {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }} className="text-xs text-destructive">
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading
                  ? <span className="flex items-center gap-2"><RefreshCw size={13} className="animate-spin" /> Signing in…</span>
                  : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Session lasts 8 hours · credentials set in <code className="font-mono">.env</code>
        </p>
      </motion.div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const { isDark, toggle } = useAnalyticsTheme();

  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isFetching } =
    useQuery<AnalyticsData>({
      queryKey:  ["analytics-dashboard", token],
      queryFn:   () => fetchAnalytics(token),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    } as any);

  // In React Query v5 onError was removed — handle token expiry via isError
  useEffect(() => {
    if (isError && String((error as any)?.message).includes("token")) onLogout();
  }, [isError, error, onLogout]);

  const lastUpdated = useMemo(
    () => dataUpdatedAt ? formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true }) : null,
    [dataUpdatedAt]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-3 py-2.5 sm:px-6">
          {/* Logo + title */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <BarChart2 size={15} className="text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-foreground leading-tight">Analytics</p>
              {lastUpdated && (
                <p className="text-[10px] text-muted-foreground leading-tight hidden sm:block">Updated {lastUpdated}</p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={toggle} aria-label="Toggle theme"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}
              className="h-8 gap-1.5 px-2.5 text-xs">
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={onLogout}
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground">
              <LogOut size={12} />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="mx-auto max-w-screen-2xl space-y-5 p-3 sm:p-5 lg:p-6">
        {isError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
              <XCircle size={15} /> Failed to load analytics. Try refreshing or signing in again.
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : data ? (
          <>
            {/* ── Stat cards (2 rows) ── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={<Users size={15} />}         label="Total Users"    value={data.users.total}          sub={`+${data.users.newToday} today`}                             color="text-blue-400"    delay={0}    />
              <StatCard icon={<MessageSquare size={15} />}  label="Total Queries"  value={data.queries.total}         sub={`${data.queries.today} today`}                              color="text-violet-400"  delay={0.04} />
              <StatCard icon={<Zap size={15} />}            label="LLM Tokens"     value={data.queries.totalTokens}   sub={`avg ${fmtNum(Math.round(data.queries.totalTokens / Math.max(data.queries.total, 1)))} / query`} color="text-amber-400"   delay={0.08} />
              <StatCard icon={<Activity size={15} />}       label="Active Today"   value={data.users.activeToday}     sub={`${Math.round(data.queries.successRate * 100)}% success`}   color="text-emerald-400" delay={0.12} />
              <StatCard icon={<Clock size={15} />}          label="Avg Duration"   value={fmtDur(data.queries.avgDurationMs)} sub={`${data.queries.avgTurns} turns avg`}               color="text-cyan-400"    delay={0.16} />
              <StatCard icon={<TrendingUp size={15} />}     label="Success Rate"   value={`${Math.round(data.queries.successRate * 100)}%`} sub={`${fmtNum(data.queries.errorCount)} errors`} color="text-emerald-400" delay={0.2}  />
              <StatCard icon={<Database size={15} />}       label="Datasets"       value={data.datasets.total}        sub={`+${data.datasets.uploadedToday} today`}                    color="text-orange-400"  delay={0.24} />
              <StatCard icon={<Cable size={15} />}          label="Connections"    value={data.connections.total}     sub={`${data.connections.byType.length} DB types`}               color="text-pink-400"    delay={0.28} />
            </div>

            {/* ── Trend charts ── */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {/* Queries / day */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.28 }}>
                <Card className="border-border/60 bg-card/60">
                  <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-sm font-medium">Queries / Day</CardTitle></CardHeader>
                  <CardContent className="pb-3 px-2">
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={data.trends.dailyQueries} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                        <defs>
                          <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="gE" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_STYLE} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                        <Tooltip {...TT} formatter={(v: number, n: string) => [v, n === "success" ? "Success" : "Errors"]} />
                        <Area type="monotone" dataKey="success" stackId="1" stroke="#3b82f6" fill="url(#gS)" strokeWidth={1.5} />
                        <Area type="monotone" dataKey="errors"  stackId="1" stroke="#ef4444" fill="url(#gE)" strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Tokens / day */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.28 }}>
                <Card className="border-border/60 bg-card/60">
                  <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-sm font-medium">Tokens / Day</CardTitle></CardHeader>
                  <CardContent className="pb-3 px-2">
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={data.trends.dailyTokens} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                        <defs>
                          <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_STYLE} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tickFormatter={fmtNum} tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                        <Tooltip {...TT} formatter={(v: number) => [fmtNum(v), "Tokens"]} />
                        <Area type="monotone" dataKey="tokens" stroke="#f59e0b" fill="url(#gT)" strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* New users / day */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.28 }}>
                <Card className="border-border/60 bg-card/60 md:col-span-2 lg:col-span-1">
                  <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-sm font-medium">New Users / Day</CardTitle></CardHeader>
                  <CardContent className="pb-3 px-2">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={data.trends.dailyUsers} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                        <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_STYLE} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip {...TT} formatter={(v: number) => [v, "New users"]} />
                        <Bar dataKey="newUsers" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* ── Distribution charts ── */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Users by plan */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32, duration: 0.28 }}>
                <Card className="border-border/60 bg-card/60">
                  <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-sm font-medium">Users by Plan</CardTitle></CardHeader>
                  <CardContent className="pb-3">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={data.users.byPlan} dataKey="count" nameKey="tier"
                          cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3}
                          label={({ tier, percent }) => percent > 0.06 ? `${tier} ${Math.round(percent * 100)}%` : ""}
                          labelLine={false}>
                          {data.users.byPlan.map((e) => <Cell key={e.tier} fill={PLAN_COLORS[e.tier] || "#6b7280"} />)}
                        </Pie>
                        <Tooltip {...TT} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-1">
                      {data.users.byPlan.map((p) => (
                        <span key={p.tier} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: PLAN_COLORS[p.tier] || "#6b7280" }} />
                          {p.tier} ({p.count})
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Queries by provider */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36, duration: 0.28 }}>
                <Card className="border-border/60 bg-card/60">
                  <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-sm font-medium">Queries by Provider</CardTitle></CardHeader>
                  <CardContent className="pb-3 px-2">
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={data.queries.byProvider.slice(0, 6)} layout="vertical"
                        margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="provider" tick={AXIS_STYLE} tickLine={false} width={64} tickFormatter={(v) => v.slice(0, 10)} />
                        <Tooltip {...TT} formatter={(v: number) => [v, "Queries"]} />
                        <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={18}>
                          {data.queries.byProvider.slice(0, 6).map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Connections by type */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.28 }}>
                <Card className="border-border/60 bg-card/60">
                  <CardHeader className="pb-1 pt-4 px-4"><CardTitle className="text-sm font-medium">Connections by Type</CardTitle></CardHeader>
                  <CardContent className="pb-3 px-2">
                    {data.connections.byType.length === 0 ? (
                      <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">No connections yet</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart data={data.connections.byType.slice(0, 8)} layout="vertical"
                          margin={{ top: 0, right: 12, bottom: 0, left: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                          <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
                          <YAxis type="category" dataKey="type" tick={AXIS_STYLE} tickLine={false} width={72} tickFormatter={(v) => v.slice(0, 12)} />
                          <Tooltip {...TT} formatter={(v: number) => [v, "Connections"]} />
                          <Bar dataKey="count" fill="#06b6d4" radius={[0, 3, 3, 0]} maxBarSize={18} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* ── All Users table (full width) ── */}
            <UsersTable token={token} />

            {/* ── Recent queries table ── */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.28 }}>
              <Card className="border-border/60 bg-card/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Activity size={14} className="text-blue-400" /> Recent Queries
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead>
                        <tr className="border-b border-border/60 text-muted-foreground">
                          <th className="px-4 py-2.5 text-left font-medium">Query</th>
                          <th className="px-3 py-2.5 text-left font-medium">Status</th>
                          <th className="px-3 py-2.5 text-right font-medium">Duration</th>
                          <th className="px-3 py-2.5 text-left font-medium">Provider</th>
                          <th className="px-4 py-2.5 text-left font-medium">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentActivity.map((r, i) => (
                          <tr key={i} className="border-b border-border/20 transition-colors hover:bg-muted/20">
                            <td className="px-4 py-2.5 max-w-[200px]">
                              <p className="truncate text-foreground" title={r.query}>{r.query || "—"}</p>
                            </td>
                            <td className="px-3 py-2.5">
                              {r.status === "success"
                                ? <span className="flex items-center gap-1 text-emerald-500"><CheckCircle2 size={11} />ok</span>
                                : <span className="flex items-center gap-1 text-red-500"><XCircle size={11} />err</span>}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{fmtDur(r.durationMs)}</td>
                            <td className="px-3 py-2.5 text-muted-foreground">
                              <span className="inline-block max-w-[80px] truncate">{r.provider || "—"}</span>
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                              {r.date ? formatDistanceToNow(new Date(r.date), { addSuffix: true }) : "—"}
                            </td>
                          </tr>
                        ))}
                        {data.recentActivity.length === 0 && (
                          <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No recent activity</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* ── System health ── */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.25 }}>
              <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/40 bg-card/30 px-4 py-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium text-foreground"><Server size={12} />System</span>
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${data.system.mongoConnected ? "bg-emerald-400" : "bg-red-400"}`} />
                  MongoDB {data.system.mongoConnected ? "connected" : "disconnected"}
                </span>
                <span>Uptime {Math.floor(data.system.uptimeSeconds / 3600)}h {Math.floor((data.system.uptimeSeconds % 3600) / 60)}m</span>
                <span className="ml-auto">Generated {new Date(data.generatedAt).toLocaleTimeString()}</span>
              </div>
            </motion.div>
          </>
        ) : null}
      </main>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [token, setToken] = useState<string | null>(() => getAnalyticsToken());

  function handleLogin(t: string) { setAnalyticsToken(t); setToken(t); }
  function handleLogout()         { clearAnalyticsToken(); setToken(null); }

  if (!token) return <LoginScreen onLogin={handleLogin} />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}

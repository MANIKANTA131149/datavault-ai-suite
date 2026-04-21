import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Users, Shield, UserPlus, Search, MoreHorizontal, Trash2, Ban, CheckCircle, Crown, Eye, BarChart3, Database, MessageSquare, Activity, ClipboardList, FileDown, AlertTriangle, Filter, CreditCard } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api-client";
import { getApiBaseUrl } from "@/lib/api-base";
import { useAuthStore } from "@/stores/auth-store";
import { usePlanStore } from "@/stores/plan-store";
import { PLAN_DEFINITIONS, PLAN_TIERS, canAccessAdmin, formatPlanLimit, type PlanTier } from "@/lib/plans";
import { toast } from "sonner";


interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  planTier: PlanTier;
  planStatus: string;
  planSource: string;
  effectivePlanTier: PlanTier;
  organizationId: string;
  organizationOwnerId: string;
  createdAt: string;
  lastLogin: string | null;
  datasetCount: number;
  queryCount: number;
}

interface AdminStats {
  userCount: number;
  datasetCount: number;
  queryCount: number;
  insightCount: number;
  roleDistribution: Record<string, number>;
  planDistribution: Record<string, number>;
}

interface AuditLog {
  _id: string;
  userId: string;
  userEmail: string;
  action: string;
  details: Record<string, any>;
  severity: "info" | "warn" | "critical";
  ts: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  info:     "bg-blue-500/10 text-blue-400",
  warn:     "bg-amber-500/10 text-amber-400",
  critical: "bg-red-500/10 text-red-400",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-amber-500/10 text-amber-400",
  analyst: "bg-blue-500/10 text-blue-400",
  viewer: "bg-muted/60 text-muted-foreground",
};

const ROLE_ICONS: Record<string, React.ElementType> = {
  admin: Crown,
  analyst: BarChart3,
  viewer: Eye,
};

const PLAN_COLORS: Record<PlanTier, string> = {
  free: "bg-muted/60 text-muted-foreground",
  standard: "bg-blue-500/10 text-blue-400",
  professional: "bg-purple-500/10 text-purple-400",
  enterprise: "bg-green-500/10 text-green-400",
};

export default function AdminPage() {
  const { user: currentUser } = useAuthStore();
  const { context: planContext, fetchPlan, checkExport } = usePlanStore();
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSeverity, setAuditSeverity] = useState("all");
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const AUDIT_PAGE_SIZE = 25;
  const fullAdminAccess = canAccessAdmin(currentUser?.planTier, currentUser?.isPlanOwner);
  const currentPlan = PLAN_DEFINITIONS[currentUser?.planTier || "free"];



  // Invite dialog
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);

  // Delete dialog
  const [deleteUser, setDeleteUser] = useState<UserRecord | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const usersData = await api.get<UserRecord[]>("/admin/users");
      setUsers(usersData);
      if (fullAdminAccess) {
        try {
          const statsData = await api.get<AdminStats>("/admin/stats");
          setStats(statsData);
        } catch {
          setStats(null);
        }
      } else {
        setStats(null);
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async (page = 1) => {
    if (!fullAdminAccess) return;
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(AUDIT_PAGE_SIZE),
        ...(auditSearch ? { action: auditSearch } : {}),
        ...(auditSeverity !== "all" ? { severity: auditSeverity } : {}),
      });
      const data = await api.get<{ logs: AuditLog[]; total: number }>(`/audit?${params}`);
      setAuditLogs(data.logs);
      setAuditTotal(data.total);
      setAuditPage(page);
    } catch (err: any) {
      toast.error("Failed to load audit log");
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => { fetchPlan(); fetchData(); }, []);
  useEffect(() => { if (activeTab === "audit") fetchAuditLogs(1); }, [activeTab, auditSearch, auditSeverity]);
  


  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (planFilter !== "all" && (u.effectivePlanTier || u.planTier) !== planFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, planFilter]);

  const handleChangeRole = async (userId: string, role: string) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success(`Role updated to ${role}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to change role");
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "suspended" : "active";
    try {
      await api.put(`/admin/users/${userId}/status`, { status: newStatus });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)));
      toast.success(`User ${newStatus === "active" ? "activated" : "suspended"}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword.trim()) {
      toast.error("All fields are required");
      return;
    }
    setInviting(true);
    try {
      await api.post("/admin/users/invite", {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        password: invitePassword,
        role: inviteRole,
      });
      toast.success("User invited successfully");
      setShowInvite(false);
      setInviteName(""); setInviteEmail(""); setInvitePassword(""); setInviteRole("viewer");
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Failed to invite user");
    } finally {
      setInviting(false);
    }
  };

  const handleAuditExport = async () => {
    try {
      await checkExport("audit");
      const raw = localStorage.getItem("datavault-auth");
      const token = raw ? JSON.parse(raw)?.state?.token : null;
      const res = await fetch(`${getApiBaseUrl()}/audit/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Audit export failed" }));
        throw new Error(body.error || "Audit export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Audit log exported");
    } catch (err: any) {
      toast.error(err.message || "Audit export requires Enterprise plan");
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    try {
      await api.delete(`/admin/users/${deleteUser.id}`);
      setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
      setDeleteUser(null);
      toast.success("User deleted");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Shield size={20} className="text-primary" /> Admin Panel
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {fullAdminAccess ? "Manage users, roles, plans, and system-wide settings" : "Manage manual plan assignments"}
          </p>
        </div>
        <Button
          onClick={() => fullAdminAccess ? setShowInvite(true) : toast.info("Invites require Standard, Professional, or Enterprise")}
          disabled={!fullAdminAccess}
        >
          <UserPlus size={14} className="mr-2" /> Invite User
        </Button>
      </div>

      {!fullAdminAccess && (
        <Card className="p-4 bg-background-secondary border-border">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Limited admin access on {currentPlan.name}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Full Admin tabs, invites, audit logs, and user role controls require Standard, Professional, or Enterprise. You can still assign plans manually from this page.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats + Role Distribution */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Users", value: stats.userCount, icon: Users, color: "text-primary", bg: "bg-primary/10" },
            { label: "Datasets", value: stats.datasetCount, icon: Database, color: "text-blue-400", bg: "bg-blue-500/10" },
            { label: "Queries", value: stats.queryCount, icon: MessageSquare, color: "text-purple-400", bg: "bg-purple-500/10" },
            { label: "Insights", value: stats.insightCount, icon: Activity, color: "text-green-400", bg: "bg-green-500/10" },
          ].map((s) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-4 bg-background-secondary border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</span>
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                    <s.icon size={14} className={s.color} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-foreground">{s.value.toLocaleString()}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs: Users | Audit Log */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card">
          <TabsTrigger value="users" className="flex items-center gap-1.5">
            <Users size={13} /> Users
          </TabsTrigger>
          {fullAdminAccess && (
            <TabsTrigger value="audit" className="flex items-center gap-1.5">
              <ClipboardList size={13} /> Audit Log
            </TabsTrigger>
          )}

        </TabsList>

        {/* ─ Users Tab ─ */}
        <TabsContent value="users" className="space-y-4 mt-4">
          {/* Role distribution */}
          {stats && (
            <Card className="p-4 bg-background-secondary border-border">
              <h3 className="text-sm font-semibold text-foreground mb-3">Role & Workspace Plan</h3>
              <div className="flex gap-4 flex-wrap">
                {Object.entries(stats.roleDistribution).map(([role, count]) => {
                  const RoleIcon = ROLE_ICONS[role] || Eye;
                  return (
                    <div key={role} className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg ${ROLE_COLORS[role] || ROLE_COLORS.viewer} flex items-center justify-center`}>
                        <RoleIcon size={12} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground capitalize">{role}</p>
                        <p className="text-xs text-muted-foreground">{count} user{count !== 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  );
                })}
                {planContext && (
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg ${PLAN_COLORS[planContext.plan.tier]} flex items-center justify-center`}>
                      <CreditCard size={12} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{planContext.plan.name}</p>
                      <p className="text-xs text-muted-foreground">Workspace plan for all members</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* User Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-background-secondary border-border" />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-[130px] bg-background-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="analyst">Analyst</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[150px] bg-background-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All plans</SelectItem>
                {PLAN_TIERS.map((tier) => (
                  <SelectItem key={tier} value={tier}>{PLAN_DEFINITIONS[tier].name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {planContext && fullAdminAccess && (
            <Card className="p-3 bg-background-secondary border-border">
              <p className="text-xs text-muted-foreground">
                Member sharing on {planContext.plan.name}: {planContext.usage.members.toLocaleString()} / {formatPlanLimit(planContext.plan.members)}
              </p>
            </Card>
          )}

          {/* Users Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-background-secondary">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">User</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Workspace Plan</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Status</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Datasets</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Queries</th>
                  <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Joined</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.email === currentUser?.email;
                  const RoleIcon = ROLE_ICONS[u.role] || Eye;
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-card/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                            {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {u.name} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${ROLE_COLORS[u.role] || ROLE_COLORS.viewer} border-0 text-xs capitalize gap-1`}>
                          <RoleIcon size={10} />{u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge className={`${PLAN_COLORS[u.effectivePlanTier || u.planTier || "free"] || PLAN_COLORS.free} border-0 text-xs capitalize w-fit`}>
                            {PLAN_DEFINITIONS[u.effectivePlanTier || u.planTier || "free"].name}
                          </Badge>
                          {u.planTier !== (u.effectivePlanTier || u.planTier) && (
                            <span className="text-[10px] text-muted-foreground">Own : {u.planTier || "free"}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <Badge className={`border-0 text-xs ${u.status === "active" ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                          {u.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{u.datasetCount}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{u.queryCount}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1.5 rounded hover:bg-card text-muted-foreground hover:text-foreground">
                              <MoreHorizontal size={14} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            {fullAdminAccess && !isSelf && (
                              <>
                                <DropdownMenuItem onClick={() => handleChangeRole(u.id, "admin")}>
                                  <Crown size={12} className="mr-2 text-amber-400" /> Make Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleChangeRole(u.id, "analyst")}>
                                  <BarChart3 size={12} className="mr-2 text-blue-400" /> Make Analyst
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleChangeRole(u.id, "viewer")}>
                                  <Eye size={12} className="mr-2" /> Make Viewer
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {fullAdminAccess && !isSelf && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleToggleStatus(u.id, u.status)}>
                                  {u.status === "active" ? (
                                    <><Ban size={12} className="mr-2 text-amber-400" /> Suspend</>
                                  ) : (
                                    <><CheckCircle size={12} className="mr-2 text-green-400" /> Activate</>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setDeleteUser(u)} className="text-destructive focus:text-destructive">
                                  <Trash2 size={12} className="mr-2" /> Delete User
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ─ Audit Log Tab ─ */}
        <TabsContent value="audit" className="space-y-4 mt-4">
          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter by action..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="pl-9 bg-background-secondary border-border"
              />
            </div>
            <Select value={auditSeverity} onValueChange={setAuditSeverity}>
              <SelectTrigger className="w-[130px] bg-background-secondary border-border">
                <Filter size={12} className="mr-1" /><SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All severity</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={handleAuditExport}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors border border-border rounded-md px-3 py-2"
            >
              <FileDown size={13} /> Export CSV
            </button>
          </div>

          {auditLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-background-secondary">
                  <tr>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Timestamp</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">User</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Action</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Severity</th>
                    <th className="text-left px-4 py-3 text-muted-foreground font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No audit events yet</td></tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log._id} className="border-t border-border/50 hover:bg-card/30">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {new Date(log.ts).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-foreground max-w-[150px] truncate">{log.userEmail || log.userId}</td>
                        <td className="px-4 py-2.5 font-mono text-foreground">{log.action}</td>
                        <td className="px-4 py-2.5">
                          <Badge className={`${SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.info} border-0 text-[10px] capitalize`}>
                            {log.severity}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground max-w-[200px] truncate font-mono">
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {auditTotal > AUDIT_PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{auditTotal} total events</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={auditPage <= 1} onClick={() => fetchAuditLogs(auditPage - 1)} className="h-7 text-xs border-border">
                  Previous
                </Button>
                <span className="flex items-center px-2">Page {auditPage} of {Math.ceil(auditTotal / AUDIT_PAGE_SIZE)}</span>
                <Button variant="outline" size="sm" disabled={auditPage >= Math.ceil(auditTotal / AUDIT_PAGE_SIZE)} onClick={() => fetchAuditLogs(auditPage + 1)} className="h-7 text-xs border-border">
                  Next
                </Button>
              </div>
            </div>
          )}
        </TabsContent>


      </Tabs>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>Create a new user account with a specific role.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Full Name</Label>
              <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="mt-1 bg-card border-border" placeholder="John Doe" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="mt-1 bg-card border-border" placeholder="john@company.com" type="email" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Temporary Password</Label>
              <Input value={invitePassword} onChange={(e) => setInvitePassword(e.target.value)} className="mt-1 bg-card border-border" placeholder="Temp password" type="password" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="mt-1 bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="viewer">Viewer — Read-only access</SelectItem>
                  <SelectItem value="analyst">Analyst — Query & upload</SelectItem>
                  <SelectItem value="admin">Admin — Full access</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)} className="border-border">Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting}>
              {inviting ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteUser} onOpenChange={(open) => { if (!open) setDeleteUser(null); }}>
        <DialogContent className="bg-background-secondary border-border">
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              This will permanently delete "{deleteUser?.name}" ({deleteUser?.email}) and all their data including datasets, history, and insights.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)} className="border-border">Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete User & All Data</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Database, Trash2, CheckCircle2, XCircle, Clock,
  Eye, EyeOff, Save, TestTube2, X, Tag, Pencil, Cable, Server,
  HardDrive, Cloud, ChevronDown, Loader2, AlertTriangle, Info
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  useConnectionStore,
  DB_TYPE_LABELS, DB_TYPE_ICONS, DB_TYPE_FIELDS, DB_TYPE_DEFAULTS,
  DB_TYPE_CONNECTION_TYPE, DB_CONNECTION_TYPE_LABELS, DB_FIELD_LABELS,
  DB_SENSITIVE_FIELDS, DB_CATEGORIES,
  type DbType, type Connection, type ConnectionStatus
} from "@/stores/connection-store";

/* ─── Status helpers ────────────────────────────────────────────────────────── */
const STATUS_CFG: Record<ConnectionStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  connected: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Connected" },
  error:     { icon: XCircle,      color: "text-red-400",     bg: "bg-red-500/10",     label: "Error" },
  untested:  { icon: Clock,        color: "text-amber-400",   bg: "bg-amber-500/10",   label: "Untested" },
};

const CATEGORY_ICONS = [Server, Cloud, Database, HardDrive];

/* ─── Add / Edit Dialog ─────────────────────────────────────────────────────── */
function ConnectionFormDialog({
  open, onClose, editConnection,
}: {
  open: boolean;
  onClose: () => void;
  editConnection?: Connection | null;
}) {
  const { addConnection, updateConnection } = useConnectionStore();
  const isEdit = !!editConnection;

  const [name, setName] = useState("");
  const [dbType, setDbType] = useState<DbType>("postgresql");
  const [config, setConfig] = useState<Record<string, string>>({});
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [showSensitive, setShowSensitive] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<"type" | "config">(isEdit ? "config" : "type");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (editConnection) {
        setName(editConnection.name);
        setDbType(editConnection.dbType);
        setConfig({ ...editConnection.config });
        setDescription(editConnection.description || "");
        setTags((editConnection.tags || []).join(", "));
        setStep("config");
      } else {
        setName("");
        setDbType("postgresql");
        setConfig({});
        setDescription("");
        setTags("");
        setStep("type");
      }
      setShowSensitive({});
    }
  }, [open, editConnection]);

  // Apply defaults when dbType changes
  useEffect(() => {
    if (!isEdit) {
      setConfig({ ...DB_TYPE_DEFAULTS[dbType] });
    }
  }, [dbType, isEdit]);

  const fields = DB_TYPE_FIELDS[dbType] || [];

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Connection name is required"); return; }
    setSaving(true);
    try {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (isEdit && editConnection) {
        await updateConnection(editConnection._id, { name: name.trim(), config, description, tags: tagList });
        toast.success("Connection updated");
      } else {
        await addConnection({ name: name.trim(), dbType, config, description, tags: tagList });
        toast.success("Connection created");
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save connection");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background-secondary border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil size={16} /> : <Plus size={16} />}
            {isEdit ? "Edit Connection" : "New Database Connection"}
          </DialogTitle>
          <DialogDescription>
            {step === "type"
              ? "Choose your database type to get started."
              : `Configure your ${DB_TYPE_LABELS[dbType]} connection.`}
          </DialogDescription>
        </DialogHeader>

        {step === "type" && !isEdit && (
          <div className="space-y-4 py-2">
            {DB_CATEGORIES.map((cat, ci) => {
              const CatIcon = CATEGORY_ICONS[ci] || Database;
              return (
                <div key={cat.label}>
                  <div className="flex items-center gap-2 mb-2">
                    <CatIcon size={13} className="text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{cat.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {cat.types.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setDbType(t); setStep("config"); }}
                        className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.3)] ${
                          dbType === t ? "border-primary/50 bg-primary/10" : "border-border bg-card/70"
                        }`}
                      >
                        <span className="text-xl">{DB_TYPE_ICONS[t]}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{DB_TYPE_LABELS[t]}</p>
                          <p className="text-[10px] text-muted-foreground">{DB_CONNECTION_TYPE_LABELS[DB_TYPE_CONNECTION_TYPE[t]]}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {step === "config" && (
          <div className="space-y-4 py-2">
            {!isEdit && (
              <button type="button" onClick={() => setStep("type")} className="flex items-center gap-2 text-xs text-primary hover:underline">
                ← Change database type
              </button>
            )}

            <div className="flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3">
              <span className="text-2xl">{DB_TYPE_ICONS[dbType]}</span>
              <div>
                <p className="text-sm font-semibold text-foreground">{DB_TYPE_LABELS[dbType]}</p>
                <Badge variant="outline" className="mt-0.5 text-[10px] border-border">{DB_CONNECTION_TYPE_LABELS[DB_TYPE_CONNECTION_TYPE[dbType]]}</Badge>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Connection Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Production MySQL" className="mt-1.5 bg-card border-border" />
            </div>

            <Separator className="bg-border" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection Details</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((field) => {
                const isSensitive = DB_SENSITIVE_FIELDS.has(field);
                const isLargeField = field === "serviceAccountJson" || field === "connectionUri";
                const visible = showSensitive[field];
                return (
                  <div key={field} className={isLargeField ? "col-span-full" : ""}>
                    <Label className="text-xs text-muted-foreground">{DB_FIELD_LABELS[field] || field}</Label>
                    {isLargeField ? (
                      <Textarea
                        value={config[field] || ""}
                        onChange={(e) => updateField(field, e.target.value)}
                        placeholder={`Enter ${DB_FIELD_LABELS[field] || field}`}
                        className="mt-1.5 bg-card border-border text-xs font-mono min-h-[80px]"
                      />
                    ) : (
                      <div className="relative mt-1.5">
                        <Input
                          type={isSensitive && !visible ? "password" : "text"}
                          value={config[field] || ""}
                          onChange={(e) => updateField(field, e.target.value)}
                          placeholder={DB_TYPE_DEFAULTS[dbType]?.[field] || `Enter ${DB_FIELD_LABELS[field] || field}`}
                          className="bg-card border-border text-xs font-mono pr-9"
                        />
                        {isSensitive && (
                          <button
                            type="button"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowSensitive((p) => ({ ...p, [field]: !p[field] }))}
                          >
                            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Separator className="bg-border" />

            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" className="mt-1.5 bg-card border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. production, analytics" className="mt-1.5 bg-card border-border" />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          {step === "config" && (
            <Button onClick={handleSave} disabled={saving}>
              <Save size={14} className="mr-2" />
              {saving ? "Saving..." : isEdit ? "Update" : "Create Connection"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Delete Confirmation ───────────────────────────────────────────────────── */
function DeleteDialog({ connection, open, onClose }: { connection: Connection | null; open: boolean; onClose: () => void }) {
  const { deleteConnection } = useConnectionStore();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!connection) return;
    setDeleting(true);
    try {
      await deleteConnection(connection._id);
      toast.success(`"${connection.name}" deleted`);
      onClose();
    } catch {
      toast.error("Failed to delete connection");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-background-secondary border-border">
        <DialogHeader>
          <DialogTitle>Delete Connection</DialogTitle>
          <DialogDescription>
            This will permanently remove "{connection?.name}". This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border">Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Connection Card ───────────────────────────────────────────────────────── */
function ConnectionCard({
  conn, onEdit, onDelete, onTest, testing,
}: {
  conn: Connection;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  testing: boolean;
}) {
  const s = STATUS_CFG[conn.status] || STATUS_CFG.untested;
  const StatusIcon = s.icon;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }}>
      <Card className="group relative overflow-hidden border-border bg-background-secondary p-4 transition-all duration-200 hover:border-primary/30 hover:shadow-[0_12px_32px_-16px_hsl(var(--primary)/0.25)]">
        {/* Glow accent */}
        <div className={`absolute left-0 top-0 h-full w-1 rounded-l-lg ${
          conn.status === "connected" ? "bg-emerald-500" : conn.status === "error" ? "bg-red-500" : "bg-amber-500"
        }`} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-card text-xl border border-border shadow-sm">
              {DB_TYPE_ICONS[conn.dbType]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{conn.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="border-border text-[10px]">{DB_TYPE_LABELS[conn.dbType]}</Badge>
                <Badge className={`${s.bg} ${s.color} border-0 text-[10px] gap-1`}>
                  <StatusIcon size={9} />
                  {s.label}
                </Badge>
              </div>
              {conn.description && (
                <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">{conn.description}</p>
              )}
              {conn.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {conn.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-md bg-card border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      <Tag size={8} />{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="outline" className="border-border h-8 px-2.5" onClick={onTest} disabled={testing}>
              {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
              <span className="ml-1.5 hidden sm:inline">Test</span>
            </Button>
            <Button size="sm" variant="outline" className="border-border h-8 px-2.5" onClick={onEdit}>
              <Pencil size={13} />
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-8 px-2.5" onClick={onDelete}>
              <Trash2 size={13} />
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground border-t border-border/50 pt-2.5">
          {conn.config.host && <span>Host: <span className="font-mono text-foreground">{conn.config.host}</span></span>}
          {conn.config.port && <span>Port: <span className="font-mono text-foreground">{conn.config.port}</span></span>}
          {conn.config.database && <span>DB: <span className="font-mono text-foreground">{conn.config.database}</span></span>}
          {conn.config.account && <span>Account: <span className="font-mono text-foreground">{conn.config.account}</span></span>}
          {conn.config.username && <span>User: <span className="font-mono text-foreground">{conn.config.username}</span></span>}
          {conn.lastTestedAt && <span>Tested: {new Date(conn.lastTestedAt).toLocaleDateString()}</span>}
          <span>Created: {new Date(conn.createdAt).toLocaleDateString()}</span>
        </div>
      </Card>
    </motion.div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────────── */
export default function ConnectionsPage() {
  const { connections, loading, fetchConnections, testConnection } = useConnectionStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [deleteConn, setDeleteConn] = useState<Connection | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => { fetchConnections(); }, [fetchConnections]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connections.filter((c) => {
      if (typeFilter !== "all" && c.dbType !== typeFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (q && ![c.name, c.description, c.dbType, ...c.tags].some((v) => v?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [connections, search, typeFilter, statusFilter]);

  const stats = useMemo(() => ({
    total: connections.length,
    connected: connections.filter((c) => c.status === "connected").length,
    error: connections.filter((c) => c.status === "error").length,
    types: new Set(connections.map((c) => c.dbType)).size,
  }), [connections]);

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testConnection(id);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } catch {
      toast.error("Connection test failed");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="page-shell space-y-6">
      {/* Hero */}
      <div className="page-hero">
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="page-kicker">Data sources</p>
            <h1 className="page-title">Database Connections</h1>
            <p className="page-copy">
              Connect to any database — from MySQL and PostgreSQL to Snowflake and BigQuery.
              All credentials are securely stored and encrypted in your account.
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
            <div className="inline-stat">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Total</p>
              <p className="mt-1 text-sm font-medium text-foreground">{stats.total}</p>
            </div>
            <div className="inline-stat">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Connected</p>
              <p className="mt-1 text-sm font-medium text-emerald-400">{stats.connected}</p>
            </div>
            <div className="inline-stat">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Errors</p>
              <p className="mt-1 text-sm font-medium text-red-400">{stats.error}</p>
            </div>
            <div className="inline-stat">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">DB Types</p>
              <p className="mt-1 text-sm font-medium text-foreground">{stats.types}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar-panel">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative flex-1 sm:max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search connections..." className="pl-9 bg-background-secondary border-border" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full bg-background-secondary border-border sm:w-[160px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border max-h-72">
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(DB_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">{DB_TYPE_ICONS[key as DbType]} {label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full bg-background-secondary border-border sm:w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="connected">Connected</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="untested">Untested</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => { setEditConn(null); setFormOpen(true); }}>
            <Plus size={14} className="mr-2" /> Add Connection
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && connections.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 size={28} className="animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading connections...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && connections.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-4 p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10">
            <Cable size={28} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">No connections yet</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Connect your first database to start querying data with natural language. We support 14+ database types.
            </p>
          </div>
          <Button onClick={() => { setEditConn(null); setFormOpen(true); }}>
            <Plus size={14} className="mr-2" /> Add Your First Connection
          </Button>
        </Card>
      )}

      {/* No results */}
      {!loading && connections.length > 0 && filtered.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <Search size={24} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No connections match your filters.</p>
        </Card>
      )}

      {/* Connection list */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.map((conn) => (
            <ConnectionCard
              key={conn._id}
              conn={conn}
              onEdit={() => { setEditConn(conn); setFormOpen(true); }}
              onDelete={() => setDeleteConn(conn)}
              onTest={() => handleTest(conn._id)}
              testing={testingId === conn._id}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Supported databases info */}
      {connections.length > 0 && (
        <Card className="p-4 bg-background-secondary border-border">
          <div className="flex items-center gap-2 mb-3">
            <Info size={14} className="text-primary" />
            <span className="text-xs font-medium text-foreground">Supported Databases</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(DB_TYPE_LABELS).map(([key, label]) => (
              <Badge key={key} variant="outline" className="border-border text-xs gap-1.5">
                {DB_TYPE_ICONS[key as DbType]} {label}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Dialogs */}
      <ConnectionFormDialog open={formOpen} onClose={() => { setFormOpen(false); setEditConn(null); }} editConnection={editConn} />
      <DeleteDialog connection={deleteConn} open={!!deleteConn} onClose={() => setDeleteConn(null)} />
    </div>
  );
}

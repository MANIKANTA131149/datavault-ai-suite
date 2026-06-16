import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Database,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  EyeOff,
  Save,
  TestTube2,
  X,
  Tag,
  Pencil,
  Cable,
  Server,
  HardDrive,
  Cloud,
  Loader2,
  Info,
  Grid3X3,
  List,
  ArrowUpDown,
  Copy,
  ChevronRight,
  MessageSquare,
  ShieldCheck,
  Calendar,
  KeyRound,
  SlidersHorizontal,
  RefreshCw,
  Activity,
  Zap,
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
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge as SharedStatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardGridSkeleton } from "@/components/shared/Skeletons";
import { FilterToolbar } from "@/components/shared/FilterToolbar";
import { DensityToggle } from "@/components/shared/DensityToggle";
import { DbTypeIcon } from "@/components/DbTypeIcon";
import { toast } from "@/lib/toast";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import {
  useConnectionStore,
  DB_TYPE_LABELS,
  DB_TYPE_FIELDS,
  DB_TYPE_DEFAULTS,
  DB_TYPE_CONNECTION_TYPE,
  DB_CONNECTION_TYPE_LABELS,
  DB_FIELD_LABELS,
  DB_SENSITIVE_FIELDS,
  DB_CATEGORIES,
  type DbType,
  type Connection,
  type ConnectionStatus,
} from "@/stores/connection-store";

type ConnectionView = "grid" | "list";
type ConnectionSort = "newest" | "oldest" | "name" | "type" | "status";
type ConnectionDensity = "comfortable" | "compact";

const CONNECTION_VIEW_KEY = "datavault-connection-view";
const CONNECTION_SORT_KEY = "datavault-connection-sort";
const CONNECTION_DENSITY_KEY = "datavault-connection-density";

const STATUS_CFG: Record<ConnectionStatus, { icon: typeof CheckCircle2; color: string; bg: string; border: string; label: string }> = {
  connected: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    label: "Connected",
  },
  error: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/25",
    label: "Error",
  },
  untested: {
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    label: "Untested",
  },
};

const CATEGORY_ICONS = [Server, Cloud, Database, HardDrive];
const SORT_LABELS: Record<ConnectionSort, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  name: "Name",
  type: "Database type",
  status: "Status",
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "") as T;
  } catch {
    return fallback;
  }
}

function highlightText(text: string, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-primary/20 px-0.5 text-foreground">{text.slice(index, index + trimmed.length)}</mark>
      {text.slice(index + trimmed.length)}
    </>
  );
}

function ConnectionNameText({ label, query }: { label: string; query: string }) {
  return (
    <span
      className="block min-w-0 text-sm font-semibold leading-snug text-foreground"
      title={label}
      style={{
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        overflowWrap: "anywhere",
      }}
    >
      {highlightText(label, query)}
    </span>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString();
}

function relativeTime(value?: string | null): string {
  if (!value) return "Never tested";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

function getConnectionCategory(dbType: DbType) {
  return DB_CATEGORIES.find((category) => category.types.includes(dbType))?.label || "Database";
}

function getPrimaryTarget(conn: Connection) {
  return (
    conn.config.host ||
    conn.config.account ||
    conn.config.projectId ||
    conn.config.serverHostname ||
    conn.config.url ||
    conn.config.filePath ||
    "Configured"
  );
}

function getSecondaryTarget(conn: Connection) {
  return conn.config.database || conn.config.schema || conn.config.warehouse || conn.config.serviceName || "";
}

function getVisibleConfigFields(conn: Connection) {
  return Array.from(new Set([...(DB_TYPE_FIELDS[conn.dbType] || []), ...Object.keys(conn.config || {})]));
}

function getMaskedValue(field: string, value?: string) {
  if (!value) return "Not set";
  if (DB_SENSITIVE_FIELDS.has(field)) return "Configured (hidden)";
  if (value.length > 80) return `${value.slice(0, 80)}...`;
  return value;
}

function getSearchFields(conn: Connection) {
  const safeConfigValues = Object.entries(conn.config || {})
    .filter(([field]) => !DB_SENSITIVE_FIELDS.has(field))
    .map(([, value]) => value || "");

  return [
    conn.name,
    conn.description,
    conn.dbType,
    DB_TYPE_LABELS[conn.dbType],
    getConnectionCategory(conn.dbType),
    getPrimaryTarget(conn),
    getSecondaryTarget(conn),
    ...safeConfigValues,
    ...(conn.tags || []),
  ].filter(Boolean);
}

function copyText(text: string, message: string) {
  navigator.clipboard.writeText(text);
  toast.success(message);
}

function ConnectionFormDialog({
  open,
  onClose,
  editConnection,
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

  useEffect(() => {
    if (!open) return;

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
  }, [open, editConnection]);

  useEffect(() => {
    if (!isEdit) {
      setConfig({ ...DB_TYPE_DEFAULTS[dbType] });
    }
  }, [dbType, isEdit]);

  const fields = DB_TYPE_FIELDS[dbType] || [];

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Connection name is required");
      return;
    }

    setSaving(true);
    try {
      const tagList = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
      if (isEdit && editConnection) {
        await updateConnection(editConnection._id, {
          name: name.trim(),
          config,
          description,
          tags: tagList,
        });
        toast.success("Connection updated");
      } else {
        await addConnection({
          name: name.trim(),
          dbType,
          config,
          description,
          tags: tagList,
        });
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
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border bg-background-secondary">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Pencil size={16} /> : <Plus size={16} />}
            {isEdit ? "Edit connection" : "New database connection"}
          </DialogTitle>
          <DialogDescription>
            {step === "type"
              ? "Choose the database engine first. The next step only asks for fields that engine needs."
              : `Configure your ${DB_TYPE_LABELS[dbType]} connection.`}
          </DialogDescription>
        </DialogHeader>

        {step === "type" && !isEdit && (
          <div className="space-y-4 py-2">
            {DB_CATEGORIES.map((category, categoryIndex) => {
              const CategoryIcon = CATEGORY_ICONS[categoryIndex] || Database;
              return (
                <div key={category.label}>
                  <div className="mb-2 flex items-center gap-2">
                    <CategoryIcon size={13} className="text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{category.label}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {category.types.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setDbType(type);
                          setStep("config");
                        }}
                        className={`group relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.3)] ${
                          dbType === type ? "border-primary/50 bg-primary/10" : "border-border bg-card/70"
                        }`}
                      >
                        <DbTypeIcon dbType={type} size={16} className="text-primary/70" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{DB_TYPE_LABELS[type]}</p>
                          <p className="text-[10px] text-muted-foreground">{DB_CONNECTION_TYPE_LABELS[DB_TYPE_CONNECTION_TYPE[type]]}</p>
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
                Change database type
              </button>
            )}

            <div className="flex items-center gap-3 rounded-xl border border-border bg-card/70 p-3">
              <DbTypeIcon dbType={dbType} size={20} className="text-primary/80" />
              <div>
                <p className="text-sm font-semibold text-foreground">{DB_TYPE_LABELS[dbType]}</p>
                <Badge variant="outline" className="mt-0.5 border-border text-[10px]">
                  {DB_CONNECTION_TYPE_LABELS[DB_TYPE_CONNECTION_TYPE[dbType]]}
                </Badge>
              </div>
            </div>

            <div className="form-field">
              <Label className="form-field-label">Connection name *</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Production PostgreSQL"
                className="border-border bg-card"
              />
            </div>

            <Separator className="bg-border" />
            <p className="form-section-title">Connection Details</p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map((field) => {
                const isSensitive = DB_SENSITIVE_FIELDS.has(field);
                const isLargeField = field === "serviceAccountJson" || field === "connectionUri";
                const visible = showSensitive[field];

                return (
                  <div key={field} className={cn("form-field", isLargeField ? "col-span-full" : "")}>
                    <Label className="form-field-label">{DB_FIELD_LABELS[field] || field}</Label>
                    {isLargeField ? (
                      <Textarea
                        value={config[field] || ""}
                        onChange={(event) => updateField(field, event.target.value)}
                        placeholder={`Enter ${DB_FIELD_LABELS[field] || field}`}
                        className="mt-1.5 min-h-[80px] border-border bg-card font-mono text-xs"
                      />
                    ) : (
                      <div className="relative mt-1.5">
                        <Input
                          type={isSensitive && !visible ? "password" : "text"}
                          value={config[field] || ""}
                          onChange={(event) => updateField(field, event.target.value)}
                          placeholder={DB_TYPE_DEFAULTS[dbType]?.[field] || `Enter ${DB_FIELD_LABELS[field] || field}`}
                          className="border-border bg-card pr-9 font-mono text-xs"
                        />
                        {isSensitive && (
                          <button
                            type="button"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowSensitive((prev) => ({ ...prev, [field]: !prev[field] }))}
                            aria-label={visible ? "Hide field" : "Show field"}
                            title={visible ? "Hide field" : "Show field"}
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

            <div className="form-field">
              <Label className="form-field-label">Description</Label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional description"
                className="border-border bg-card"
              />
            </div>
            <div className="form-field">
              <Label className="form-field-label">Tags</Label>
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="production, analytics, finance"
                className="border-border bg-card"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-border">
            Cancel
          </Button>
          {step === "config" && (
            <Button onClick={handleSave} disabled={saving}>
              <Save size={14} className="mr-2" />
              {saving ? "Saving..." : isEdit ? "Update" : "Create connection"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  connection,
  open,
  onClose,
  onDeleted,
}: {
  connection: Connection | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: (connectionId: string) => void;
}) {
  const { deleteConnection } = useConnectionStore();
  const [deleting, setDeleting] = useState(false);
  const [dependencyWarningData, setDependencyWarningData] = useState<{ isUsed: boolean; deployments: any[] } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open || !connection) {
      setDependencyWarningData(null);
      return;
    }
    setChecking(true);
    api
      .get<{ isUsed: boolean; deployments: any[] }>(
        `/deployments/check-dependency?connectionId=${connection._id}`
      )
      .then((data) => {
        if (data.isUsed) {
          setDependencyWarningData({ isUsed: true, deployments: data.deployments });
        }
      })
      .catch((err) => console.error("Dependency check failed:", err))
      .finally(() => setChecking(false));
  }, [open, connection]);

  const handleDelete = async () => {
    if (!connection) return;
    setDeleting(true);
    try {
      await deleteConnection(connection._id);
      toast.success(`"${connection.name}" deleted`);
      onDeleted?.(connection._id);
      onClose();
    } catch {
      toast.error("Failed to delete connection");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="border-border bg-background-secondary">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {dependencyWarningData ? (
              <AlertTriangle className="text-warning shrink-0" size={18} />
            ) : null}
            {dependencyWarningData ? "Database Connection In Use" : "Delete connection"}
          </DialogTitle>
          <DialogDescription>
            {dependencyWarningData ? (
              <span className="text-warning font-medium">
                WARNING: This database connection is connected to active, deployed chatbots. Deleting it will break their functionality!
              </span>
            ) : (
              `This will permanently remove "${connection?.name}". This action cannot be undone.`
            )}
          </DialogDescription>
        </DialogHeader>

        {dependencyWarningData && dependencyWarningData.deployments.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Affected deployments:</p>
            <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-md border border-border bg-card p-2.5">
              {dependencyWarningData.deployments.map((dep: any) => (
                <div key={dep.id || dep._id} className="flex items-center justify-between text-xs text-foreground">
                  <span className="font-medium truncate max-w-[180px]">{dep.name}</span>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {dep.status || "active"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} className="border-border">
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting || checking}>
            {deleting ? "Deleting..." : dependencyWarningData ? "Force Delete" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  return <SharedStatusBadge status={status} />;
}

function ConnectionActions({
  conn,
  onEdit,
  onDelete,
  onTest,
  onQuery,
  testing,
  compact = false,
}: {
  conn: Connection;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onQuery: () => void;
  testing: boolean;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className={`${compact ? "h-8 px-2" : "h-8 px-2.5"} border-border`}
        onClick={(event) => {
          event.stopPropagation();
          onTest();
        }}
        disabled={testing}
      >
        {testing ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
        {!compact && <span className="ml-1.5 hidden sm:inline">Test</span>}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={`${compact ? "h-8 px-2" : "h-8 px-2.5"} border-border`}
        onClick={(event) => {
          event.stopPropagation();
          onQuery();
        }}
        disabled={conn.status !== "connected"}
        title={conn.status === "connected" ? "Open in Query" : "Test this connection before querying"}
      >
        <MessageSquare size={13} />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className={`${compact ? "h-8 px-2" : "h-8 px-2.5"} border-border`}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <Pencil size={13} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className={`${compact ? "h-8 px-2" : "h-8 px-2.5"} text-muted-foreground hover:bg-destructive/10 hover:text-destructive`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

function ConnectionCard({
  conn,
  query,
  density,
  onOpen,
  onEdit,
  onDelete,
  onTest,
  onQuery,
  onTagClick,
  testing,
}: {
  conn: Connection;
  query: string;
  density: ConnectionDensity;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onQuery: () => void;
  onTagClick: (tag: string) => void;
  testing: boolean;
}) {
  const cfg = STATUS_CFG[conn.status] || STATUS_CFG.untested;
  const primaryTarget = getPrimaryTarget(conn);
  const secondaryTarget = getSecondaryTarget(conn);
  const compact = density === "compact";

  return (
    <motion.div variants={fadeUp} exit={{ opacity: 0, scale: 0.96 }} whileHover={{ y: -2, transition: { duration: 0.15 } }}>
      <Card
        onClick={onOpen}
        className={`group relative min-h-full cursor-pointer overflow-hidden border-border bg-background-secondary transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_6px_20px_-10px_hsl(var(--primary)/0.22)] ${
          compact ? "p-3" : "p-4"
        }`}
      >
        <div className={`absolute inset-x-0 top-0 h-1 ${conn.status === "connected" ? "bg-emerald-500" : conn.status === "error" ? "bg-red-500" : "bg-amber-500"}`} />
        <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-3xl transition-opacity group-hover:opacity-100 md:opacity-0" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex shrink-0 items-center justify-center rounded-2xl border border-border bg-card shadow-sm ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
              <DbTypeIcon dbType={conn.dbType} size={compact ? 16 : 18} className="text-primary/70" />
            </div>
            <div className="min-w-0">
              <ConnectionNameText label={conn.name} query={query} />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="border-border text-[10px]">
                  {DB_TYPE_LABELS[conn.dbType]}
                </Badge>
                <StatusBadge status={conn.status} />
              </div>
            </div>
          </div>

          <div className="reveal-actions flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Copy connection name"
              title="Copy connection name"
              onClick={(event) => {
                event.stopPropagation();
                copyText(conn.name, "Connection name copied");
              }}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <Copy size={12} />
            </button>
            <ChevronRight size={14} className="text-muted-foreground" />
          </div>
        </div>

        {!compact && conn.description && (
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{conn.description}</p>
        )}

        <div className={`grid gap-2 ${compact ? "mt-3 grid-cols-1" : "mt-4 grid-cols-2"}`}>
          <div className="rounded-lg border border-border/70 bg-card/70 p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground" title={primaryTarget}>{primaryTarget}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-card/70 p-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Database</p>
            <p className="mt-1 truncate font-mono text-xs text-foreground" title={secondaryTarget || "Not set"}>{secondaryTarget || "Not set"}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
            {getConnectionCategory(conn.dbType)}
          </Badge>
          <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
            {DB_CONNECTION_TYPE_LABELS[DB_TYPE_CONNECTION_TYPE[conn.dbType]]}
          </Badge>
          {(conn.tags || []).slice(0, compact ? 2 : 4).map((tag) => (
            <button key={tag} type="button" onClick={(e) => { e.stopPropagation(); onTagClick(tag); }}>
              <Badge variant="outline" className="border-border text-[10px] text-muted-foreground cursor-pointer hover:bg-primary/10 hover:border-primary/30 hover:text-primary transition-colors">
                <Tag size={8} className="mr-1" />
                {tag}
              </Badge>
            </button>
          ))}
          {(conn.tags || []).length > (compact ? 2 : 4) && (
            <Badge variant="outline" className="border-border text-[10px] text-muted-foreground">
              +{conn.tags.length - (compact ? 2 : 4)}
            </Badge>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <div className="min-w-0 text-[11px] text-muted-foreground">
            <span className={cfg.color}>{cfg.label}</span>
            <span> · {relativeTime(conn.lastTestedAt)}</span>
          </div>
          <ConnectionActions
            conn={conn}
            onEdit={onEdit}
            onDelete={onDelete}
            onTest={onTest}
            onQuery={onQuery}
            testing={testing}
            compact
          />
        </div>
      </Card>
    </motion.div>
  );
}

function ConnectionDetailPanel({
  connection,
  onClose,
  onEdit,
  onDelete,
  onTest,
  onQuery,
  testing,
}: {
  connection: Connection;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  onQuery: () => void;
  testing: boolean;
}) {
  const fields = getVisibleConfigFields(connection);

  // Portaled to <body>: the route wrapper is a transformed scroll container,
  // which would otherwise capture this fixed panel and scroll/clip it with
  // the page. The portal keeps it truly viewport-fixed and above the top bar.
  return createPortal(
    <motion.div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-border/55 bg-background-secondary shadow-[-24px_0_48px_-24px_hsl(var(--foreground)/0.25)] sm:max-w-xl"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
            <DbTypeIcon dbType={connection.dbType} size={15} className="text-primary/80" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{connection.name}</h3>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-[11px] text-muted-foreground">{DB_TYPE_LABELS[connection.dbType]}</p>
              <StatusBadge status={connection.status} />
            </div>
          </div>
        </div>
        <button aria-label="Close connection details" title="Close" onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground">
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/50 px-4 py-2">
        {[
          { label: "type", value: DB_CONNECTION_TYPE_LABELS[DB_TYPE_CONNECTION_TYPE[connection.dbType]], icon: Database },
          { label: "created", value: formatDate(connection.createdAt), icon: Calendar },
          { label: "tested", value: formatDate(connection.lastTestedAt), icon: TestTube2 },
        ].map(({ label, value, icon: Icon }) => (
          <span key={label} className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon size={11} className="shrink-0" />
            <span className="font-semibold text-foreground">{value}</span>
            <span>{label}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-border">
        <Button size="sm" onClick={onQuery} disabled={connection.status !== "connected"}>
          <MessageSquare size={14} className="mr-2" />
          Open in Query
        </Button>
        <Button size="sm" variant="outline" className="border-border" onClick={onTest} disabled={testing}>
          {testing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <TestTube2 size={14} className="mr-2" />}
          Test connection
        </Button>
        <Button size="sm" variant="outline" className="border-border" onClick={onEdit}>
          <Pencil size={14} className="mr-2" />
          Edit
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={onDelete}>
          <Trash2 size={14} className="mr-2" />
          Delete
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {connection.description && (
          <Card className="border-border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
              <Info size={13} />
              Description
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{connection.description}</p>
          </Card>
        )}

        <Card className="border-border bg-card p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Connection details</p>
              <p className="mt-1 text-xs text-muted-foreground">Sensitive values are intentionally hidden.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-border text-xs"
              onClick={() => copyText(connection.name, "Connection name copied")}
            >
              <Copy size={12} className="mr-1.5" />
              Copy name
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field} className="rounded-lg border border-border/70 bg-background-secondary p-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {DB_SENSITIVE_FIELDS.has(field) ? <KeyRound size={10} /> : <Database size={10} />}
                  {DB_FIELD_LABELS[field] || field}
                </div>
                <p className="mt-1 break-words font-mono text-xs text-foreground">
                  {getMaskedValue(field, connection.config[field])}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {connection.tags.length > 0 && (
          <Card className="border-border bg-card p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {connection.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="border-border text-xs">
                  <Tag size={9} className="mr-1" />
                  {tag}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    </motion.div>,
    document.body
  );
}

export default function ConnectionsPage() {
  const navigate = useNavigate();
  const { connections, loading, fetchConnections, testConnection } = useConnectionStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<ConnectionSort>(() => readJson<ConnectionSort>(CONNECTION_SORT_KEY, "newest"));
  const [viewMode, setViewMode] = useState<ConnectionView>(() => readJson<ConnectionView>(CONNECTION_VIEW_KEY, "grid"));
  const [density, setDensity] = useState<ConnectionDensity>(() => readJson<ConnectionDensity>(CONNECTION_DENSITY_KEY, "comfortable"));
  const [formOpen, setFormOpen] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [deleteConn, setDeleteConn] = useState<Connection | null>(null);
  const [selectedConn, setSelectedConn] = useState<Connection | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    localStorage.setItem(CONNECTION_VIEW_KEY, JSON.stringify(viewMode));
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(CONNECTION_SORT_KEY, JSON.stringify(sortBy));
  }, [sortBy]);

  useEffect(() => {
    localStorage.setItem(CONNECTION_DENSITY_KEY, JSON.stringify(density));
  }, [density]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return connections
      .filter((conn) => {
        if (typeFilter !== "all" && conn.dbType !== typeFilter) return false;
        if (statusFilter !== "all" && conn.status !== statusFilter) return false;
        if (query && !getSearchFields(conn).some((value) => value.toLowerCase().includes(query))) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "type") return DB_TYPE_LABELS[a.dbType].localeCompare(DB_TYPE_LABELS[b.dbType]) || a.name.localeCompare(b.name);
        if (sortBy === "status") return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [connections, search, typeFilter, statusFilter, sortBy]);

  const stats = useMemo(() => ({
    total: connections.length,
    connected: connections.filter((conn) => conn.status === "connected").length,
    error: connections.filter((conn) => conn.status === "error").length,
    untested: connections.filter((conn) => conn.status === "untested").length,
    types: new Set(connections.map((conn) => conn.dbType)).size,
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

  const openEdit = (conn: Connection) => {
    setEditConn(conn);
    setFormOpen(true);
  };

  const openDelete = (conn: Connection) => {
    setDeleteConn(conn);
  };

  const openQuery = (conn: Connection) => {
    if (conn.status !== "connected") {
      toast.warning("Test this connection successfully before querying it.");
      return;
    }
    navigate(`/app/query?dataset=${encodeURIComponent(`conn:${conn._id}`)}`);
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
  };

  const testAll = async () => {
    const toTest = connections.filter((c) => c.status !== "connected");
    if (toTest.length === 0) return;
    setTestingAll(true);
    try {
      const results = await Promise.allSettled(toTest.map((c) => testConnection(c._id)));
      const passed = results.filter((r) => r.status === "fulfilled" && (r.value as any).success).length;
      toast.success(`${passed} of ${toTest.length} connection${toTest.length === 1 ? "" : "s"} passed`);
    } catch {
      toast.error("Some tests failed");
    } finally {
      setTestingAll(false);
    }
  };

  return (
    <div className="page-shell page-enter space-y-6">
      <PageHeader
        title="Database connections"
        titleIcon={Cable}
        info="Keep warehouse, transactional, local, and search connections organized with clean cards, table view, quick testing, and one-click handoff into the Query page."
        stats={[
          { label: "Total", value: stats.total },
          { label: "Ready", value: stats.connected, tone: "success" },
          { label: "Needs fix", value: stats.error, tone: "danger" },
          { label: "DB types", value: stats.types, tone: "info" },
        ]}
      />

      {connections.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { label: "Total", value: stats.total, icon: Cable, color: "text-primary", bg: "bg-primary/10", filter: null as string | null },
            { label: "Connected", value: stats.connected, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", filter: "connected" },
            { label: "Error", value: stats.error, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10", filter: "error" },
            { label: "DB types", value: stats.types, icon: Database, color: "text-blue-400", bg: "bg-blue-500/10", filter: null as string | null },
          ] as const).map(({ label, value, icon: Icon, color, bg, filter }) => (
            <Card
              key={label}
              className={`flex items-center gap-3 p-3 bg-background-secondary border-border transition-all ${
                filter ? "cursor-pointer hover:border-primary/30" : ""
              } ${statusFilter === filter && filter ? "border-primary/40 bg-primary/5" : ""}`}
              onClick={() => { if (filter) setStatusFilter(statusFilter === filter ? "all" : filter); }}
            >
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${bg}`}>
                <Icon size={14} className={color} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      {connections.length > 0 && (
        <FilterToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search names, hosts, databases, tags…"
          filters={[
            {
              key: "type",
              label: "Type",
              options: [
                { value: "all", label: "All types" },
                ...Object.entries(DB_TYPE_LABELS).map(([key, label]) => ({ value: key, label })),
              ],
            },
            {
              key: "status",
              label: "Status",
              options: [
                { value: "all", label: `All (${connections.length})` },
                { value: "connected", label: `Connected (${stats.connected})` },
                { value: "error", label: `Error (${stats.error})` },
                { value: "untested", label: `Untested (${stats.untested})` },
              ],
            },
          ]}
          values={{ type: typeFilter, status: statusFilter }}
          onValueChange={(key, value) => {
            if (key === "type") setTypeFilter(value);
            else if (key === "status") setStatusFilter(value);
          }}
          onClearAll={clearFilters}
          trailing={
            <>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as ConnectionSort)}>
                <SelectTrigger className="h-9 w-[140px] border-border bg-background-secondary text-xs">
                  <ArrowUpDown size={12} className="mr-1.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover">
                  {Object.entries(SORT_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DensityToggle value={density} onValueChange={setDensity} showLabel={false} />
              <div className="flex rounded-lg border border-border bg-background-secondary p-0.5">
                <button
                  type="button"
                  aria-label="Grid view"
                  title="Grid view"
                  onClick={() => setViewMode("grid")}
                  className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Grid3X3 size={14} />
                </button>
                <button
                  type="button"
                  aria-label="Table view"
                  title="Table view"
                  onClick={() => setViewMode("list")}
                  className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <List size={14} />
                </button>
              </div>
              {connections.some((c) => c.status !== "connected") && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 border-border text-xs"
                  onClick={testAll}
                  disabled={testingAll}
                >
                  <RefreshCw size={12} className={`mr-1.5 ${testingAll ? "animate-spin" : ""}`} />
                  {testingAll ? "Testing…" : "Test all"}
                </Button>
              )}
              <Button size="sm" className="h-9 text-xs" onClick={() => { setEditConn(null); setFormOpen(true); }}>
                <Plus size={13} className="mr-1.5" />
                Add connection
              </Button>
            </>
          }
        />
      )}

      {loading && connections.length === 0 ? (
        <CardGridSkeleton cards={6} />
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Cable}
          title="No database connections yet"
          description="Connect PostgreSQL, MySQL, Snowflake, BigQuery, and more to start querying your data with AI."
          action={
            <Button onClick={() => { setEditConn(null); setFormOpen(true); }}>
              <Plus size={14} className="mr-2" />
              Add your first connection
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching connections"
          description="Try a different search term, type, or status filter."
          action={
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X size={12} className="mr-1" /> Clear filters
            </Button>
          }
        />
      ) : viewMode === "list" ? (
        <div className="page-table-wrap data-table-sticky">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-background-secondary">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Connection</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground md:table-cell">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground lg:table-cell">Target</th>
                <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground lg:table-cell">Tested</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((conn) => (
                <tr key={conn._id} className="cursor-pointer border-t border-border hover:bg-card/50" onClick={() => setSelectedConn(conn)}>
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <DbTypeIcon dbType={conn.dbType} size={15} className="mt-0.5 shrink-0 text-primary/70" />
                      <div className="min-w-0">
                        <ConnectionNameText label={conn.name} query={search} />
                        <div className="mt-1 flex flex-wrap gap-1">
                          {conn.description && <span className="max-w-xs truncate text-xs text-muted-foreground">{conn.description}</span>}
                          {conn.tags.map((tag) => (
                            <button key={tag} type="button" onClick={(e) => { e.stopPropagation(); setSearch(tag); }}>
                              <Badge variant="outline" className="border-border text-[10px] cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors">{tag}</Badge>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{DB_TYPE_LABELS[conn.dbType]}</td>
                  <td className="px-4 py-3"><StatusBadge status={conn.status} /></td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <div className="max-w-[260px]">
                      <p className="truncate font-mono text-xs text-foreground" title={getPrimaryTarget(conn)}>{getPrimaryTarget(conn)}</p>
                      <p className="truncate text-xs text-muted-foreground" title={getSecondaryTarget(conn)}>{getSecondaryTarget(conn) || getConnectionCategory(conn.dbType)}</p>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                    <span className="flex items-center gap-1" title={formatDate(conn.lastTestedAt)}>
                      <Clock size={10} />{relativeTime(conn.lastTestedAt)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <ConnectionActions
                        conn={conn}
                        onEdit={() => openEdit(conn)}
                        onDelete={() => openDelete(conn)}
                        onTest={() => handleTest(conn._id)}
                        onQuery={() => openQuery(conn)}
                        testing={testingId === conn._id}
                        compact
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          variants={stagger}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((conn) => (
              <ConnectionCard
                key={conn._id}
                conn={conn}
                query={search}
                density={density}
                onOpen={() => setSelectedConn(conn)}
                onEdit={() => openEdit(conn)}
                onDelete={() => openDelete(conn)}
                onTest={() => handleTest(conn._id)}
                onQuery={() => openQuery(conn)}
                onTagClick={(tag) => setSearch(tag)}
                testing={testingId === conn._id}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {selectedConn && (
          <ConnectionDetailPanel
            connection={selectedConn}
            onClose={() => setSelectedConn(null)}
            onEdit={() => openEdit(selectedConn)}
            onDelete={() => openDelete(selectedConn)}
            onTest={() => handleTest(selectedConn._id)}
            onQuery={() => openQuery(selectedConn)}
            testing={testingId === selectedConn._id}
          />
        )}
      </AnimatePresence>

      <ConnectionFormDialog
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditConn(null);
        }}
        editConnection={editConn}
      />
      <DeleteDialog
        connection={deleteConn}
        open={!!deleteConn}
        onClose={() => setDeleteConn(null)}
        onDeleted={(connectionId) => {
          if (selectedConn?._id === connectionId) setSelectedConn(null);
        }}
      />
    </div>
  );
}

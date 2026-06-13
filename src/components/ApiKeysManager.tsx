// ─── API Keys Manager (F7) ────────────────────────────────────────────────────
// Settings section for the public REST API: create keys (plaintext shown
// exactly once), list usage, revoke. Self-contained — no shared state.

import { useEffect, useState } from "react";
import { KeyRound, Plus, Copy, Trash2, Loader2, Check, TerminalSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { apiKeysApi, type ApiKeyInfo, type CreatedApiKey } from "@/lib/automation-client";
import { getApiBaseUrl } from "@/lib/api-base";
import { toast } from "@/lib/toast";

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setKeys(await apiKeysApi.list());
      } catch (err: any) {
        toast.error(err.message || "Failed to load API keys");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const created = await apiKeysApi.create(newName.trim() || "API key");
      setCreatedKey(created);
      setKeys((prev) => [
        { id: created.id, name: created.name, keyPrefix: created.keyPrefix, scopes: [], revoked: false, lastUsedAt: null, callCount: 0, expiresAt: null, createdAt: created.createdAt },
        ...prev,
      ]);
      setNewName("");
    } catch (err: any) {
      toast.error(err.message || "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const copyKey = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey.key);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await apiKeysApi.revoke(revokeTarget.id);
      setKeys((prev) => prev.map((k) => (k.id === revokeTarget.id ? { ...k, revoked: true } : k)));
      toast.success("API key revoked");
    } catch (err: any) {
      toast.error(err.message || "Revoke failed");
    } finally {
      setRevokeTarget(null);
    }
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreatedKey(null);
    setNewName("");
  };

  const exampleCurl = `curl -X POST ${getApiBaseUrl()}/v1/query \\
  -H "Authorization: Bearer qfy_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"question": "top 5 products by revenue", "datasetId": "YOUR_DATASET_ID"}'`;

  return (
    <div className="space-y-4">
      <Card className="rounded-[18px] border-border/55 bg-card/80 p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <KeyRound size={16} className="text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Public API keys</h3>
              <p className="text-xs text-muted-foreground">Programmatic access to your data via the Querify REST API.</p>
            </div>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus size={13} className="mr-1" /> New key
          </Button>
        </div>

        {loading ? (
          <div className="flex min-h-[12vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            description="Create a key to query your datasets and connections from external apps, scripts, or automation tools."
            compact
          />
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/60 bg-background-secondary/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <code className="shrink-0 rounded bg-card px-2 py-1 font-mono text-xs text-muted-foreground">{k.keyPrefix}…</code>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{k.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {k.callCount.toLocaleString()} call{k.callCount === 1 ? "" : "s"}
                      {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : " · never used"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={k.revoked ? "inactive" : "active"} label={k.revoked ? "Revoked" : "Active"} />
                  {!k.revoked && (
                    <Button variant="outline" size="sm" className="h-7 border-border px-2 text-xs text-destructive hover:bg-destructive/10" onClick={() => setRevokeTarget(k)}>
                      <Trash2 size={11} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="rounded-[18px] border-border/55 bg-card/80 p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <TerminalSquare size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Quick start</h3>
            <p className="text-xs text-muted-foreground">Ask a question in natural language, get SQL + rows back as JSON.</p>
          </div>
        </div>
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-background-secondary p-3 text-[11px] font-mono leading-relaxed text-muted-foreground">
          {exampleCurl}
        </pre>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Endpoints: <code className="font-mono">POST /v1/query</code> (natural language), <code className="font-mono">POST /v1/sql</code> (direct SQL),{" "}
          <code className="font-mono">GET /v1/datasets</code>, <code className="font-mono">GET /v1/connections</code>. Rate limit: 60 requests/minute.
        </p>
      </Card>

      {/* Create dialog — shows the plaintext key exactly once */}
      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) closeCreateDialog(); else setCreateOpen(true); }}>
        <DialogContent className="bg-background-secondary border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound size={15} className="text-primary" />{createdKey ? "Your new API key" : "Create API key"}</DialogTitle>
            <DialogDescription>
              {createdKey
                ? "Copy it now — for security it is shown only this once and cannot be retrieved later."
                : "The key grants programmatic access to your datasets and connections."}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg border border-primary/25 bg-primary/5 px-3 py-2.5 font-mono text-xs text-foreground">
                  {createdKey.key}
                </code>
                <Button variant="outline" size="sm" className="h-9 shrink-0 border-border" onClick={copyKey}>
                  {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                </Button>
              </div>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
                Store it somewhere safe — treat it like a password
              </Badge>
            </div>
          ) : (
            <div className="py-2">
              <label className="text-xs text-muted-foreground">Key name</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Production integration" className="mt-1 bg-card border-border" />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {createdKey ? (
              <Button onClick={closeCreateDialog}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeCreateDialog} className="border-border">Cancel</Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? <Loader2 size={13} className="mr-1 animate-spin" /> : <Plus size={13} className="mr-1" />}Create key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}
        title="Revoke API key"
        description={`"${revokeTarget?.name}" will immediately stop working. Any integration using it will fail. This cannot be undone.`}
        confirmLabel="Revoke key"
        variant="destructive"
        onConfirm={handleRevoke}
      />
    </div>
  );
}

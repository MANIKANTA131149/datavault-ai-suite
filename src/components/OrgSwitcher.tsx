import { useEffect, useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus, Loader2, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { orgsApi, type OrgSummary } from "@/lib/platform-client";
import { toast } from "@/lib/toast";

// Compact workspace switcher for the top bar. Personal workspace is always
// present; shared orgs the user belongs to appear below. Switching sets the
// active org server-side (org_members.isDefault) and reloads so all org-scoped
// data (metrics, members) re-fetches under the new context.
export function OrgSwitcher() {
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, me] = await Promise.all([orgsApi.list(), orgsApi.me()]);
        setOrgs(list);
        setActiveId(me.orgId);
      } catch {
        // Org context is best-effort UI — a failure just hides the switcher.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = orgs.find((o) => o.id === activeId);

  const handleSwitch = async (orgId: string) => {
    if (orgId === activeId) return;
    setSwitching(orgId);
    try {
      await orgsApi.setActive(orgId);
      setActiveId(orgId);
      toast.success("Workspace switched");
      // Reload so org-scoped stores/pages re-fetch under the new active org.
      setTimeout(() => window.location.reload(), 350);
    } catch (err) {
      toast.error((err as Error).message || "Could not switch workspace");
      setSwitching(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return toast.error("Workspace name is required");
    setCreating(true);
    try {
      const created = await orgsApi.create(newName.trim());
      setOrgs((prev) => [...prev, created]);
      setCreateOpen(false);
      setNewName("");
      toast.success("Workspace created");
      await handleSwitch(created.id);
    } catch (err) {
      toast.error((err as Error).message || "Could not create workspace");
    } finally {
      setCreating(false);
    }
  };

  // Hide entirely until loaded, and when the user has only a personal workspace
  // and no shared orgs (nothing to switch) — keeps the bar clean for solo users
  // while still letting them create their first team via the menu.
  if (loading) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch workspace"
            className="focus-ring flex max-w-[160px] items-center gap-1.5 rounded-lg border border-border/45 bg-background/50 px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground"
          >
            {active?.type === "personal" ? <User size={12} className="shrink-0" /> : <Building2 size={12} className="shrink-0" />}
            <span className="truncate font-medium">{active?.name || "Workspace"}</span>
            <ChevronsUpDown size={12} className="shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Workspaces</DropdownMenuLabel>
          {orgs.map((o) => (
            <DropdownMenuItem
              key={o.id}
              onClick={() => handleSwitch(o.id)}
              className="flex items-center gap-2"
            >
              {o.type === "personal" ? <User size={14} className="shrink-0 text-muted-foreground" /> : <Building2 size={14} className="shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {switching === o.id ? (
                <Loader2 size={13} className="shrink-0 animate-spin" />
              ) : o.id === activeId ? (
                <Check size={13} className="shrink-0 text-primary" />
              ) : (
                <span className={cn("shrink-0 text-[10px] capitalize text-muted-foreground")}>{o.role}</span>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="gap-2 text-primary">
            <Plus size={14} /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>Shared workspaces let your team collaborate on datasets, dashboards and metrics.</DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Acme Analytics"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <DialogFooter>
            <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
              {creating && <Loader2 size={14} className="animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

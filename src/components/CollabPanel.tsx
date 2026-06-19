import { useEffect, useState } from "react";
import { MessageCircle, Send, Trash2, Loader2, Link2, Copy, Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { collabApi, type Comment, type Share, type CollabResourceType } from "@/lib/platform-client";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "@/lib/toast";

interface CollabPanelProps {
  resourceType: CollabResourceType;
  resourceId: string;
  /** Show the share-link controls (only meaningful for resources the user owns). */
  allowSharing?: boolean;
  className?: string;
}

// Reusable comments thread (+ optional share-link manager) for any resource.
// Self-contained: fetches on mount, posts/deletes via collabApi. @mentions of a
// teammate's email notify them server-side.
export function CollabPanel({ resourceType, resourceId, allowSharing = false, className }: CollabPanelProps) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const reqs: [Promise<Comment[]>, Promise<Share[]>?] = [collabApi.comments(resourceType, resourceId)];
        if (allowSharing) reqs[1] = collabApi.shares(resourceType, resourceId);
        const [c, s] = await Promise.all([reqs[0], reqs[1] ?? Promise.resolve([])]);
        if (cancelled) return;
        setComments(c);
        setShares(s as Share[]);
      } catch {
        /* collab is best-effort UI */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [resourceType, resourceId, allowSharing]);

  const handlePost = async () => {
    const text = draft.trim();
    if (!text) return;
    setPosting(true);
    try {
      const created = await collabApi.addComment(resourceType, resourceId, text);
      setComments((prev) => [...prev, created]);
      setDraft("");
    } catch (err) {
      toast.error((err as Error).message || "Could not post comment");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await collabApi.removeComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      toast.error((err as Error).message || "Could not delete comment");
    }
  };

  const handleCreateShare = async (role: "viewer" | "editor") => {
    try {
      const share = await collabApi.createShare(resourceType, resourceId, role);
      setShares((prev) => [...prev, share]);
      toast.success(`${role === "editor" ? "Editor" : "Viewer"} link created`);
    } catch (err) {
      toast.error((err as Error).message || "Could not create share link");
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await collabApi.revokeShare(id);
      setShares((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      toast.error((err as Error).message || "Could not revoke link");
    }
  };

  const shareUrl = (s: Share) => `${window.location.origin}/app/${resourceType === "dashboard" ? "dashboards" : resourceType}?share=${s.token}`;
  const copyShare = (s: Share) => {
    navigator.clipboard?.writeText(shareUrl(s));
    setCopiedId(s.id);
    toast.success("Share link copied");
    setTimeout(() => setCopiedId((c) => (c === s.id ? null : c)), 1500);
  };

  return (
    <div className={cn("space-y-4", className)}>
      {allowSharing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Link2 size={14} /> Share links</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs"><Plus size={13} /> New link</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleCreateShare("viewer")}>View only</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCreateShare("editor")}>Can edit</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {shares.length === 0 ? (
            <p className="text-xs text-muted-foreground">No share links yet.</p>
          ) : (
            shares.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/50 px-2.5 py-1.5">
                <Badge variant="secondary" className="text-[10px] capitalize">{s.role}</Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{shareUrl(s)}</span>
                <button onClick={() => copyShare(s)} aria-label="Copy link" className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground">
                  {copiedId === s.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
                <button onClick={() => handleRevoke(s.id)} aria-label="Revoke link" className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <MessageCircle size={14} /> Comments {comments.length > 0 && <span className="text-xs font-normal text-muted-foreground">({comments.length})</span>}
        </h3>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet. Mention a teammate with @their-email to notify them.</p>
        ) : (
          <div className="space-y-2.5">
            {comments.map((c) => (
              <div key={c.id} className="group flex gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-[10px] font-semibold text-primary">
                  {(c.authorName || c.authorEmail || "U").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-foreground">{c.authorName || c.authorEmail}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                    {c.authorEmail === user?.email && (
                      <button onClick={() => handleDelete(c.id)} aria-label="Delete comment" className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"><Trash2 size={12} /></button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 pt-1">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment… use @email to mention"
            rows={2}
            className="min-h-[40px] resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handlePost(); }
            }}
          />
          <Button onClick={handlePost} disabled={posting || !draft.trim()} size="icon" className="h-9 w-9 shrink-0">
            {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </Button>
        </div>
      </div>
    </div>
  );
}

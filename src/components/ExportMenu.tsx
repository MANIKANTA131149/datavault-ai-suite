import { useEffect, useRef, useState } from "react";
import {
  Braces,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FileType2,
  Image as ImageIcon,
  Loader2,
  Moon,
  Shapes,
  Square,
  Sun,
  Table as TableIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  chartToRasterDataUrl,
  copyChartToClipboard,
  detectTheme,
  downloadChartRaster,
  downloadChartSvg,
  type ExportTheme,
} from "@/lib/chart-export";
import { copyTableRichText, exportCsv, exportExcel, exportJson, exportMarkdown } from "@/lib/table-export";

export interface ExportMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  getChartNode: () => HTMLElement | null;
  result: any;
  query?: string;
  title?: string;
  onDownloadReport?: () => void | Promise<void>;
  checkExport?: (format: string) => unknown;
  hasChart?: boolean;
  hasTable?: boolean;
}

const slug = (s: string) =>
  (s || "querify").replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "").slice(0, 48) || "querify";

type Row = {
  key: string;
  label: string;
  hint: string;
  icon: typeof ImageIcon;
  run: () => void | Promise<void>;
};

export function ExportMenu({
  open,
  onOpenChange,
  getChartNode,
  result,
  query = "",
  title = "Query result",
  onDownloadReport,
  checkExport,
  hasChart = true,
  hasTable = true,
}: ExportMenuProps) {
  const [theme, setTheme] = useState<ExportTheme>(() => detectTheme());
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const liveRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!open || !hasChart) { setPreview(null); return; }
    let cancelled = false;
    const node = getChartNode();
    if (!node) { setPreview(null); return; }
    chartToRasterDataUrl(node, { theme, format: "png", scale: 1.5 })
      .then((out) => { if (!cancelled) setPreview(out?.dataUrl ?? null); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [open, theme, hasChart, getChartNode]);

  const flash = (key: string) => { setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600); };
  const guard = async (format: string) => { if (checkExport) await checkExport(format); };

  const run = async (key: string, fn: () => void | Promise<void>, successMsg?: string) => {
    setBusy(key);
    try {
      await fn();
      if (successMsg) { toast.success(successMsg); if (liveRef.current) liveRef.current.textContent = successMsg; }
    } catch (err: any) {
      toast.error(err?.message || "Export failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const fileBase = slug(title);
  const node = () => {
    const n = getChartNode();
    if (!n) throw new Error("No chart available to export");
    return n;
  };

  const imageRows: Row[] = [
    { key: "png", label: "PNG image", hint: "Ultra-HD raster, perfect for slides & docs", icon: ImageIcon, run: async () => { await guard("png"); await downloadChartRaster(node(), `${fileBase}.png`, { theme, format: "png", scale: 3 }); } },
    { key: "svg", label: "SVG vector", hint: "Infinitely sharp at any size", icon: Shapes, run: async () => { await guard("svg"); downloadChartSvg(node(), `${fileBase}.svg`, theme); } },
    { key: "jpeg", label: "JPEG image", hint: "Smaller file, great for email", icon: ImageIcon, run: async () => { await guard("jpeg"); await downloadChartRaster(node(), `${fileBase}.jpg`, { theme, format: "jpeg", scale: 3 }); } },
  ];

  const tableRows: Row[] = [
    { key: "csv", label: "CSV", hint: "Excel-safe, UTF-8 encoded", icon: FileSpreadsheet, run: async () => { await guard("csv"); exportCsv(result, `${fileBase}.csv`); } },
    { key: "xls", label: "Excel", hint: "Styled spreadsheet (.xls)", icon: FileSpreadsheet, run: async () => { await guard("xls"); exportExcel(result, `${fileBase}.xls`, title); } },
    { key: "json", label: "JSON", hint: "Raw structured data", icon: Braces, run: async () => { await guard("json"); exportJson(result, `${fileBase}.json`); } },
    { key: "md", label: "Markdown", hint: "Docs & README ready", icon: FileType2, run: async () => { await guard("md"); exportMarkdown(result, query, `${fileBase}.md`); } },
  ];

  const themeChips: { key: ExportTheme; label: string; icon: typeof Sun }[] = [
    { key: "light", label: "Light", icon: Sun },
    { key: "dark", label: "Dark", icon: Moon },
    { key: "transparent", label: "None", icon: Square },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="block max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-md gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Download size={16} className="text-primary" /> Export &amp; share
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[calc(88dvh-60px)] space-y-6 overflow-y-auto px-5 py-5">
          {/* ── Preview ─────────────────────────────────────────────────── */}
          {hasChart && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card/60 p-0.5">
                  {themeChips.map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTheme(key)}
                      title={`${label} background`}
                      aria-pressed={theme === key}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                        theme === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className={cn(
                  "flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl border border-border",
                  theme === "dark" ? "bg-[#0b0f1a]" : theme === "light" ? "bg-white" : "export-checker",
                )}
              >
                {preview ? (
                  <img src={preview} alt="Chart export preview" className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-xs">Rendering preview…</span>
                  </div>
                )}
              </div>
              <ActionButton
                icon={Copy}
                doneIcon={Check}
                done={copied === "copy-img"}
                busy={busy === "copy-img"}
                label="Copy image to clipboard"
                onClick={() =>
                  run("copy-img", async () => {
                    const ok = await copyChartToClipboard(node(), theme);
                    if (ok) { flash("copy-img"); toast.success("Chart copied to clipboard"); }
                    else throw new Error("Clipboard image copy isn't supported in this browser");
                  })
                }
              />
            </section>
          )}

          {/* ── Chart image formats ─────────────────────────────────────── */}
          {hasChart && (
            <Group label="Chart image">
              {imageRows.map((r) => (
                <FormatRow key={r.key} row={r} busy={busy === r.key} onRun={() => run(r.key, r.run, `${r.label} downloaded`)} />
              ))}
            </Group>
          )}

          {/* ── Table & data formats ────────────────────────────────────── */}
          {hasTable && (
            <Group label="Table &amp; data">
              {tableRows.map((r) => (
                <FormatRow key={r.key} row={r} busy={busy === r.key} onRun={() => run(r.key, r.run, `${r.label} downloaded`)} />
              ))}
              <ActionButton
                icon={TableIcon}
                doneIcon={Check}
                done={copied === "copy-table"}
                busy={busy === "copy-table"}
                label="Copy table as rich text"
                onClick={() =>
                  run("copy-table", async () => {
                    const ok = await copyTableRichText(result);
                    if (ok) { flash("copy-table"); toast.success("Table copied — paste into Excel, Sheets, or Docs"); }
                    else throw new Error("Nothing to copy");
                  })
                }
              />
            </Group>
          )}

          {/* ── Report ──────────────────────────────────────────────────── */}
          {onDownloadReport && (
            <Group label="Report">
              <button
                type="button"
                disabled={busy === "report"}
                onClick={() => run("report", async () => { await guard("pdf"); await onDownloadReport(); onOpenChange(false); })}
                className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-left transition-colors hover:bg-primary/10 disabled:opacity-60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  {busy === "report" ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Presentation-ready PDF</span>
                  <span className="block text-xs leading-snug text-muted-foreground">Branded report with chart, summary &amp; table — investor &amp; client ready.</span>
                </span>
              </button>
            </Group>
          )}
        </div>
        <p ref={liveRef} aria-live="polite" className="sr-only" />
      </DialogContent>
    </Dialog>
  );
}

/* ─── Section wrapper ─────────────────────────────────────────────────── */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" dangerouslySetInnerHTML={{ __html: label }} />
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/* ─── Full-width format row (icon + label + hint — never truncates) ───── */
function FormatRow({ row, busy, onRun }: { row: Row; busy: boolean; onRun: () => void }) {
  const Icon = row.icon;
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={busy}
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card/60 p-3 text-left transition-all hover:border-primary/40 hover:bg-card hover:shadow-sm disabled:cursor-wait disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-105">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Icon size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{row.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{row.hint}</span>
      </span>
      <Download size={14} className="shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
    </button>
  );
}

/* ─── Secondary action button (copy actions) ──────────────────────────── */
function ActionButton({
  icon: Icon,
  doneIcon: DoneIcon,
  done,
  busy,
  label,
  onClick,
}: {
  icon: typeof Copy;
  doneIcon: typeof Check;
  done: boolean;
  busy: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/40 px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-card disabled:opacity-60"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : done ? <DoneIcon size={14} className="text-success" /> : <Icon size={14} />}
      {label}
    </button>
  );
}

import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check, Sparkles } from "lucide-react";
import html2canvas from "html2canvas";
import { toast } from "sonner";

interface ShareCardProps {
  open: boolean;
  onClose: () => void;
  query: string;
  result: any;
  datasetName: string;
}

export function ShareCard({ open, onClose, query, result, datasetName }: ShareCardProps) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Extract KPI details
  const isArray = Array.isArray(result);
  const isSingleValue = !isArray && typeof result === "object" && result?.result !== undefined;
  const isPrimitive = !isArray && (typeof result === "number" || typeof result === "boolean");
  const isNarrative = !isArray && typeof result === "object" && result?.narrative !== undefined;

  let kpiValue = "";
  let kpiLabel = "Key Insight";

  if (isSingleValue) {
    kpiValue = typeof result.result === "number" ? result.result.toLocaleString() : String(result.result);
    kpiLabel = "Calculated Value";
  } else if (isPrimitive) {
    kpiValue = String(result);
    kpiLabel = "Value";
  } else if (isArray && result.length > 0) {
    kpiValue = result.length.toLocaleString();
    kpiLabel = "Rows Returned";
  } else if (isNarrative && result.highlights?.length > 0) {
    kpiValue = result.highlights[0].value;
    kpiLabel = result.highlights[0].label;
  } else {
    kpiValue = "Success";
    kpiLabel = "Status";
  }

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        scale: 2, // High-DPI scaling
        backgroundColor: null,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `datavault-insight-${Date.now()}.png`;
      a.click();
      toast.success("Data Story Share Card downloaded!");
    } catch (err) {
      console.error("Failed to generate Share Card PNG:", err);
      toast.error("Failed to generate PNG image.");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        scale: 2,
        backgroundColor: null,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Failed to copy image.");
          return;
        }
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob })
          ]);
          setCopied(true);
          toast.success("Copied share card directly to clipboard!");
          setTimeout(() => setCopied(false), 2000);
        } catch (err) {
          console.error("Clipboard write error:", err);
          toast.error("Clipboard copy is not supported in this browser context.");
        }
      }, "image/png");
    } catch (err) {
      console.error("Failed to copy image:", err);
      toast.error("Failed to generate image copy.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-background-secondary border-border max-w-lg p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} className="text-primary animate-pulse" /> Spotify-Wrapped "Data Story" Card
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Generate and export a gorgeous, high-resolution share card showcasing this query and KPI insight. Perfect for Slack or Teams!
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center justify-center my-4">
          {/* Card Preview Container with z-index, meshes, gradients */}
          <div
            ref={cardRef}
            className="relative w-full aspect-[4/5] max-w-[340px] rounded-3xl overflow-hidden shadow-2xl p-6 flex flex-col justify-between select-none text-left border border-white/10 bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950"
            style={{
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
            }}
          >
            {/* Soft Glowing Mesh Orbs */}
            <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full bg-accent/20 blur-3xl pointer-events-none" />
            <div className="absolute top-1/2 left-1/3 w-36 h-36 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

            {/* Header: Brand and Source */}
            <div className="relative z-10 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-primary font-bold">Querify AI Suite</span>
              <span className="text-[10px] text-muted-foreground bg-white/5 border border-white/10 rounded-full px-2 py-0.5 max-w-[140px] truncate">
                {datasetName || "data_source"}
              </span>
            </div>

            {/* Main Content: Natural Language query */}
            <div className="relative z-10 my-4 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground/80 tracking-wide uppercase">The Question</p>
              <h4 className="text-lg font-bold text-foreground leading-snug tracking-tight line-clamp-4">
                "{query || "Show total revenue"}"
              </h4>
            </div>

            {/* Middle Graphic Segment: abstract mesh preview */}
            <div className="relative z-10 flex-1 my-2 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md p-4 flex flex-col justify-center items-center overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <div className="w-full h-[1px] bg-white transform rotate-12" />
                <div className="w-full h-[1px] bg-white transform -rotate-12" />
              </div>
              <p className="text-[10px] text-muted-foreground/60 mb-1 uppercase tracking-widest font-mono">{kpiLabel}</p>
              <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-primary via-white to-accent font-mono tracking-tight animate-fade-in">
                {kpiValue}
              </div>
            </div>

            {/* Footer details */}
            <div className="relative z-10 mt-4 flex items-end justify-between">
              <div className="space-y-0.5">
                <p className="text-[9px] text-muted-foreground/75">Insight unlocked with AI</p>
                <p className="text-[8px] text-muted-foreground/50">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
              <div className="h-6 w-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-primary">DV</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" size="sm" onClick={handleCopyToClipboard} className="flex items-center gap-1.5 border-border">
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
          <Button size="sm" onClick={handleDownload} disabled={downloading} className="flex items-center gap-1.5">
            <Download size={14} />
            {downloading ? "Exporting..." : "Download PNG"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

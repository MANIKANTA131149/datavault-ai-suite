// ─── Inline dashboard preview for the chat ────────────────────────────────────
// When the agent builds a dashboard, it returns the verified panels together
// with the rows each query produced. This renders them right in the conversation
// so the user sees the live charts immediately, with a link to the full page.

import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, ExternalLink, Hash } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PanelChart, CHART_TYPE_ICON } from "@/components/dashboard/DashboardCharts";
import type { DashboardPanel } from "@/lib/automation-client";

export interface ChatDashboardPanel extends DashboardPanel {
  rows: Record<string, unknown>[];
}

export interface ChatDashboard {
  id: string | null;
  name: string;
  description?: string;
  panels: ChatDashboardPanel[];
}

export function DashboardChatPreview({ dashboard }: { dashboard: ChatDashboard }) {
  const navigate = useNavigate();
  const panels = Array.isArray(dashboard?.panels) ? dashboard.panels : [];
  if (panels.length === 0) return null;

  return (
    <div className="ml-3 mb-3 mt-1 min-w-0 overflow-hidden rounded-xl border border-border bg-card sm:ml-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-gradient-to-r from-primary/5 to-transparent px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <LayoutDashboard size={14} className="text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground" title={dashboard.name}>{dashboard.name}</p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Hash size={9} />
              {panels.length} panel{panels.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        {dashboard.id && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 shrink-0 border-border text-xs"
            onClick={() => navigate("/app/dashboards")}
          >
            Open in Reports
            <ExternalLink size={11} className="ml-1.5" />
          </Button>
        )}
      </div>

      {/* Panels grid — responsive across every breakpoint, equal width, natural heights.
          1 col on phones → 2 on small tablets → 3 on laptops → 4 on ultrawide. */}
      <div className="grid grid-cols-1 items-start gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3 2xl:grid-cols-4">
        {panels.map((panel, idx) => {
          const TypeIcon = CHART_TYPE_ICON[panel.chartType] ?? Hash;
          return (
            <motion.div
              key={panel.id || idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(idx * 0.05, 0.4), ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0"
            >
              <Card className="flex min-w-0 flex-col overflow-hidden border-border/70 bg-background/40 p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-1.5">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <TypeIcon size={12} className="text-primary" />
                    </div>
                    <h4 className="truncate text-xs font-semibold leading-tight text-foreground" title={panel.title}>
                      {panel.title}
                    </h4>
                  </div>
                  <Badge variant="outline" className="shrink-0 border-border text-[9px] capitalize">{panel.chartType}</Badge>
                </div>
                <div className="min-w-0">
                  <PanelChart panel={panel} rows={panel.rows || []} />
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

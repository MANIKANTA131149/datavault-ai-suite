import { motion } from "framer-motion";
import { Database, MessageSquare, Clock, Upload, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useDatasetStore } from "@/stores/dataset-store";
import { useHistoryStore } from "@/stores/history-store";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { datasets } = useDatasetStore();
  const { entries } = useHistoryStore();

  const totalRows = datasets.reduce((s, d) => s + Object.values(d.rowCounts).reduce((a, b) => a + b, 0), 0);
  const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);

  const stats = [
    { label: "Datasets", value: datasets.length, icon: Database, color: "text-primary" },
    { label: "Total Rows", value: totalRows.toLocaleString(), icon: Upload, color: "text-success" },
    { label: "Queries Run", value: entries.length, icon: MessageSquare, color: "text-accent" },
    { label: "Tokens Used", value: totalTokens.toLocaleString(), icon: Clock, color: "text-warning" },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back, {user?.name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mt-1">Here's an overview of your analytics workspace.</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="p-4 bg-background-secondary border-border hover:border-primary/30 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon size={16} className={stat.color} />
              </div>
              <p className="text-2xl font-semibold text-foreground">{stat.value}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-background-secondary border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-between border-border bg-card hover:bg-card/80" onClick={() => navigate("/app/datasets")}>
              <span className="flex items-center gap-2"><Upload size={16} /> Upload a dataset</span>
              <ArrowRight size={14} />
            </Button>
            <Button variant="outline" className="w-full justify-between border-border bg-card hover:bg-card/80" onClick={() => navigate("/app/query")}>
              <span className="flex items-center gap-2"><MessageSquare size={16} /> Start a query</span>
              <ArrowRight size={14} />
            </Button>
            <Button variant="outline" className="w-full justify-between border-border bg-card hover:bg-card/80" onClick={() => navigate("/app/settings")}>
              <span className="flex items-center gap-2"><Database size={16} /> Configure LLM provider</span>
              <ArrowRight size={14} />
            </Button>
          </div>
        </Card>

        <Card className="p-6 bg-background-secondary border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">Recent Queries</h3>
          {entries.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare size={32} className="mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No queries yet</p>
              <Button variant="link" className="text-primary mt-1" onClick={() => navigate("/app/query")}>Run your first query</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {entries.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{entry.query}</p>
                    <p className="text-xs text-muted-foreground">{entry.datasetName} · {entry.model}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${entry.status === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import { Component, ErrorInfo, ReactNode } from "react";
import {
  Compass,
  Database,
  Key,
  MessageSquare,
  Shield,
  ArrowRight,
  Terminal,
  Cpu,
  Layers,
  Network,
  Bookmark,
  FileCode,
  LineChart,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const ARCHITECTURE_STEPS = [
  {
    id: "user-query",
    title: "1. Natural Language Input",
    desc: "The client interface accepts plain English questions from the analyst. It performs local query validation and binds the query context to the active dataset schema coordinates.",
    metric: "Accepts: CSV, Excel, DB structures",
    icon: MessageSquare,
  },
  {
    id: "llm-agent",
    title: "2. Agent Reasoning & Parsing",
    desc: "The system securely translates raw English into target SQL code using the chosen LLM context. It loads metadata descriptions, indexes, and context structures to maximize translation accuracy and prevent hallucination.",
    metric: "Context Size: ~8k to 32k tokens",
    icon: Cpu,
  },
  {
    id: "sql-sandbox",
    title: "3. Secure Execution Sandbox",
    desc: "Querify executes generated queries inside a strictly sandboxed read-only database transaction loop. Write operations are caught and terminated by database transaction locks.",
    metric: "Write Lock: Strictly Enforced",
    icon: Shield,
  },
  {
    id: "visual-report",
    title: "4. Interactive Reports & Charts",
    desc: "Data vectors returned from the database sandbox are parsed dynamically, rendering into responsive dashboard tables, KPI metrics grids, and clean visual graphs.",
    metric: "Render Latency: ~15ms",
    icon: LineChart,
  },
];

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class GetStartedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("GetStartedPage uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center space-y-4 bg-background-secondary border border-destructive/20 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center text-destructive border border-destructive/20">
            <Shield size={24} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-foreground">Onboarding Playground Exception</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              A rendering exception occurred within the onboarding playground. The workspace sandbox has successfully isolated the fault.
            </p>
            {this.state.error && (
              <pre className="text-[10px] text-destructive bg-destructive/5 border border-destructive/10 p-3 rounded-lg font-mono text-left max-w-lg overflow-x-auto whitespace-pre-wrap">
                {this.state.error.toString()}
              </pre>
            )}
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="text-xs border-border hover:bg-muted"
          >
            Reload Interface
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function GetStartedPage() {
  return (
    <GetStartedErrorBoundary>
      <GetStartedPageContent />
    </GetStartedErrorBoundary>
  );
}

function GetStartedPageContent() {
  const navigate = useNavigate();

  return (
    <div className="page-shell-narrow space-y-12 pb-16 text-left">
      {/* Premium Page Header */}
      <PageHeader
        title="Get Started"
        titleIcon={Compass}
        info="Welcome to the onboarding suite. Review the architectural blueprints and operational parameters that power the natural language database interface."
        stats={[
          { label: "Platform Status", value: "Fully Operational", tone: "success", live: true },
          { label: "Provider Keys", value: "AES-256 Encrypted", tone: "accent" },
          { label: "Execution Security", value: "Strict Sandbox", tone: "info" }
        ]}
      />

      {/* ─── SECTION 1: SYSTEM ARCHITECTURE ─────────────────────────────────── */}
      <section className="space-y-6">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Layers size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground font-mono uppercase">1. System Architecture</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">End-to-end data flow from raw prompt input to dynamic reporting.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-background-secondary border border-border text-muted-foreground px-2 py-0.5 rounded">
            Pipeline Scope
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {ARCHITECTURE_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.id} className="p-5 flex flex-col justify-between min-h-[220px] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shrink-0">
                      <Icon size={14} />
                    </div>
                    <span className="text-[13px] font-bold font-mono text-foreground">{step.title}</span>
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/70 flex">
                  <span className="text-[11px] font-mono text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">{step.metric}</span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ─── SECTION 2: DATASET INTEGRATION ─────────────────────────────────── */}
      <section className="space-y-6">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Database size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground font-mono uppercase">2. Dataset Integration</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Attach relational repositories and tabular flat files safely.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-background-secondary border border-border text-muted-foreground px-2 py-0.5 rounded">
            Schema Catalog
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]">
            <div className="space-y-4 text-left">
              <h3 className="text-[14px] font-bold text-foreground">Metadata Cataloging Engine</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                The indexing engine scans dataset headers and maps the relational schemas locally in volatile memory. No permanent storage or dynamic caching of raw records occurs, ensuring maximum data isolation and absolute integrity.
              </p>
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-foreground font-bold block text-left">Technical Parameters</span>
                <ul className="space-y-1.5 font-mono text-[12px] text-muted-foreground text-left">
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Automated type detection for metrics and dimensions</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Zero host database caching for private files</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Read-only credentials forced at connector boundary</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]">
            <div className="space-y-4">
              <h3 className="text-[14px] font-bold text-foreground">Supported Connector Layouts</h3>
              <div className="space-y-3">
                {[
                  { title: "Excel Worksheets (.xlsx)", detail: "Converts tabular sheets into virtual database tables instantly.", icon: Layers },
                  { title: "Flat CSV Files (.csv)", detail: "Maps raw headers and types through in-browser compilation.", icon: FileCode },
                  { title: "Relational Channels (PostgreSQL / MySQL / SQLite)", detail: "Secures schema indexing via read-only transaction ports.", icon: Network }
                ].map((item, idx) => {
                  const ItemIcon = item.icon;
                  return (
                    <div key={idx} className="p-3 bg-background-secondary/50 border border-border/60 rounded-xl flex items-start gap-3 text-left">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <ItemIcon size={13} />
                      </div>
                      <div>
                        <h4 className="text-[13px] font-bold text-foreground">{item.title}</h4>
                        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{item.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={() => navigate("/app/connections")}
              className="mt-6 w-full flex items-center justify-center gap-2 text-[13px] py-5 bg-gradient-to-r from-primary to-accent text-primary-foreground font-extrabold hover:opacity-95"
            >
              Configure Data Connectors
              <ArrowRight size={13} />
            </Button>
          </Card>
        </div>
      </section>

      {/* ─── SECTION 3: LLM CONFIGURATION ──────────────────────────────────── */}
      <section className="space-y-6">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Key size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground font-mono uppercase">3. LLM Configuration</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Calibrate models context length, credentials storage, and reasoning models.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-background-secondary border border-border text-muted-foreground px-2 py-0.5 rounded">
            Orchestration Security
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]">
            <div className="space-y-4 text-left">
              <h3 className="text-[14px] font-bold text-foreground">API Vault & Encryption</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Your artificial intelligence provider keys are secured using local client-side storage variables. These variables are encapsulated locally within your browser context using AES-256 standard encryption and never transit to or get logged in our hosting networks.
              </p>
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-foreground font-bold block text-left">Security Guidelines</span>
                <ul className="space-y-1.5 font-mono text-[12px] text-muted-foreground text-left">
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Encrypted variables decrypted only during direct API queries</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Zero central logs retaining private client credentials</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Model parameters (temperature, max tokens) controlled by client</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]">
            <div className="space-y-4">
              <h3 className="text-[14px] font-bold text-foreground">Supported Reasoners</h3>
              <div className="space-y-3">
                {[
                  { name: "Anthropic Claude 3.5 Sonnet", detail: "Optimized for structured SQL generation and logical parsing.", icon: Cpu },
                  { name: "OpenAI GPT-4o / GPT-4", detail: "Rapid prompt synthesis and robust context window mapping.", icon: Layers },
                  { name: "Google Gemini 1.5 Pro / Flash", detail: "Excellent large-scale dataset schemas cross-referencing.", icon: Network }
                ].map((model, idx) => {
                  const ModelIcon = model.icon;
                  return (
                    <div key={idx} className="p-3 bg-background-secondary/50 border border-border/60 rounded-xl flex items-center justify-between font-mono text-xs text-left">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                          <ModelIcon size={13} />
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-foreground text-[13px]">{model.name}</p>
                          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{model.detail}</p>
                        </div>
                      </div>
                      <span className="text-[9px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded font-semibold uppercase shrink-0">
                        Enabled
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={() => navigate("/app/settings")}
              className="mt-6 w-full flex items-center justify-center gap-2 text-[13px] py-5 bg-gradient-to-r from-primary to-accent text-primary-foreground font-extrabold hover:opacity-95"
            >
              Configure AI Providers
              <ArrowRight size={13} />
            </Button>
          </Card>
        </div>
      </section>

      {/* ─── SECTION 4: NATURAL LANGUAGE QUERIES ─────────────────────────────── */}
      <section className="space-y-6">
        <div className="border-b border-border pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <MessageSquare size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground font-mono uppercase">4. Natural Language Queries</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">Parse dynamic plain-English questions into target relational outputs.</p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-background-secondary border border-border text-muted-foreground px-2 py-0.5 rounded">
            Interactive Compiler
          </span>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]">
            <div className="space-y-4 text-left">
              <h3 className="text-[14px] font-bold text-foreground">Secure Translation Sandbox</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                The SQL translation loop compiles plain-text queries through the schema mapping indexes. Compiled statements execute inside read-only isolated database transaction loops. Mutation statements (such as INSERT, DELETE, DROP, UPDATE) are caught and automatically terminated by transaction locks.
              </p>
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-foreground font-bold block text-left">Execution Boundaries</span>
                <ul className="space-y-1.5 font-mono text-[12px] text-muted-foreground text-left">
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Write protection locks prevent data modifications</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Query row capping and resource timeout limits enforced</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-primary font-bold">&gt;</span>
                    <span>Strict metadata-level indexing ensures data isolation</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card className="p-6 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_42px_-28px_hsl(var(--primary)/0.75)]">
            <div className="space-y-4">
              <h3 className="text-[14px] font-bold text-foreground">Analytics Workspace Modules</h3>
              <div className="space-y-3">
                {[
                  { title: "Query Terminal Console", detail: "Type direct questions, inspect compiled SQL, and run execution plans.", icon: Terminal },
                  { title: "Dynamic Visualizations", detail: "Render outputs into responsive custom grids, charts, and tables.", icon: LineChart },
                  { title: "Shareable Insights Catalog", detail: "Bookmark essential analytical queries and reports for teams.", icon: Bookmark }
                ].map((feat, idx) => {
                  const FeatIcon = feat.icon;
                  return (
                    <div key={idx} className="p-3 bg-background-secondary/50 border border-border/60 rounded-xl flex items-start gap-3 text-left">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
                        <FeatIcon size={13} />
                      </div>
                      <div>
                        <h4 className="text-[13px] font-bold text-foreground">{feat.title}</h4>
                        <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">{feat.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <Button
              onClick={() => navigate("/app/query")}
              className="mt-6 w-full flex items-center justify-center gap-2 text-[13px] py-5 bg-gradient-to-r from-primary to-accent text-primary-foreground font-extrabold hover:opacity-95"
            >
              Launch Query Workspace
              <ArrowRight size={13} />
            </Button>
          </Card>
        </div>
      </section>
    </div>
  );
}
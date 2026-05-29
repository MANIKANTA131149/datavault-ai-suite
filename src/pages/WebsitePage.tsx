import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  Globe,
  Gauge,
  History,
  Layers3,
  Lock,
  MessageSquare,
  Shield,
  Sparkles,
  Table2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PublicSiteLayout } from "@/components/PublicSiteLayout";
import { PLAN_DEFINITIONS, PLAN_TIERS, formatFileSizeLimit, formatPlanLimit } from "@/lib/plans";
import { PROVIDER_LABELS } from "@/stores/llm-store";

const PROVIDERS = Object.values(PROVIDER_LABELS);

const PRODUCT_STATS = [
  { label: "AI providers", value: "13+" },
  { label: "Workspace modules", value: "8" },
  { label: "Database engines", value: "14" },
  { label: "Themes", value: "Light + Dark" },
];

const TRUST_SIGNALS = [
  "Natural-language analytics",
  "Provider-agnostic model layer",
  "Dataset and database workflows",
  "Admin, plans, and audit visibility",
];

const SYSTEM_FLOW = [
  { label: "Source", value: "Files or database" },
  { label: "Reason", value: "Agent + model" },
  { label: "Validate", value: "Read-only controls" },
  { label: "Deliver", value: "Charts, exports, chat" },
];

const PLATFORM_AREAS = [
  {
    title: "Dashboard",
    icon: BarChart3,
    text: "Workspace health, usage, provider readiness, and recent activity.",
  },
  {
    title: "Datasets",
    icon: Table2,
    text: "Upload spreadsheets, inspect schema, add notes, tag records, pin favorites, and manage bulk actions.",
  },
  {
    title: "Connections",
    icon: Database,
    text: "Connect database sources, test access, and send connected data into the query workspace.",
  },
  {
    title: "Query",
    icon: MessageSquare,
    text: "Ask in plain language, review reasoning, inspect charts, export results, and create share flows.",
  },
  {
    title: "History",
    icon: History,
    text: "Replay queries, compare runs, inspect traces, favorite records, and export query history.",
  },
  {
    title: "Insights",
    icon: Sparkles,
    text: "Save useful answers, organize them with tags, pin important findings, and export reports.",
  },
  {
    title: "Settings",
    icon: Layers3,
    text: "Manage profile, theme, provider configuration, model keys, usage, and workspace preferences.",
  },
  {
    title: "Admin",
    icon: Shield,
    text: "Control users, roles, plans, invites, audit logs, exports, and workspace governance.",
  },
];

const EXPERIENCE_COLUMNS = [
  {
    title: "For teams using data",
    icon: Users,
    points: ["Plain-language questions", "Charts and saved answers", "CSV and PDF exports", "Shareable deployed chat"],
  },
  {
    title: "For operators managing data",
    icon: Database,
    points: ["Dataset inventory", "Connection testing", "Provider readiness", "Dependency-aware deletion"],
  },
  {
    title: "For enterprise review",
    icon: Building2,
    points: ["Admin controls", "Plan limits", "Audit visibility", "Governed sharing"],
  },
];

const WORKFLOW = [
  {
    step: "01",
    title: "Bring data in",
    text: "Upload CSV, XLS, or XLSX files, or connect a database source.",
  },
  {
    step: "02",
    title: "Select intelligence",
    text: "Choose the configured provider and model from the workspace settings.",
  },
  {
    step: "03",
    title: "Ask and inspect",
    text: "Query in natural language, then review generated output, reasoning, charts, and trace history.",
  },
  {
    step: "04",
    title: "Save or share",
    text: "Export results, save insights, replay history, or deploy a controlled chatbot experience.",
  },
];

const SECURITY_POINTS = [
  "JWT-based authentication and role-aware access",
  "Plan-aware limits for datasets, queries, insights, and admin access",
  "Audit log, invite flow, user management, and export support",
  "Snapshot-based deployed chat experiences for controlled sharing",
  "Provider key management and usage visibility in settings",
  "Read-only SQL validation for live database execution",
];

const ARCHITECTURE_MODES = [
  {
    title: "Local agent mode",
    icon: Bot,
    text: "Runs analytical operations on uploaded files in the browser using a multi-step reasoning loop.",
  },
  {
    title: "Database adapter mode",
    icon: Database,
    text: "Translates user intent into read-only database operations for live connected sources.",
  },
  {
    title: "Deployed chat mode",
    icon: Globe,
    text: "Publishes a standalone chat experience from a controlled snapshot of the workspace.",
  },
];

const DATABASE_ENGINES = [
  "PostgreSQL",
  "MySQL",
  "MariaDB",
  "SQL Server",
  "Oracle",
  "SQLite",
  "MongoDB",
  "Elasticsearch",
  "OpenSearch",
  "ClickHouse",
  "Snowflake",
  "BigQuery",
  "Databricks",
  "DuckDB",
];

const ANALYTIC_OPERATIONS = [
  "Filter",
  "Sort",
  "Group by",
  "Aggregate",
  "Date buckets",
  "Outlier detection",
  "Correlation",
  "Pivot",
  "Split frequency",
  "Pipelines",
];

const EXPORT_CHANNELS = [
  "CSV exports",
  "Markdown reports",
  "Raw JSON",
  "HTML tables",
  "Multi-page PDF summaries",
  "Saved insight dashboards",
];

const INTELLIGENCE_FEATURES = [
  {
    title: "Multi-step reasoning",
    icon: Bot,
    text: "The agent can inspect schema, classify intent, run intermediate checks, and produce a final answer with context.",
  },
  {
    title: "Chart recommendation",
    icon: BarChart3,
    text: "Column patterns, numeric ranges, distinct counts, and timestamps help drive bar, line, area, and pie chart output.",
  },
  {
    title: "Large-result handling",
    icon: Table2,
    text: "Virtualized tables keep large query results usable without overwhelming the interface.",
  },
  {
    title: "Fallback execution",
    icon: Gauge,
    text: "When model output is not reliable enough, structured local fallback logic keeps common analysis flows moving.",
  },
];

const WORKSPACE_CAPABILITIES = [
  "Natural language and SQL-oriented query flows",
  "Quick templates and schema-aware execution context",
  "Reasoning timeline for inspection and review",
  "Automatic visualization from result shape",
  "Query replay, comparison, favorites, and history export",
  "Dashboard-style saved insight collections",
  "Standalone deployed chat for shared analysis",
  "Profile, theme, provider, and plan settings",
];

const VISUALIZATION_FEATURES = [
  {
    title: "Automatic chart selection",
    icon: BarChart3,
    text: "Result shape and column patterns guide chart output across bar, line, area, and pie views.",
  },
  {
    title: "Virtualized result grids",
    icon: Table2,
    text: "Large result sets stay readable and responsive through windowed table rendering.",
  },
  {
    title: "Insight dashboards",
    icon: Sparkles,
    text: "Important answers can be saved, organized, pinned, tagged, and exported for reporting.",
  },
  {
    title: "Report-ready exports",
    icon: FileText,
    text: "Teams can move results into CSV, Markdown, JSON, HTML, PDF, and saved dashboard formats.",
  },
];

const DEPLOYMENT_FEATURES = [
  "Standalone deployed chat pages",
  "Snapshot-based workspace configuration",
  "Shared analysis without exposing the full app",
  "Charts, tables, and reasoning in the deployed experience",
  "Connection-aware execution pathway",
  "Governed handoff for stakeholders",
];

const GOVERNANCE_CAPABILITIES = [
  {
    title: "Admin console",
    icon: Shield,
    text: "Manage users, roles, plan access, invites, audit logs, and operational exports.",
  },
  {
    title: "Usage visibility",
    icon: Gauge,
    text: "Track query activity, plan limits, provider readiness, and workspace state.",
  },
  {
    title: "Credential handling",
    icon: Lock,
    text: "Sensitive connection and provider fields are masked in the interface and handled through protected workflows.",
  },
  {
    title: "Read-only execution",
    icon: Database,
    text: "Live database workflows are structured around validation and non-destructive execution.",
  },
];

const TECH_FOUNDATION = [
  "React and TypeScript frontend",
  "Tailwind and shadcn/ui interface system",
  "Zustand state architecture",
  "Express and Node.js backend",
  "MongoDB system storage",
  "Lazy-loaded database adapters",
];

const FAQS = [
  {
    question: "What does Querify include?",
    answer:
      "Querify includes an authenticated workspace, dataset tools, database connections, query workspace, history, insights, settings, pricing, deployed chat, and admin controls.",
  },
  {
    question: "Which data formats are supported?",
    answer:
      "The product supports CSV, XLSX, and XLS upload flows, plus database connection workflows from the connections page.",
  },
  {
    question: "Which database engines are covered?",
    answer:
      "Querify supports PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, SQLite, MongoDB, Elasticsearch, OpenSearch, ClickHouse, Snowflake, BigQuery, Databricks, and DuckDB workflows.",
  },
  {
    question: "Which AI providers are supported?",
    answer:
      "OpenAI, Anthropic, Gemini, AWS Bedrock, Azure OpenAI, Cohere, Mistral, Groq, Together, Ollama, Hugging Face, Alibaba DashScope, and Querify defaults.",
  },
  {
    question: "Is there an enterprise path?",
    answer:
      "Yes. The platform includes plan tiers, admin access, read-only validation, usage limits, audit visibility, invite management, and governed sharing flows.",
  },
  {
    question: "Can teams share results?",
    answer:
      "Yes. Teams can export results, save insights, replay history, and create deployed chatbot experiences with snapshot-based settings.",
  },
  {
    question: "Does it support light and dark mode?",
    answer: "Yes. The public website and the authenticated application both support light and dark themes.",
  },
];

function SectionTitle({ kicker, title, text, centered = false }: { kicker: string; title: string; text?: string; centered?: boolean }) {
  return (
    <div className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="site-kicker">{kicker}</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">{title}</h2>
      {text ? <p className="site-copy">{text}</p> : null}
    </div>
  );
}

function PlanTable() {
  const rows = [
    {
      label: "Monthly queries",
      values: PLAN_TIERS.map((tier) => formatPlanLimit(PLAN_DEFINITIONS[tier].monthlyQueries)),
    },
    {
      label: "Datasets",
      values: PLAN_TIERS.map((tier) => formatPlanLimit(PLAN_DEFINITIONS[tier].datasets)),
    },
    {
      label: "File size",
      values: PLAN_TIERS.map((tier) => formatFileSizeLimit(PLAN_DEFINITIONS[tier].fileSizeLimitBytes)),
    },
    {
      label: "Saved insights",
      values: PLAN_TIERS.map((tier) => formatPlanLimit(PLAN_DEFINITIONS[tier].insights)),
    },
    {
      label: "Admin page",
      values: PLAN_TIERS.map((tier) => (PLAN_DEFINITIONS[tier].adminPage ? "Yes" : "No")),
    },
  ];

  return (
    <Card className="overflow-hidden rounded-lg border-border/70 bg-card/80 shadow-[0_18px_42px_-34px_hsl(var(--foreground)/0.7)]">
      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="border-b border-border/70 bg-background-secondary/65">
            <tr>
              <th className="px-5 py-4 text-xs font-semibold uppercase text-muted-foreground">Plan</th>
              {PLAN_TIERS.map((tier) => (
                <th key={tier} className="px-5 py-4 text-xs font-semibold uppercase text-foreground">
                  {PLAN_DEFINITIONS[tier].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/60 last:border-b-0">
                <td className="px-5 py-4 font-medium text-foreground">{row.label}</td>
                {row.values.map((value, index) => (
                  <td key={`${row.label}-${index}`} className="px-5 py-4 text-muted-foreground">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProductWindow() {
  return (
    <div className="site-product-window overflow-hidden rounded-lg border border-border/70 bg-card shadow-[0_36px_100px_-56px_hsl(var(--foreground)/0.95)]">
      <div className="flex items-center justify-between border-b border-border/70 bg-background-secondary/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <div className="hidden rounded-md border border-border/70 bg-background px-3 py-1 text-[11px] text-muted-foreground sm:block">
          querify.app / workspace / query
        </div>
      </div>

      <div className="grid min-h-[520px] lg:grid-cols-[170px_1fr]">
        <aside className="hidden border-r border-border/70 bg-background-secondary/45 p-4 lg:block">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Querify" className="h-8 w-8 rounded-md object-contain ring-1 ring-border/70" />
            <div>
              <p className="text-xs font-semibold text-foreground">Querify</p>
              <p className="text-[11px] text-muted-foreground">Data workspace</p>
            </div>
          </div>
          <div className="mt-6 space-y-1.5">
            {["Dashboard", "Datasets", "Query", "History", "Insights", "Admin"].map((item, index) => (
              <div
                key={item}
                className={`rounded-md px-3 py-2 text-xs ${
                  index === 2 ? "site-active-nav bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {item}
              </div>
            ))}
          </div>
        </aside>

        <div className="p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Datasets", "24"],
              ["Queries", "1.8k"],
              ["Insights", "316"],
            ].map(([label, value]) => (
              <div key={label} className="site-metric-tile rounded-lg border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-border/70 bg-background/70 p-4 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.04)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Ask your data</p>
                <p className="text-xs text-muted-foreground">Natural language to governed insight</p>
              </div>
              <Badge variant="outline" className="w-fit border-border text-[11px]">
                Provider ready
              </Badge>
            </div>
            <div className="site-type-line mt-4 rounded-md border border-border/70 bg-card px-4 py-3 text-sm text-foreground">
              What changed in revenue last month across enterprise accounts?
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {["OpenAI", "Revenue.csv", "Trace on"].map((item) => (
                <div key={item} className="rounded-md border border-border/60 bg-background px-3 py-2 text-[11px] text-muted-foreground">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Revenue movement</p>
                <BarChart3 size={16} className="text-primary" />
              </div>
              <div className="mt-5 flex h-44 items-end gap-2">
                {[44, 68, 52, 86, 74, 92, 64, 78].map((height, index) => (
                  <div key={index} className="flex flex-1 items-end">
                    <div className="site-chart-bar w-full rounded-t-md bg-primary/75" style={{ height: `${height}%`, animationDelay: `${index * 110}ms` }} />
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2 text-[10px] uppercase text-muted-foreground">
                {["Q1", "Q2", "Q3", "Q4"].map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-sm font-semibold text-foreground">Reasoning trace</p>
              <div className="mt-4 space-y-3">
                {["Selected account table", "Grouped by segment", "Compared prior period", "Generated chart"].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase text-muted-foreground">Output</p>
              <p className="mt-2 text-sm leading-6 text-foreground">Chart, answer, trace, CSV export, PDF report, and saved insight.</p>
            </div>
            <div className="rounded-lg border border-border/70 bg-background/70 p-4">
              <p className="text-xs uppercase text-muted-foreground">Share</p>
              <p className="mt-2 text-sm leading-6 text-foreground">Deployable chat link with snapshot-based configuration.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemFlow3D() {
  return (
    <div className="site-3d-stage">
      <div className="site-3d-stack">
        <div className="site-3d-card site-3d-card-back">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-muted-foreground">Governance</span>
            <Shield size={16} className="text-primary" />
          </div>
          <div className="mt-5 space-y-2">
            {["Roles", "Plans", "Audit", "Read-only"].map((item) => (
              <div key={item} className="rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="site-3d-card site-3d-card-mid">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-muted-foreground">Agent Layer</span>
            <Cpu size={16} className="text-primary" />
          </div>
          <div className="mt-5 grid gap-2">
            {SYSTEM_FLOW.map((step) => (
              <div key={step.label} className="grid grid-cols-[82px_1fr] gap-3 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="font-medium text-foreground">{step.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="site-3d-card site-3d-card-front">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase text-muted-foreground">Workspace Output</span>
            <BarChart3 size={16} className="text-primary" />
          </div>
          <div className="mt-6 flex h-32 items-end gap-2">
            {[62, 48, 72, 58, 88, 76, 92].map((height, index) => (
              <div key={index} className="flex flex-1 items-end">
                <div className="w-full rounded-t-md bg-primary/70" style={{ height: `${height}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {["Chart", "Trace", "Export"].map((item) => (
              <div key={item} className="rounded-md border border-border/70 bg-background/60 px-3 py-2 text-center text-xs text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceLayers3D() {
  const layers = [
    {
      title: "Data layer",
      text: "Files, schemas, connections",
      icon: Database,
      className: "site-layer-card-one",
    },
    {
      title: "Reasoning layer",
      text: "Intent, operations, model response",
      icon: Cpu,
      className: "site-layer-card-two",
    },
    {
      title: "Experience layer",
      text: "Charts, exports, deployed chat",
      icon: Sparkles,
      className: "site-layer-card-three",
    },
  ];

  return (
    <div className="site-layer-stage">
      <div className="site-layer-stack">
        {layers.map(({ title, text, icon: Icon, className }) => (
          <div key={title} className={`site-layer-card ${className}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{text}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon size={18} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              {[68, 86, 54].map((width, index) => (
                <div key={index} className="h-2 rounded-full bg-primary/15">
                  <div className="site-layer-line h-full rounded-full bg-primary/70" style={{ width: `${width}%`, animationDelay: `${index * 140}ms` }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WebsitePage() {
  return (
    <PublicSiteLayout>
      <section className="relative overflow-hidden border-b border-border/70">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div className="site-shell py-14 sm:py-16 lg:py-20">
          <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <Shield size={14} className="text-primary" />
                Enterprise AI data platform
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Querify AI Data Workspace
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                Plain-language analytics for teams that need governed answers from files, databases, model providers, and shared workspaces.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/auth">
                    Open workspace <ArrowRight size={14} />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-border">
                  <a href="#contact">
                    Request demo <ArrowRight size={14} />
                  </a>
                </Button>
              </div>

              <div className="mt-9 grid gap-3 sm:grid-cols-2">
                {PRODUCT_STATS.map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-border/70 bg-card/70 p-4">
                    <p className="text-xs font-medium uppercase text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-xl font-semibold text-foreground">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <ProductWindow />
          </div>

          <div className="relative mt-12 grid gap-3 border-t border-border/70 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST_SIGNALS.map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="product" className="site-section">
        <div className="site-shell">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_0.6fr] lg:items-end lg:justify-between">
            <SectionTitle
              kicker="Platform"
              title="One product surface for analysis, governance, and sharing"
              text="The product covers data intake, model routing, querying, history, insights, settings, and admin control."
            />
            <div className="rounded-lg border border-border/70 bg-card/70 p-4 text-sm leading-6 text-muted-foreground">
              Built for a real buying conversation: product depth, operator controls, plan limits, legal pages, and a clear path to demo.
            </div>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {PLATFORM_AREAS.map(({ title, icon: Icon, text }) => (
              <Card key={title} className="site-panel">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon size={18} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <SectionTitle
              kicker="Experience"
              title="Built for the people who ask, operate, and approve data workflows"
              text="The same platform speaks clearly to end users, technical teams, and enterprise reviewers."
            />

            <div className="grid gap-4 lg:grid-cols-3">
              {EXPERIENCE_COLUMNS.map(({ title, icon: Icon, points }) => (
                <Card key={title} className="site-panel">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon size={18} />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                  </div>
                  <ul className="mt-5 space-y-3">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
                        <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-400" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-background-secondary/35">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
            <div>
              <SectionTitle
                kicker="Workspace layers"
                title="A layered experience from data source to stakeholder handoff"
                text="Each layer has a job: connect and understand data, reason through the question, then package the result into a format the team can use."
              />

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {["Source clarity", "Reasoned output", "Controlled sharing"].map((item) => (
                  <div key={item} className="rounded-lg border border-border/70 bg-card/70 p-4 text-sm font-medium text-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <WorkspaceLayers3D />
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <SectionTitle
                kicker="Data and models"
                title="Provider flexibility with a clear data path"
                text="Querify supports file upload, database connections, provider configuration, and model selection from one workspace."
              />
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {["CSV, XLSX, and XLS uploads", "Database connection flow", "Schema and table previews", "History, exports, and insights"].map((item) => (
                  <div key={item} className="flex items-start gap-3 rounded-lg border border-border/70 bg-card/70 p-4 text-sm text-foreground">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <Card className="site-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Supported providers</p>
                  <p className="mt-1 text-xs text-muted-foreground">Configured from settings and used across query workflows.</p>
                </div>
                <Bot size={18} className="text-primary" />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {PROVIDERS.map((label) => (
                  <Badge key={label} variant="outline" className="border-border text-[11px]">
                    {label}
                  </Badge>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <SectionTitle
              kicker="Intelligence layer"
              title="Agentic analysis with clear inspection points"
              text="Querify combines model reasoning, structured local operations, chart intelligence, and reviewable outputs so users can move from question to answer with confidence."
            />

            <div className="grid gap-4 md:grid-cols-2">
              {INTELLIGENCE_FEATURES.map(({ title, icon: Icon, text }) => (
                <Card key={title} className="site-panel">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </Card>
              ))}
            </div>
          </div>

          <Card className="site-panel mt-6">
            <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-foreground">Workspace capabilities</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The product is designed around repeatable analysis workflows, not one-off prompt boxes.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {WORKSPACE_CAPABILITIES.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionTitle
                kicker="System flow"
                title="A composed pipeline from source to governed output"
                text="The platform moves through source selection, model reasoning, validation, visualization, and sharing without exposing unnecessary complexity to the user."
              />

              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {SYSTEM_FLOW.map((step) => (
                  <div key={step.label} className="rounded-lg border border-border/70 bg-card/70 p-4">
                    <p className="text-xs font-medium uppercase text-muted-foreground">{step.label}</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{step.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <SystemFlow3D />
          </div>
        </div>
      </section>

      <section className="border-y border-border/70 bg-background-secondary/35">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <SectionTitle
              kicker="Architecture"
              title="Hybrid execution for files, databases, and deployed chat"
              text="Querify is not limited to one query path. It supports browser-side analysis for uploaded files, live database execution for connected systems, and public deployed chat experiences."
            />

            <div className="grid gap-4 lg:grid-cols-3">
              {ARCHITECTURE_MODES.map(({ title, icon: Icon, text }) => (
                <Card key={title} className="site-panel">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <Card className="site-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Database coverage</p>
                  <p className="mt-1 text-xs text-muted-foreground">Coverage across relational, warehouse, document, search, and local engines.</p>
                </div>
                <Database size={18} className="text-primary" />
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {DATABASE_ENGINES.map((engine) => (
                  <Badge key={engine} variant="outline" className="border-border text-[11px]">
                    {engine}
                  </Badge>
                ))}
              </div>
            </Card>

            <Card className="site-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Export and reporting</p>
                  <p className="mt-1 text-xs text-muted-foreground">Outputs built for analysis handoff.</p>
                </div>
                <FileText size={18} className="text-primary" />
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {EXPORT_CHANNELS.map((item) => (
                  <div key={item} className="rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="site-panel mt-4">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-foreground">Analytical operation layer</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The local agent can execute structured analytical operations over parsed datasets before producing the final answer.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ANALYTIC_OPERATIONS.map((operation) => (
                  <Badge key={operation} variant="outline" className="border-border text-[11px]">
                    {operation}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>

          <Card className="site-panel mt-4">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-foreground">Technical foundation</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  A modern full-stack foundation supports the product experience across authenticated workspace pages and public deployed chat.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {TECH_FOUNDATION.map((item) => (
                  <div key={item} className="rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <SectionTitle
              kicker="Visualization and reporting"
              title="Outputs designed for review, not just response text"
              text="Querify turns answers into charts, tables, exports, saved insights, and report-friendly assets that can move through a team."
            />

            <div className="grid gap-4 md:grid-cols-2">
              {VISUALIZATION_FEATURES.map(({ title, icon: Icon, text }) => (
                <Card key={title} className="site-panel">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </Card>
              ))}
            </div>
          </div>

          <Card className="site-panel mt-6">
            <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-foreground">Deployment and sharing</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  The deployed chat experience gives teams a controlled way to share analysis outside the full workspace.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {DEPLOYMENT_FEATURES.map((item) => (
                  <div key={item} className="flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="site-section">
        <div className="site-shell">
          <SectionTitle
            kicker="Workflow"
            title="A controlled path from source to answer"
            text="Every step has a clear place: source selection, model setup, query execution, result review, and sharing."
            centered
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {WORKFLOW.map(({ step, title, text }) => (
              <Card key={step} className="site-panel">
                <p className="text-xs font-semibold uppercase text-primary">{step}</p>
                <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section id="security" className="site-section">
        <div className="site-shell">
          <div className="grid gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
            <div>
              <SectionTitle
                kicker="Security and governance"
                title="Enterprise controls visible without getting in the way"
                text="Authentication, limits, admin actions, and shared experiences are framed as part of the operating model."
              />
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <Link to="/terms-and-conditions">Terms</Link>
                </Button>
                <Button asChild variant="outline" className="border-border">
                  <Link to="/privacy-policy">Privacy policy</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {GOVERNANCE_CAPABILITIES.map(({ title, icon: Icon, text }) => (
                <Card key={title} className="site-panel">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </Card>
              ))}
            </div>
          </div>

          <Card className="site-panel mt-8">
            <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
              <div>
                <p className="text-sm font-semibold text-foreground">Governance checklist</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Controls that matter for day-to-day operation, review, and sharing.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {SECURITY_POINTS.map((point) => (
                  <div key={point} className="flex items-start gap-2 rounded-md border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section id="pricing" className="border-y border-border/70 bg-background-secondary/35">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <SectionTitle
            kicker="Plans"
            title="Plan limits that are easy to compare"
            text="A simple pricing surface helps buyers understand query volume, datasets, file limits, saved insights, and admin access."
          />
          <div className="mt-8">
            <PlanTable />
          </div>
        </div>
      </section>

      <section id="faq" className="site-section">
        <div className="site-shell">
          <SectionTitle kicker="FAQ" title="Short answers for product review" centered />
          <div className="mx-auto mt-8 max-w-4xl">
            <Accordion type="single" collapsible className="rounded-lg border border-border/70 bg-card/80 px-4">
              {FAQS.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger className="text-left text-sm font-medium text-foreground">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-muted-foreground">{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      <section id="contact" className="pb-20">
        <div className="site-shell">
          <div className="rounded-lg border border-border/70 bg-card/80 p-6 shadow-[0_24px_70px_-48px_hsl(var(--foreground)/0.8)] sm:p-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="site-kicker">Contact</p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  Bring Querify into your enterprise data workflow.
                </h2>
                <p className="site-copy">
                  Review product depth, pricing, deployment, and governance with a clear demo path.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/auth">
                    Open workspace <ArrowRight size={14} />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="border-border">
                  <a href="mailto:support@querify.in">
                    Email support <ArrowRight size={14} />
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicSiteLayout>
  );
}

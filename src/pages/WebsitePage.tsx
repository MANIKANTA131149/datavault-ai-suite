import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Database,
  FileText,
  Globe,
  Gauge,
  History,
  Layers3,
  Lock,
  MessageSquare,
  Quote,
  Shield,
  Sparkles,
  Star,
  Table2,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicSiteLayout } from "@/components/PublicSiteLayout";
import { PLAN_DEFINITIONS, PLAN_TIERS, formatFileSizeLimit, formatPlanLimit } from "@/lib/plans";
import { PROVIDER_LABELS } from "@/stores/llm-store";
import {
  CountUp,
  FloatingOrbs,
  GlowCard,
  GradientText,
  Marquee,
  Reveal,
  ShinyText,
  SpotlightCard,
  SplitText,
  Stagger,
  StaggerItem,
  TiltCard,
} from "@/components/site-motion";

const PROVIDERS = Object.values(PROVIDER_LABELS);

const PRODUCT_STATS = [
  { label: "AI providers", to: 13, suffix: "+" },
  { label: "Workspace modules", to: 8, suffix: "" },
  { label: "Database engines", to: 14, suffix: "" },
  { label: "Themes", to: 2, suffix: "", display: "Light + Dark" },
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

const INTEGRATIONS_ROW_A = [...PROVIDERS.slice(0, 7), ...DATABASE_ENGINES.slice(0, 7)];
const INTEGRATIONS_ROW_B = [...DATABASE_ENGINES.slice(7), ...PROVIDERS.slice(7)];

const TESTIMONIALS = [
  {
    quote:
      "Querify replaced a backlog of ad-hoc SQL requests. Our ops team now asks questions in plain English and gets governed, chartable answers in seconds.",
    name: "Priya Nair",
    role: "Head of Data, Northwind Retail",
    initials: "PN",
  },
  {
    quote:
      "The reasoning trace is the killer feature. Stakeholders can see exactly how an answer was produced, which made our compliance team comfortable shipping it.",
    name: "Marcus Reed",
    role: "VP Analytics, Atlas Fintech",
    initials: "MR",
  },
  {
    quote:
      "We connected Snowflake and three CSV exports in an afternoon. The provider-agnostic model layer means we are never locked into one vendor.",
    name: "Sofia Alvarez",
    role: "Director of BI, Lumen Health",
    initials: "SA",
  },
  {
    quote:
      "Deployed chat let us hand a controlled analytics surface to non-technical teams without exposing the whole workspace. Adoption was instant.",
    name: "David Chen",
    role: "Platform Lead, Vertex Logistics",
    initials: "DC",
  },
  {
    quote:
      "Admin controls, plan limits, and audit visibility were already there. It felt enterprise-ready on day one, not a prototype we had to harden.",
    name: "Elena Petrova",
    role: "CTO, Beacon Insurance",
    initials: "EP",
  },
];

function SectionTitle({ kicker, title, text, centered = false }: { kicker: string; title: string; text?: string; centered?: boolean }) {
  return (
    <Reveal className={centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <p className="site-kicker inline-flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-primary" />
        {kicker}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">{title}</h2>
      {text ? <p className={centered ? "site-copy mx-auto" : "site-copy"}>{text}</p> : null}
    </Reveal>
  );
}

function PlanTable() {
  const rows = [
    {
      label: "Daily tokens",
      values: PLAN_TIERS.map((tier) => formatPlanLimit(PLAN_DEFINITIONS[tier].monthlyTokens)),
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
      <section className="relative overflow-hidden">
        <FloatingOrbs className="opacity-80" />
        <div className="site-shell relative py-20 sm:py-24 lg:py-32">
          <div className="mx-auto max-w-4xl text-center">
            <Reveal direction="up" distance={16}>
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
                <ShinyText>Enterprise AI data platform</ShinyText>
                <span className="mx-1 h-3 w-px bg-border" />
                <span className="text-foreground/80">v2 · Now live</span>
              </div>
            </Reveal>

            <h1 className="mx-auto mt-7 max-w-4xl text-balance text-[2.75rem] font-semibold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-[5rem]">
              <SplitText text="Talk to your data." />{" "}
              <GradientText className="site-gradient-text">
                <SplitText text="Ship answers." delay={0.2} />
              </GradientText>
            </h1>

            <Reveal delay={0.5} className="mx-auto mt-6 max-w-2xl">
              <p className="text-lg leading-8 text-muted-foreground sm:text-xl">
                Querify turns plain-language questions into governed, explainable analytics across files, databases, and every major model provider — with charts, traces, and shareable workspaces built in.
              </p>
            </Reveal>

            <Reveal delay={0.65}>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="site-cta gap-2 rounded-xl px-6 text-[15px]">
                  <Link to="/auth">
                    Open workspace <ArrowRight size={16} />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="rounded-xl border-border/70 bg-card/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card"
                >
                  <a href="#contact">
                    Request demo <ArrowRight size={14} />
                  </a>
                </Button>
              </div>
            </Reveal>
          </div>

          <Stagger className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4" gap={0.08} delay={0.85}>
            {PRODUCT_STATS.map((stat) => (
              <StaggerItem key={stat.label}>
                <TiltCard max={8} className="h-full">
                  <SpotlightCard className="site-panel h-full !p-4 text-center">
                    <p className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                      {stat.display ? stat.display : <CountUp to={stat.to} suffix={stat.suffix} />}
                    </p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                  </SpotlightCard>
                </TiltCard>
              </StaggerItem>
            ))}
          </Stagger>

          <Stagger className="relative mx-auto mt-14 grid max-w-4xl gap-3 border-t border-border/50 pt-7 sm:grid-cols-2 lg:grid-cols-4" gap={0.08}>
            {TRUST_SIGNALS.map((item) => (
              <StaggerItem key={item}>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
                  <span>{item}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal delay={0.6} className="mt-14 flex justify-center">
            <a href="#integrations" className="group flex flex-col items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground">
              Scroll to explore
              <ChevronDown size={16} className="animate-bounce text-primary/70" />
            </a>
          </Reveal>
        </div>
      </section>

      {/* ── Integrations / social-proof marquee ──────────────────────────── */}
      <section id="integrations" className="border-y border-border/50 bg-background-secondary/20 py-12 sm:py-14">
        <div className="site-shell">
          <Reveal className="text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Connects to <span className="text-foreground">13+ model providers</span> and <span className="text-foreground">14 database engines</span> out of the box
            </p>
          </Reveal>
        </div>
        <div className="mt-8 space-y-3">
          <Marquee speed={42}>
            {INTEGRATIONS_ROW_A.map((label) => (
              <span key={label} className="site-logo-pill">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/70" />
                {label}
              </span>
            ))}
          </Marquee>
          <Marquee speed={48} reverse>
            {INTEGRATIONS_ROW_B.map((label) => (
              <span key={`r-${label}`} className="site-logo-pill">
                <span className="h-1.5 w-1.5 rounded-full bg-accent/70" />
                {label}
              </span>
            ))}
          </Marquee>
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

          <Stagger className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4" gap={0.06}>
            {PLATFORM_AREAS.map(({ title, icon: Icon, text }) => (
              <StaggerItem key={title} className="h-full">
                <TiltCard max={7} className="h-full">
                  <GlowCard>
                    <SpotlightCard className="site-panel h-full">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/15 text-primary ring-1 ring-border/40 transition-transform duration-300 group-hover/spot:scale-110">
                        <Icon size={18} />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                    </SpotlightCard>
                  </GlowCard>
                </TiltCard>
              </StaggerItem>
            ))}
          </Stagger>
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

            <Stagger className="grid gap-4 lg:grid-cols-3" gap={0.08}>
              {EXPERIENCE_COLUMNS.map(({ title, icon: Icon, points }) => (
                <StaggerItem key={title} className="h-full">
                  <SpotlightCard className="site-panel h-full">
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
                  </SpotlightCard>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <section id="platform" className="border-y border-border/50 bg-background-secondary/25">
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
          <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <SectionTitle
              kicker="Intelligence layer"
              title="Agentic analysis with clear inspection points"
              text="Querify combines model reasoning, structured local operations, chart intelligence, and reviewable outputs so users can move from question to answer with confidence."
            />

            <Stagger className="grid gap-4 md:grid-cols-2" gap={0.08}>
              {INTELLIGENCE_FEATURES.map(({ title, icon: Icon, text }) => (
                <StaggerItem key={title} className="h-full">
                  <TiltCard max={7} className="h-full">
                    <SpotlightCard className="site-panel h-full">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon size={18} />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                    </SpotlightCard>
                  </TiltCard>
                </StaggerItem>
              ))}
            </Stagger>
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

            <Stagger className="grid gap-4 lg:grid-cols-3" gap={0.08}>
              {ARCHITECTURE_MODES.map(({ title, icon: Icon, text }) => (
                <StaggerItem key={title} className="h-full">
                  <TiltCard max={7} className="h-full">
                    <SpotlightCard className="site-panel h-full">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon size={18} />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                    </SpotlightCard>
                  </TiltCard>
                </StaggerItem>
              ))}
            </Stagger>
          </div>

          <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-[1fr_0.8fr]">
            <Reveal className="h-full">
              <SpotlightCard className="site-panel flex h-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Database coverage</p>
                    <p className="mt-1 text-xs text-muted-foreground">Coverage across relational, warehouse, document, search, and local engines.</p>
                  </div>
                  <Database size={18} className="text-primary" />
                </div>
                <div className="mt-5 flex flex-1 flex-col justify-center space-y-2.5">
                  <Marquee speed={30}>
                    {DATABASE_ENGINES.map((engine) => (
                      <Badge key={engine} variant="outline" className="border-border bg-background/60 text-[11px] whitespace-nowrap">
                        {engine}
                      </Badge>
                    ))}
                  </Marquee>
                  <Marquee speed={34} reverse>
                    {DATABASE_ENGINES.map((engine) => (
                      <Badge key={`r-${engine}`} variant="outline" className="border-border bg-background/60 text-[11px] whitespace-nowrap">
                        {engine}
                      </Badge>
                    ))}
                  </Marquee>
                </div>
              </SpotlightCard>
            </Reveal>

            <Card className="site-panel flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Export and reporting</p>
                  <p className="mt-1 text-xs text-muted-foreground">Outputs built for analysis handoff.</p>
                </div>
                <FileText size={18} className="text-primary" />
              </div>
              <div className="mt-5 grid flex-1 content-center gap-2 sm:grid-cols-2">
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

            <Stagger className="grid gap-4 md:grid-cols-2" gap={0.08}>
              {VISUALIZATION_FEATURES.map(({ title, icon: Icon, text }) => (
                <StaggerItem key={title} className="h-full">
                  <TiltCard max={7} className="h-full">
                    <SpotlightCard className="site-panel h-full">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon size={18} />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                    </SpotlightCard>
                  </TiltCard>
                </StaggerItem>
              ))}
            </Stagger>
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
          <Stagger className="mt-10 grid gap-4 lg:grid-cols-4" gap={0.1}>
            {WORKFLOW.map(({ step, title, text }) => (
              <StaggerItem key={step} className="h-full">
                <TiltCard max={6} className="h-full">
                  <SpotlightCard className="site-panel h-full">
                    <p className="text-3xl font-bold tracking-tight text-primary/25">{step}</p>
                    <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  </SpotlightCard>
                </TiltCard>
              </StaggerItem>
            ))}
          </Stagger>
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

            <Stagger className="grid gap-4 sm:grid-cols-2" gap={0.08}>
              {GOVERNANCE_CAPABILITIES.map(({ title, icon: Icon, text }) => (
                <StaggerItem key={title} className="h-full">
                  <SpotlightCard className="site-panel h-full">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <Icon size={18} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  </SpotlightCard>
                </StaggerItem>
              ))}
            </Stagger>
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

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="site-section overflow-hidden">
        <div className="site-shell">
          <SectionTitle
            kicker="Loved by data teams"
            title="Trusted across analytics, finance, health, and logistics"
            text="Teams adopt Querify because it pairs natural-language speed with the governance and explainability enterprises actually require."
            centered
          />
        </div>
        <div className="relative mt-12">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-background to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-background to-transparent" />
          <Marquee speed={55} pauseOnHover>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="site-panel mx-1.5 w-[340px] shrink-0 whitespace-normal sm:w-[400px]">
                <Quote size={22} className="text-primary/40" />
                <p className="mt-3 text-sm leading-7 text-foreground/90">{t.quote}</p>
                <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-accent/30 text-xs font-bold text-foreground ring-1 ring-border/60">
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={12} className="fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </Marquee>
        </div>
      </section>

      <section id="pricing" className="border-y border-border/50 bg-background-secondary/25">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <SectionTitle
            kicker="Plans"
            title="Plan limits that are easy to compare"
            text="A simple pricing surface helps buyers understand query volume, datasets, file limits, saved insights, and admin access."
          />
          <Reveal className="mt-8">
            <PlanTable />
          </Reveal>
        </div>
      </section>

      <section id="faq" className="site-section">
        <div className="site-shell">
          <SectionTitle kicker="FAQ" title="Short answers for product review" centered />
          <Reveal className="mx-auto mt-8 max-w-4xl">
            <Accordion type="single" collapsible className="rounded-lg border border-border/70 bg-card/80 px-4">
              {FAQS.map((item) => (
                <AccordionItem key={item.question} value={item.question}>
                  <AccordionTrigger className="text-left text-sm font-medium text-foreground">{item.question}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-muted-foreground">{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      <section id="contact" className="py-16 sm:py-24">
        <div className="site-shell">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-border/60 p-8 text-center sm:p-14">
              <FloatingOrbs className="opacity-60" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10"
                style={{ background: "radial-gradient(60% 80% at 50% 0%, hsl(var(--accent) / 0.12), transparent 70%)" }}
              />
              <div className="relative mx-auto max-w-2xl">
                <p className="site-kicker justify-center">Get started</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                  Bring <GradientText className="site-gradient-text">Querify</GradientText> into your data workflow.
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
                  Spin up a workspace in minutes, or talk to us about a guided enterprise demo covering depth, pricing, deployment, and governance.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button asChild size="lg" className="site-cta gap-2 rounded-xl px-6 text-[15px]">
                    <Link to="/auth">
                      Open workspace <ArrowRight size={16} />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="rounded-xl border-border/70 bg-card/60 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card"
                  >
                    <a href="mailto:support@querify.in">
                      Email support <ArrowRight size={14} />
                    </a>
                  </Button>
                </div>
                <p className="mt-6 text-xs text-muted-foreground">No credit card required · Free tier available</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </PublicSiteLayout>
  );
}

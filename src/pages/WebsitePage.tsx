import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
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
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicSiteLayout } from "@/components/PublicSiteLayout";
import { PLAN_DEFINITIONS, PLAN_TIERS, formatFileSizeLimit, formatPlanLimit } from "@/lib/plans";
import { PROVIDER_LABELS } from "@/stores/llm-store";
import { AreaChart, BarChart, DonutChart, Sparkline } from "@/components/site-charts";
import { CountUp, Marquee, Reveal, Stagger, StaggerItem } from "@/components/site-motion";

const PROVIDERS = Object.values(PROVIDER_LABELS);

/* ─── Illustrative sample data for the product showcase ──────────────────── */
const REVENUE_TREND = [42, 48, 45, 58, 64, 61, 72, 80, 78, 92, 96, 108];
const QUERY_VOLUME = [34, 52, 41, 68, 59, 74, 88];
const SOURCE_SPLIT = [
  { label: "Databases", value: 46, color: "hsl(var(--primary))" },
  { label: "Spreadsheets", value: 32, color: "hsl(var(--accent))" },
  { label: "Warehouses", value: 22, color: "hsl(var(--brand-3))" },
];
const KPIS = [
  { label: "Questions answered", value: 12840, suffix: "", trend: [20, 28, 26, 34, 40, 44, 52], delta: "+18%" },
  { label: "Avg. response time", value: 2.4, suffix: "s", decimals: 1, trend: [40, 36, 33, 30, 26, 24, 24], delta: "−31%", down: true },
  { label: "Active datasets", value: 326, suffix: "", trend: [10, 14, 18, 22, 30, 38, 46], delta: "+12%" },
];

const PRODUCT_STATS = [
  { label: "Model providers", to: 13, suffix: "+" },
  { label: "Database engines", to: 14, suffix: "" },
  { label: "Workspace modules", to: 8, suffix: "" },
  { label: "Export formats", to: 6, suffix: "" },
];

const HERO_POINTS = [
  "No SQL required",
  "Explainable answers",
  "Works with your existing databases",
];

const PLATFORM_AREAS = [
  { title: "Dashboard", icon: BarChart3, text: "See workspace activity, usage against your plan, provider readiness, and recent queries at a glance." },
  { title: "Datasets", icon: Table2, text: "Upload CSV and Excel files, inspect the detected schema, tag and annotate, and manage everything in one place." },
  { title: "Connections", icon: Database, text: "Connect to 14 database engines, test access safely, and query live data without copying it anywhere." },
  { title: "Query", icon: MessageSquare, text: "Ask questions in plain English. Get back charts, tables, and a written summary — with the reasoning shown." },
  { title: "History", icon: History, text: "Replay past questions, compare runs, inspect the full reasoning trace, and export your query history." },
  { title: "Insights", icon: Sparkles, text: "Save the answers that matter, organise them with tags, and turn them into shareable reports." },
  { title: "Settings", icon: Layers3, text: "Manage your profile, theme, model providers and keys, and review usage — all from one screen." },
  { title: "Admin", icon: Shield, text: "Control users and roles, manage plans and invites, and review audit logs for the whole workspace." },
];

const HOW_IT_WORKS = [
  { step: "01", title: "Bring your data in", text: "Upload a spreadsheet or connect a database. Querify reads the schema automatically — no setup scripts." },
  { step: "02", title: "Ask in plain English", text: "Type a question like you'd ask a colleague. The AI agent figures out the right query and runs it." },
  { step: "03", title: "Review the answer", text: "Get a chart, a table, and a short explanation — plus a step-by-step trace of exactly how it got there." },
  { step: "04", title: "Save or share", text: "Export to CSV or PDF, pin it to a dashboard, or publish a controlled chat link for your team." },
];

const WHO_ITS_FOR = [
  { title: "Business teams", icon: Users, text: "Ask data questions and get answers without waiting on an analyst.", points: ["Plain-language questions", "Auto-generated charts", "CSV & PDF exports", "Shareable chat links"] },
  { title: "Data & ops teams", icon: Database, text: "Connect sources once and let the rest of the team self-serve, safely.", points: ["14 database engines", "Read-only execution", "Connection testing", "Provider flexibility"] },
  { title: "Leadership & IT", icon: Building2, text: "Roll it out with the controls and visibility an enterprise expects.", points: ["Roles & admin console", "Plan limits", "Audit logs", "Governed sharing"] },
];

const INTELLIGENCE_FEATURES = [
  { title: "Multi-step reasoning", icon: Bot, text: "The agent inspects your schema, plans the query, runs intermediate checks, and returns an answer with context — not a guess." },
  { title: "Automatic charts", icon: BarChart3, text: "Querify reads the shape of your result and picks the right visual: bar, line, area, or pie. You can switch anytime." },
  { title: "Large results, handled", icon: Table2, text: "Virtualised tables keep even very large result sets fast and scrollable instead of freezing the page." },
  { title: "Reliable fallbacks", icon: Gauge, text: "When a model response isn't confident enough, structured local logic keeps common analyses moving." },
];

const GOVERNANCE = [
  { title: "Roles & admin", icon: Shield, text: "Manage users, roles, plan access, invites, and audit logs from a dedicated admin console." },
  { title: "Usage visibility", icon: Gauge, text: "Track query activity and plan limits, and see which model providers are configured and ready." },
  { title: "Credential safety", icon: Lock, text: "Connection and provider secrets are masked in the UI and never exposed to shared chat pages." },
  { title: "Read-only by default", icon: Database, text: "Live database queries are validated as read-only, so analysis can never modify your source data." },
];

const DATABASE_ENGINES = [
  "PostgreSQL", "MySQL", "MariaDB", "SQL Server", "Oracle", "SQLite", "MongoDB",
  "Elasticsearch", "OpenSearch", "ClickHouse", "Snowflake", "BigQuery", "Databricks", "DuckDB",
];

const FAQS = [
  { question: "What does Querify actually do?", answer: "Querify lets anyone ask questions about their data in plain English and get back charts, tables, and written summaries. It connects to your spreadsheets and databases, generates the query for you, and shows its reasoning so you can trust the answer." },
  { question: "Do I need to know SQL?", answer: "No. You ask questions in everyday language and the AI agent writes and runs the query. If you do know SQL, you can review or refine what it generated." },
  { question: "Which data sources are supported?", answer: "You can upload CSV, XLSX, and XLS files, or connect live to PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, SQLite, MongoDB, Elasticsearch, OpenSearch, ClickHouse, Snowflake, BigQuery, Databricks, and DuckDB." },
  { question: "Which AI providers can I use?", answer: "OpenAI, Anthropic, Gemini, AWS Bedrock, Azure OpenAI, Cohere, Mistral, Groq, Together, Ollama, Hugging Face, and Alibaba DashScope — plus a built-in default so you can start immediately." },
  { question: "Is my data safe?", answer: "Live database queries are validated as read-only, credentials are masked in the interface, and access is controlled by roles and plan limits. Admins get an audit log of activity across the workspace." },
  { question: "Can I share results with my team?", answer: "Yes. Export to CSV, Markdown, JSON, HTML, or PDF, save insights to a dashboard, or publish a controlled chat page that lets others ask questions without exposing the full workspace." },
  { question: "Does it support light and dark mode?", answer: "Yes. Both the marketing site and the application support light and dark themes." },
];

const TESTIMONIALS = [
  { quote: "Querify replaced a backlog of ad-hoc SQL requests. Our ops team now asks questions in plain English and gets governed, chartable answers in seconds.", name: "Priya Nair", role: "Head of Data, Northwind Retail", initials: "PN" },
  { quote: "The reasoning trace is the killer feature. Stakeholders can see exactly how an answer was produced, which made our compliance team comfortable shipping it.", name: "Marcus Reed", role: "VP Analytics, Atlas Fintech", initials: "MR" },
  { quote: "We connected Snowflake and three CSV exports in an afternoon. The provider-agnostic model layer means we're never locked into one vendor.", name: "Sofia Alvarez", role: "Director of BI, Lumen Health", initials: "SA" },
  { quote: "Deployed chat let us hand a controlled analytics surface to non-technical teams without exposing the whole workspace. Adoption was instant.", name: "David Chen", role: "Platform Lead, Vertex Logistics", initials: "DC" },
  { quote: "Admin controls, plan limits, and audit visibility were already there. It felt enterprise-ready on day one, not a prototype we had to harden.", name: "Elena Petrova", role: "CTO, Beacon Insurance", initials: "EP" },
];

const INTEGRATIONS = [...PROVIDERS.slice(0, 7), ...DATABASE_ENGINES.slice(0, 7)];

function SectionTitle({ kicker, title, text, centered = false }: { kicker: string; title: string; text?: string; centered?: boolean }) {
  return (
    <Reveal className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="site-kicker inline-flex items-center gap-1.5">
        <span className="h-1 w-1 rounded-full bg-primary" />
        {kicker}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">{title}</h2>
      {text ? <p className={centered ? "site-copy mx-auto" : "site-copy"}>{text}</p> : null}
    </Reveal>
  );
}

/* ─── The product dashboard mockup — the hero "show, don't tell" visual ──── */
function ProductMockup() {
  return (
    <div className="site-mockup">
      {/* browser chrome */}
      <div className="site-mockup-bar">
        <span className="site-mockup-dot" style={{ background: "#ff5f57" }} />
        <span className="site-mockup-dot" style={{ background: "#febc2e" }} />
        <span className="site-mockup-dot" style={{ background: "#28c840" }} />
        <span className="ml-3 hidden truncate rounded-md bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground sm:inline">
          app.querify.in / dashboard
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[140px_1fr] sm:p-4">
        {/* mini sidebar (hidden on narrow) */}
        <aside className="hidden flex-col gap-1 rounded-lg border border-border/60 bg-background/40 p-2 sm:flex">
          {[
            { icon: BarChart3, label: "Dashboard", active: true },
            { icon: Table2, label: "Datasets" },
            { icon: Database, label: "Connections" },
            { icon: MessageSquare, label: "Query" },
            { icon: History, label: "History" },
            { icon: Sparkles, label: "Insights" },
          ].map(({ icon: Icon, label, active }) => (
            <div key={label} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${active ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground"}`}>
              <Icon size={13} className={active ? "text-primary" : ""} />
              {label}
            </div>
          ))}
        </aside>

        {/* main panel */}
        <div className="space-y-3">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-2">
            {KPIS.map((k) => (
              <div key={k.label} className="rounded-lg border border-border/60 bg-background/40 p-2.5">
                <p className="truncate text-[9px] uppercase tracking-wide text-muted-foreground sm:text-[10px]">{k.label}</p>
                <p className="mt-0.5 text-sm font-bold text-foreground sm:text-base">
                  <CountUp to={k.value} suffix={k.suffix} decimals={k.decimals || 0} />
                </p>
                <div className="mt-1 flex items-center justify-between">
                  <span className={`text-[9px] font-semibold ${k.down ? "text-success" : "text-success"}`}>{k.delta}</span>
                  <Sparkline data={k.trend} className="text-primary" />
                </div>
              </div>
            ))}
          </div>

          {/* big area chart */}
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-foreground">Monthly question volume</p>
              <span className="inline-flex items-center gap-1 text-[10px] text-success"><TrendingUp size={11} /> trending up</span>
            </div>
            <div className="h-28 sm:h-32">
              <AreaChart data={REVENUE_TREND} id="hero-area" />
            </div>
          </div>

          {/* bottom row: bar + donut */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <p className="mb-2 text-[11px] font-semibold text-foreground">Queries by weekday</p>
              <div className="h-24">
                <BarChart data={QUERY_VOLUME} labels={["M", "T", "W", "T", "F", "S", "S"]} />
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <p className="mb-2 text-[11px] font-semibold text-foreground">Data sources</p>
              <DonutChart segments={SOURCE_SPLIT} size={88} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanTable() {
  const rows = [
    { label: "Daily tokens", values: PLAN_TIERS.map((t) => formatPlanLimit(PLAN_DEFINITIONS[t].monthlyTokens)) },
    { label: "Datasets", values: PLAN_TIERS.map((t) => formatPlanLimit(PLAN_DEFINITIONS[t].datasets)) },
    { label: "File size", values: PLAN_TIERS.map((t) => formatFileSizeLimit(PLAN_DEFINITIONS[t].fileSizeLimitBytes)) },
    { label: "Saved insights", values: PLAN_TIERS.map((t) => formatPlanLimit(PLAN_DEFINITIONS[t].insights)) },
    { label: "Admin console", values: PLAN_TIERS.map((t) => (PLAN_DEFINITIONS[t].adminPage ? "Yes" : "—")) },
  ];

  return (
    <Card className="overflow-hidden rounded-xl border-border/70 bg-card/80">
      <div className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-left text-sm">
          <thead className="border-b border-border/70 bg-background-secondary/65">
            <tr>
              <th className="px-5 py-4 text-xs font-semibold uppercase text-muted-foreground">Plan</th>
              {PLAN_TIERS.map((tier) => (
                <th key={tier} className="px-5 py-4 text-xs font-semibold uppercase text-foreground">{PLAN_DEFINITIONS[tier].name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/60 last:border-b-0">
                <td className="px-5 py-4 font-medium text-foreground">{row.label}</td>
                {row.values.map((value, index) => (
                  <td key={`${row.label}-${index}`} className="px-5 py-4 text-muted-foreground">{value}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function WebsitePage() {
  return (
    <PublicSiteLayout>
      {/* ── Hero: copy + product mockup ──────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="site-shell relative py-16 sm:py-20 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
            {/* copy */}
            <div className="max-w-xl">
              <Reveal>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  AI data platform · Now live
                </div>
              </Reveal>

              <Reveal delay={0.05}>
                <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
                  Ask your data anything. <span className="text-primary">Get a real answer.</span>
                </h1>
              </Reveal>

              <Reveal delay={0.12}>
                <p className="mt-5 text-lg leading-8 text-muted-foreground">
                  Querify connects to your spreadsheets and databases and turns plain-English
                  questions into charts, tables, and clear summaries — with the reasoning shown,
                  so every answer is one you can trust and share.
                </p>
              </Reveal>

              <Reveal delay={0.18}>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg" className="site-cta gap-2 rounded-xl px-6 text-[15px]">
                    <Link to="/auth">Open workspace <ArrowRight size={16} /></Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="rounded-xl border-border/70 bg-card/60 hover:border-primary/40 hover:bg-card">
                    <a href="#how-it-works">See how it works</a>
                  </Button>
                </div>
              </Reveal>

              <Reveal delay={0.24}>
                <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2">
                  {HERO_POINTS.map((p) => (
                    <li key={p} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CheckCircle2 size={15} className="text-success" /> {p}
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>

            {/* mockup */}
            <Reveal delay={0.15} direction="up" distance={20}>
              <ProductMockup />
            </Reveal>
          </div>

          {/* stat strip */}
          <Stagger className="mt-14 grid grid-cols-2 gap-3 border-t border-border/50 pt-10 sm:grid-cols-4" gap={0.06}>
            {PRODUCT_STATS.map((stat) => (
              <StaggerItem key={stat.label}>
                <div className="text-center">
                  <p className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    <CountUp to={stat.to} suffix={stat.suffix} />
                  </p>
                  <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Integrations marquee ─────────────────────────────────────────── */}
      <section id="integrations" className="border-y border-border/50 bg-background-secondary/20 py-10 sm:py-12">
        <div className="site-shell">
          <Reveal className="text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Connects to <span className="text-foreground">13+ model providers</span> and <span className="text-foreground">14 database engines</span> out of the box
            </p>
          </Reveal>
        </div>
        <div className="mt-7">
          <Marquee speed={44}>
            {INTEGRATIONS.map((label) => (
              <span key={label} className="site-logo-pill"><span className="h-1.5 w-1.5 rounded-full bg-primary/70" />{label}</span>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section id="how-it-works" className="site-section">
        <div className="site-shell">
          <SectionTitle kicker="How it works" title="From question to answer in four steps" text="No query language to learn, no pipeline to build. Connect your data and start asking." centered />
          <Stagger className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4" gap={0.08}>
            {HOW_IT_WORKS.map(({ step, title, text }) => (
              <StaggerItem key={step} className="h-full">
                <div className="site-panel h-full">
                  <span className="text-2xl font-bold tracking-tight text-primary/30">{step}</span>
                  <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Analytics showcase: charts + copy ────────────────────────────── */}
      <section className="border-y border-border/50 bg-background-secondary/25">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionTitle
                kicker="Built for analysis"
                title="Every answer comes with a picture"
                text="Querify reads the shape of your results and renders the right visualization automatically — then lets you save, switch, or export it. Here's the kind of view your team gets."
              />
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  { icon: TrendingUp, label: "Trends & forecasts" },
                  { icon: BarChart3, label: "Comparisons & breakdowns" },
                  { icon: Table2, label: "Detailed result tables" },
                  { icon: Zap, label: "Instant export to PDF & CSV" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/70 px-4 py-3 text-sm font-medium text-foreground">
                    <Icon size={16} className="text-primary" /> {label}
                  </div>
                ))}
              </div>
            </div>

            <Reveal direction="up" distance={20}>
              <div className="grid gap-4">
                <Card className="site-panel">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Revenue by month</p>
                    <Badge variant="outline" className="border-success/30 bg-success/10 text-[10px] text-success">+24% YoY</Badge>
                  </div>
                  <div className="h-40"><AreaChart data={REVENUE_TREND} id="show-area" /></div>
                </Card>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card className="site-panel">
                    <p className="mb-3 text-sm font-semibold text-foreground">Weekly queries</p>
                    <div className="h-28"><BarChart data={QUERY_VOLUME} labels={["M", "T", "W", "T", "F", "S", "S"]} /></div>
                  </Card>
                  <Card className="site-panel">
                    <p className="mb-3 text-sm font-semibold text-foreground">Source mix</p>
                    <DonutChart segments={SOURCE_SPLIT} size={96} />
                  </Card>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Platform modules ─────────────────────────────────────────────── */}
      <section id="product" className="site-section">
        <div className="site-shell">
          <SectionTitle kicker="The platform" title="Everything you need in one workspace" text="Eight connected modules take you from raw data all the way to a shareable, governed answer." centered />
          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.05}>
            {PLATFORM_AREAS.map(({ title, icon: Icon, text }) => (
              <StaggerItem key={title} className="h-full">
                <div className="site-panel group h-full">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-border/40 transition-transform duration-300 group-hover:scale-105">
                    <Icon size={18} />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Who it's for ─────────────────────────────────────────────────── */}
      <section id="platform" className="border-y border-border/50 bg-background-secondary/25">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <SectionTitle kicker="Who it's for" title="One platform, three audiences" text="Querify speaks to the people who ask the questions, the people who manage the data, and the people who sign off on the rollout." centered />
          <Stagger className="mt-10 grid gap-4 lg:grid-cols-3" gap={0.08}>
            {WHO_ITS_FOR.map(({ title, icon: Icon, text, points }) => (
              <StaggerItem key={title} className="h-full">
                <div className="site-panel h-full">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={18} /></div>
                    <h3 className="text-base font-semibold text-foreground">{title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
                  <ul className="mt-4 space-y-2.5 border-t border-border/50 pt-4">
                    {points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" /><span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Intelligence layer ───────────────────────────────────────────── */}
      <section className="site-section">
        <div className="site-shell">
          <SectionTitle kicker="The intelligence" title="An agent that shows its work" text="Querify doesn't just return text. It reasons step by step, runs real queries, and gives you a trace you can inspect." centered />
          <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.06}>
            {INTELLIGENCE_FEATURES.map(({ title, icon: Icon, text }) => (
              <StaggerItem key={title} className="h-full">
                <div className="site-panel h-full">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={18} /></div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Security & governance ────────────────────────────────────────── */}
      <section id="security" className="border-y border-border/50 bg-background-secondary/25">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <SectionTitle kicker="Security & governance" title="Enterprise controls, built in" text="The guardrails an enterprise needs are part of the product, not an afterthought." />
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="rounded-xl"><Link to="/terms-and-conditions">Terms</Link></Button>
                <Button asChild variant="outline" className="rounded-xl border-border"><Link to="/privacy-policy">Privacy policy</Link></Button>
              </div>
            </div>
            <Stagger className="grid gap-4 sm:grid-cols-2" gap={0.06}>
              {GOVERNANCE.map(({ title, icon: Icon, text }) => (
                <StaggerItem key={title} className="h-full">
                  <div className="site-panel h-full">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={18} /></div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section className="site-section overflow-hidden">
        <div className="site-shell">
          <SectionTitle kicker="Customer stories" title="Trusted across data teams" text="Teams adopt Querify because it pairs natural-language speed with the governance enterprises actually require." centered />
        </div>
        <div className="relative mt-12">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent sm:w-24" />
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent sm:w-24" />
          <Marquee speed={55} pauseOnHover>
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="site-panel mx-1.5 w-[320px] shrink-0 whitespace-normal sm:w-[380px]">
                <Quote size={20} className="text-primary/40" />
                <p className="mt-3 text-sm leading-7 text-foreground/90">{t.quote}</p>
                <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-foreground ring-1 ring-border/60">{t.initials}</div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                  <div className="ml-auto flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
                  </div>
                </div>
              </div>
            ))}
          </Marquee>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────────── */}
      <section id="pricing" className="border-y border-border/50 bg-background-secondary/25">
        <div className="site-shell py-16 sm:py-20 lg:py-24">
          <SectionTitle kicker="Pricing" title="Simple plans, clear limits" text="Compare query volume, datasets, file size, saved insights, and admin access at a glance." centered />
          <Reveal className="mt-8"><PlanTable /></Reveal>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section id="faq" className="site-section">
        <div className="site-shell">
          <SectionTitle kicker="FAQ" title="Questions, answered" centered />
          <Reveal className="mx-auto mt-8 max-w-3xl">
            <Accordion type="single" collapsible className="rounded-xl border border-border/70 bg-card/80 px-4">
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

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section id="contact" className="py-16 sm:py-24">
        <div className="site-shell">
          <Reveal>
            <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card to-background-secondary/40 p-8 text-center sm:p-14">
              <div className="relative mx-auto max-w-2xl">
                <Globe size={28} className="mx-auto text-primary" />
                <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Start asking your data questions today
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
                  Spin up a workspace in minutes on the free tier, or talk to us about a guided
                  enterprise demo covering depth, pricing, deployment, and governance.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Button asChild size="lg" className="site-cta gap-2 rounded-xl px-6 text-[15px]">
                    <Link to="/auth">Open workspace <ArrowRight size={16} /></Link>
                  </Button>
                  <Button asChild variant="outline" size="lg" className="rounded-xl border-border/70 bg-card/60 hover:border-primary/40 hover:bg-card">
                    <a href="mailto:support@querify.in">Email support <ArrowRight size={14} /></a>
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

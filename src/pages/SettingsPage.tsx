import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuthStore } from "@/stores/auth-store";
import { useLLMStore, PROVIDER_LABELS, PROVIDER_MODELS, getModelDisplayName } from "@/stores/llm-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore, type Theme, type CodeFont } from "@/stores/settings-store";
import { usePlanStore } from "@/stores/plan-store";
import { PLAN_DEFINITIONS, PLAN_TIERS, formatFileSizeLimit, formatPlanLimit, type PlanTier } from "@/lib/plans";
import { testProviderConnection, type Provider } from "@/lib/llm-client";
import { api } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import {
  Activity,
  Check,
  Copy,
  CreditCard,
  Cpu,
  Eye,
  EyeOff,
  Key,
  Palette,
  Save,
  Search,
  Settings as SettingsIcon,
  Shield,
  Star,
  Trash2,
  TrendingUp,
  User,
  X,
  Zap,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ProviderLogo } from "@/components/ProviderLogo";
import { PageHeader } from "@/components/PageHeader";
import { ApiKeysManager } from "@/components/ApiKeysManager";
import { cn } from "@/lib/utils";

/* ─── Animation constants ─────────────────────────────────────────────────── */

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } },
};

export default function SettingsPage() {
  const { user, updateUserName } = useAuthStore();
  const { providerConfigs, setProviderConfig, activeProvider, setActiveProvider } = useLLMStore();
  const { entries } = useHistoryStore();
  const { theme, compactMode, codeFont, setTheme, setCompactMode, setCodeFont, saveSettings, loading } = useSettingsStore();
  const { context: planContext, fetchPlan } = usePlanStore();

  const [editName, setEditName] = useState(user?.name || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [settingsSearch, setSettingsSearch] = useState("");
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error">>({});
  const [dailyTokens, setDailyTokens] = useState<{
    tokensUsed: number;
    limit: number;
    queriesUsed: number;
    queryLimit: number;
    percentage: number;
  } | null>(null);

  useEffect(() => {
    if (user?.planTier !== "free") return;
    api.get("/llm/token-usage")
      .then((data) => { if (data) setDailyTokens(data as any); })
      .catch((e) => console.error("Failed to fetch daily tokens:", e));
  }, [user?.planTier]);

  const [keyInputs, setKeyInputs] = useState<Record<string, string>>(
    Object.fromEntries((Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [p, providerConfigs[p]?.apiKey || ""]))
  );
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>(
    Object.fromEntries((Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [p, providerConfigs[p]?.secretAccessKey || ""]))
  );
  const [regionInputs, setRegionInputs] = useState<Record<string, string>>(
    Object.fromEntries((Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [p, providerConfigs[p]?.region || "us-east-1"]))
  );

  useEffect(() => {
    setKeyInputs(Object.fromEntries((Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [p, providerConfigs[p]?.apiKey || ""])));
    setSecretInputs(Object.fromEntries((Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [p, providerConfigs[p]?.secretAccessKey || ""])));
    setRegionInputs(Object.fromEntries((Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [p, providerConfigs[p]?.region || "us-east-1"])));
  }, [providerConfigs]);

  useEffect(() => { fetchPlan(); }, [fetchPlan]);

  const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
  const successRate = entries.length
    ? Math.round((entries.filter((e) => e.status === "success").length / entries.length) * 100)
    : 0;
  const currentPlan = planContext?.plan || PLAN_DEFINITIONS[user?.planTier || "free"];
  const usage = planContext?.usage || { monthlyQueries: entries.length, monthlyTokens: totalTokens, datasets: 0, insights: 0, members: 0 };

  const usagePercent = (value: number, max: number | null) => {
    if (max === null || max === undefined) return 0;
    return Math.min((value / max) * 100, 100);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) { toast.error("Name cannot be empty"); return; }
    setSavingProfile(true);
    try {
      await api.put("/settings/profile", { name: editName.trim() });
      updateUserName(editName.trim());
      toast.success("Profile updated successfully");
    } catch { toast.error("Failed to update profile"); }
    finally { setSavingProfile(false); }
  };

  const handleSaveAppearance = async () => {
    setSavingAppearance(true);
    try {
      await saveSettings(providerConfigs);
      toast.success("Appearance preferences saved");
    } catch { toast.error("Failed to save appearance"); }
    finally { setSavingAppearance(false); }
  };

  const handleSaveApiKeys = async () => {
    setSavingKeys(true);
    try {
      (Object.keys(PROVIDER_LABELS) as Provider[]).forEach((provider) => {
        const key = keyInputs[provider];
        if (key !== undefined) {
          setProviderConfig(provider, {
            apiKey: key,
            ...(provider === "bedrock" ? { secretAccessKey: secretInputs[provider] || "", region: regionInputs[provider] || "us-east-1" } : {}),
          });
        }
      });
      const updatedConfigs = Object.fromEntries(
        (Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [
          p,
          { ...providerConfigs[p], apiKey: keyInputs[p] || "", ...(p === "bedrock" ? { secretAccessKey: secretInputs[p] || "", region: regionInputs[p] || "us-east-1" } : {}) },
        ])
      );
      await saveSettings(updatedConfigs);
      toast.success("API keys saved to your account");
    } catch { toast.error("Failed to save API keys"); }
    finally { setSavingKeys(false); }
  };

  const isProviderConfigured = (provider: Provider) => {
    if (provider === "bedrock") return !!keyInputs[provider] && !!secretInputs[provider];
    return !!keyInputs[provider];
  };

  const keyLooksValid = (provider: Provider) => {
    const key = keyInputs[provider] || "";
    if (provider === "ollama") return true;
    if (provider === "bedrock") return key.length >= 16 && !!secretInputs[provider];
    if (provider === "openai" || provider === "alibaba") return key.startsWith("sk-");
    if (provider === "gemini") return key.startsWith("AIza");
    if (provider === "anthropic") return key.startsWith("sk-ant-");
    return key.length > 8;
  };

  const configuredCount = (Object.keys(PROVIDER_LABELS) as Provider[]).filter(isProviderConfigured).length;

  const visibleProviders = (Object.keys(PROVIDER_LABELS) as Provider[]).filter((provider) => {
    const q = settingsSearch.trim().toLowerCase();
    if (!q) return true;
    return [provider, PROVIDER_LABELS[provider], providerConfigs[provider]?.model || ""].some((v) => v.toLowerCase().includes(q));
  });

  const handleCheckProvider = async (provider: Provider) => {
    if (provider === "bedrock") {
      if (!keyInputs[provider]) { toast.error("AWS Bedrock access key is missing"); return; }
      if (!secretInputs[provider]) { toast.error("AWS Bedrock secret access key is missing"); return; }
    }
    if (provider !== "ollama" && !keyInputs[provider]) { toast.error(`${PROVIDER_LABELS[provider]} API key is missing`); return; }
    setTestingProvider(provider);
    try {
      await testProviderConnection(
        provider,
        providerConfigs[provider]?.model || PROVIDER_MODELS[provider][0],
        keyInputs[provider],
        provider === "bedrock" ? { secretAccessKey: secretInputs[provider], region: regionInputs[provider] || "us-east-1" } : {}
      );
      setTestResults((prev) => ({ ...prev, [provider]: "success" }));
      toast.success(`${PROVIDER_LABELS[provider]} connection verified`);
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [provider]: "error" }));
      toast.error(err.message || `${PROVIDER_LABELS[provider]} connection failed`);
    } finally { setTestingProvider(null); }
  };

  const copyApiKey = async (provider: Provider) => {
    if (!keyInputs[provider]) return;
    await navigator.clipboard.writeText(keyInputs[provider]);
    toast.success(`${PROVIDER_LABELS[provider]} key copied`);
  };

  const FONT_SAMPLES: Record<CodeFont, string> = {
    jetbrains: "font-[JetBrains_Mono,monospace]",
    fira: "font-[Fira_Code,monospace]",
    cascadia: "font-[Cascadia_Code,monospace]",
  };

  return (
    <div className="page-shell-narrow page-enter space-y-6">
      <PageHeader
        title="Settings"
        titleIcon={SettingsIcon}
        info="Tune your profile, LLM providers, theme, and workspace usage with controls that stay organized across compact and wide screens."
        stats={[
          { label: "Providers ready", value: configuredCount, tone: "success" },
          { label: "Queries run", value: entries.length, tone: "info" },
          { label: "Plan", value: currentPlan.name, tone: "accent" },
        ]}
      />

      {/* Search bar */}
      <div className="toolbar-panel">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={settingsSearch}
            onChange={(e) => setSettingsSearch(e.target.value)}
            placeholder="Search settings or providers…"
            className="border-border bg-background-secondary pl-9"
          />
          {settingsSearch && (
            <button
              type="button"
              onClick={() => setSettingsSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="inline-flex h-auto w-full flex-wrap justify-start gap-1 bg-background-secondary p-1">
          <TabsTrigger value="profile" className="flex items-center gap-2"><User size={13} />Profile</TabsTrigger>
          <TabsTrigger value="apikeys" className="flex items-center gap-2"><Cpu size={13} />Providers</TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2"><Palette size={13} />Appearance</TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2"><CreditCard size={13} />Usage</TabsTrigger>
          <TabsTrigger value="apiaccess" className="flex items-center gap-2"><Key size={13} />API Access</TabsTrigger>
        </TabsList>

        {/* ─── Profile ─────────────────────────────────────────────────────────── */}
        <TabsContent value="profile" className="mt-6">
          <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">

            {/* Avatar + info card */}
            <motion.div variants={fadeUp}>
              <Card className="rounded-[18px] border-border/55 bg-card/80 p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-accent/30 text-2xl font-bold text-primary ring-2 ring-primary/20 ring-offset-2 ring-offset-background">
                      {user?.avatarInitials}
                    </div>
                    <Badge className="border-0 bg-success/10 text-success text-[10px]">Active</Badge>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xl font-bold text-foreground">{user?.name}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge className="border border-primary/20 bg-primary/10 text-primary text-xs">{currentPlan.name} Plan</Badge>
                      <Badge variant="outline" className="border-border text-xs text-muted-foreground">
                        {configuredCount} provider{configuredCount === 1 ? "" : "s"} configured
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator className="my-5 bg-border/60" />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Full Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="border-border bg-card"
                      placeholder="Your display name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Email Address</Label>
                    <div className="relative">
                      <Input
                        defaultValue={user?.email}
                        readOnly
                        className="cursor-not-allowed border-border bg-card pr-9 text-muted-foreground"
                      />
                      <Shield size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Email address cannot be changed.</p>
                  </div>
                </div>

                <Button className="mt-5 gap-2" onClick={handleSaveProfile} disabled={savingProfile}>
                  <Save size={14} />
                  {savingProfile ? "Saving…" : "Save Changes"}
                </Button>
              </Card>
            </motion.div>

            {/* Account stats */}
            <motion.div variants={fadeUp}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Queries run", value: entries.length.toLocaleString(), icon: Activity },
                  { label: "Success rate", value: `${successRate}%`, icon: TrendingUp },
                  { label: "Tokens used", value: totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens.toString(), icon: Zap },
                  { label: "Providers ready", value: `${configuredCount} / ${Object.keys(PROVIDER_LABELS).length}`, icon: Cpu },
                ].map((stat) => {
                  const Icon = stat.icon;
                  return (
                    <Card key={stat.label} className="rounded-[16px] border-border/55 bg-card/80 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{stat.label}</p>
                        <Icon size={13} className="mt-0.5 shrink-0 text-muted-foreground/40" />
                      </div>
                      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{stat.value}</p>
                    </Card>
                  );
                })}
              </div>
            </motion.div>

          </motion.div>
        </TabsContent>

        {/* ─── API Keys / Providers ─────────────────────────────────────────────── */}
        <TabsContent value="apikeys" className="mt-6">
          <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">

            <motion.div variants={fadeUp} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{configuredCount} of {Object.keys(PROVIDER_LABELS).length} providers configured</p>
                <p className="text-xs text-muted-foreground">Keys are stored securely in your account and used for running queries.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={activeProvider} onValueChange={(v) => setActiveProvider(v as Provider)}>
                  <SelectTrigger className="w-full border-border bg-card sm:w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover">
                    {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                      <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleSaveApiKeys} disabled={savingKeys} size="sm" className="gap-2">
                  <Save size={13} />
                  {savingKeys ? "Saving…" : "Save All"}
                </Button>
              </div>
            </motion.div>

            {visibleProviders.map((provider) => {
              const hasKey = isProviderConfigured(provider);
              const visible = showKeys[provider];
              const secretVisible = showKeys[`${provider}-secret`];
              const isActive = provider === activeProvider;
              const testResult = testResults[provider];
              const isTesting = testingProvider === provider;

              return (
                <motion.div key={provider} variants={fadeUp}>
                  <Card className={cn(
                    "rounded-[18px] border-border/55 bg-card/80 p-4 transition-all sm:p-5",
                    isActive && "border-primary/35 shadow-[0_4px_18px_-8px_hsl(var(--primary)/0.2)]",
                  )}>
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ProviderLogo provider={provider} />
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground">{PROVIDER_LABELS[provider]}</p>
                            {isActive && (
                              <Badge className="border-0 bg-primary/10 px-1.5 py-0 text-[10px] font-bold text-primary">
                                <Star size={8} className="mr-0.5 inline-block" /> Default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {hasKey ? `Key ends ****${keyInputs[provider].slice(-4)}` : "Not configured"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {testResult && (
                          <Badge className={cn(
                            "border-0 text-xs",
                            testResult === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                          )}>
                            {testResult === "success" ? <><Check size={10} className="mr-1" />Verified</> : <><X size={10} className="mr-1" />Failed</>}
                          </Badge>
                        )}
                        <Badge className={cn("border-0 text-xs", hasKey ? (keyLooksValid(provider) ? "bg-success/10 text-success" : "bg-warning/10 text-warning") : "bg-muted/50 text-muted-foreground")}>
                          {hasKey ? (keyLooksValid(provider) ? "Valid format" : "Check format") : "Not set"}
                        </Badge>
                      </div>
                    </div>

                    {/* Key inputs */}
                    <div className="mt-4 space-y-2">
                      {provider === "bedrock" ? (
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <div className="relative">
                            <Input
                              type={visible ? "text" : "password"}
                              placeholder="Access key ID"
                              value={keyInputs[provider]}
                              onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                              className="border-border bg-background pr-9 font-mono text-xs"
                            />
                            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKeys((prev) => ({ ...prev, [provider]: !visible }))}>
                              {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          <div className="relative">
                            <Input
                              type={secretVisible ? "text" : "password"}
                              placeholder="Secret access key"
                              value={secretInputs[provider]}
                              onChange={(e) => setSecretInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                              className="border-border bg-background pr-9 font-mono text-xs"
                            />
                            <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKeys((prev) => ({ ...prev, [`${provider}-secret`]: !secretVisible }))}>
                              {secretVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
                          <Input
                            placeholder="Region (e.g. us-east-1)"
                            value={regionInputs[provider] || "us-east-1"}
                            onChange={(e) => setRegionInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                            className="border-border bg-background font-mono text-xs"
                          />
                        </div>
                      ) : (
                        <div className="relative">
                          <Input
                            type={visible ? "text" : "password"}
                            placeholder={`Enter ${PROVIDER_LABELS[provider]} API key`}
                            value={keyInputs[provider]}
                            onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                            className="border-border bg-background pr-9 font-mono text-xs"
                          />
                          <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowKeys((prev) => ({ ...prev, [provider]: !visible }))}>
                            {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                        </div>
                      )}

                      {/* Model selector */}
                      {provider === "bedrock" ? (
                        <Input
                          value={providerConfigs[provider]?.model || PROVIDER_MODELS[provider][0]}
                          onChange={(e) => setProviderConfig(provider, { model: e.target.value })}
                          placeholder="Enter Bedrock model ID"
                          className="border-border bg-background font-mono text-xs"
                        />
                      ) : (
                        <Select
                          value={providerConfigs[provider]?.model || PROVIDER_MODELS[provider][0]}
                          onValueChange={(v) => setProviderConfig(provider, { model: v })}
                        >
                          <SelectTrigger className="border-border bg-background text-xs [&>span]:truncate">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent className="max-h-72 w-[min(28rem,calc(100vw-2rem))] border-border bg-popover">
                            {PROVIDER_MODELS[provider].map((m) => (
                              <SelectItem key={m} value={m} className="items-start py-2 pl-7 pr-3 text-sm">
                                <span className="min-w-0 whitespace-normal break-words leading-snug">{getModelDisplayName(m)}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className="gap-1.5 border-border text-xs"
                        onClick={() => { setActiveProvider(provider); toast.success(`${PROVIDER_LABELS[provider]} set as default`); }}
                      >
                        <Key size={12} /> Set Default
                      </Button>
                      {keyInputs[provider] && (
                        <Button size="sm" variant="outline" className="gap-1.5 border-border text-xs" onClick={() => copyApiKey(provider)}>
                          <Copy size={12} /> Copy Key
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-border text-xs"
                        disabled={isTesting}
                        onClick={() => handleCheckProvider(provider)}
                      >
                        <Check size={12} className={isTesting ? "animate-pulse" : ""} />
                        {isTesting ? "Testing…" : "Test Connection"}
                      </Button>
                      {keyInputs[provider] && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
                            setSecretInputs((prev) => ({ ...prev, [provider]: "" }));
                            setTestResults((prev) => { const next = { ...prev }; delete next[provider]; return next; });
                          }}
                        >
                          <Trash2 size={12} /> Clear
                        </Button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}

            <motion.div variants={fadeUp}>
              <Button onClick={handleSaveApiKeys} disabled={savingKeys} className="w-full gap-2">
                <Save size={14} />
                {savingKeys ? "Saving to account…" : "Save All API Keys"}
              </Button>
            </motion.div>

          </motion.div>
        </TabsContent>

        {/* ─── Appearance ──────────────────────────────────────────────────────── */}
        <TabsContent value="appearance" className="mt-6">
          <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">

            <motion.div variants={fadeUp}>
              <Card className="rounded-[18px] border-border/55 bg-card/80 p-6 space-y-6">

                {/* Theme picker */}
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Color Theme</p>
                    <p className="text-xs text-muted-foreground">Choose your preferred color scheme for the interface.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {(["dark", "light", "system"] as Theme[]).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setTheme(option)}
                        className={cn(
                          "rounded-[14px] border p-3 text-left capitalize transition-all",
                          theme === option
                            ? "border-primary/40 bg-primary/8 text-primary shadow-[0_2px_12px_-4px_hsl(var(--primary)/0.2)]"
                            : "border-border/60 bg-card/60 text-muted-foreground hover:border-border hover:text-foreground",
                        )}
                      >
                        {option === "dark" && (
                          <div className="mb-2 h-10 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 p-1.5">
                            <div className="h-2 w-10 rounded bg-zinc-700" />
                            <div className="mt-1.5 h-3 rounded bg-primary/80" />
                          </div>
                        )}
                        {option === "light" && (
                          <div className="mb-2 h-10 overflow-hidden rounded-lg border border-zinc-200 bg-white p-1.5">
                            <div className="h-2 w-10 rounded bg-zinc-300" />
                            <div className="mt-1.5 h-3 rounded bg-primary/80" />
                          </div>
                        )}
                        {option === "system" && (
                          <div className="mb-2 grid h-10 grid-cols-2 overflow-hidden rounded-lg border border-border">
                            <div className="bg-white p-1.5"><div className="h-2 w-6 rounded bg-zinc-300" /></div>
                            <div className="bg-zinc-950 p-1.5"><div className="h-2 w-6 rounded bg-zinc-700" /></div>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium capitalize">{option}</span>
                          {theme === option && <Check size={12} className="text-primary" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator className="bg-border/60" />

                {/* Compact mode */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Compact Mode</p>
                    <p className="text-xs text-muted-foreground">Reduce spacing between elements for a denser layout.</p>
                  </div>
                  <Switch checked={compactMode} onCheckedChange={setCompactMode} />
                </div>

                <Separator className="bg-border/60" />

                {/* Code font */}
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Code Font</p>
                      <p className="text-xs text-muted-foreground">Font used in SQL blocks, query results, and code views.</p>
                    </div>
                    <Select value={codeFont} onValueChange={(v) => setCodeFont(v as CodeFont)}>
                      <SelectTrigger className="w-full border-border bg-card sm:w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        <SelectItem value="jetbrains">JetBrains Mono</SelectItem>
                        <SelectItem value="fira">Fira Code</SelectItem>
                        <SelectItem value="cascadia">Cascadia Code</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Font preview */}
                  <div className={cn("rounded-[12px] border border-border/60 bg-background/60 px-4 py-3 text-xs text-foreground", FONT_SAMPLES[codeFont] ?? "font-mono")}>
                    <span className="text-muted-foreground">SELECT </span>
                    <span className="text-primary">name</span>
                    <span className="text-muted-foreground">, </span>
                    <span className="text-primary">revenue</span>
                    <span className="text-muted-foreground"> FROM </span>
                    <span className="text-foreground">sales</span>
                    <span className="text-muted-foreground"> WHERE </span>
                    <span className="text-primary">year</span>
                    <span className="text-muted-foreground"> = </span>
                    <span className="text-success">2024</span>
                  </div>
                </div>

              </Card>
            </motion.div>

            <motion.div variants={fadeUp}>
              <Button onClick={handleSaveAppearance} disabled={savingAppearance} className="gap-2">
                <Save size={14} />
                {savingAppearance ? "Saving…" : "Save Appearance"}
              </Button>
            </motion.div>

          </motion.div>
        </TabsContent>

        {/* ─── Usage / Billing ─────────────────────────────────────────────────── */}
        <TabsContent value="billing" className="mt-6">
          <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">

            {/* KPI strip */}
            <motion.div variants={fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Queries run", value: entries.length.toLocaleString(), icon: Activity },
                { label: "Success rate", value: `${successRate}%`, icon: TrendingUp },
                { label: "Total tokens", value: totalTokens >= 1_000_000 ? `${(totalTokens / 1_000_000).toFixed(1)}M` : totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens.toString(), icon: Zap },
                { label: "Active plan", value: currentPlan.name, icon: CreditCard },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <Card key={kpi.label} className="rounded-[16px] border-border/55 bg-card/80 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{kpi.label}</p>
                      <Icon size={13} className="mt-0.5 shrink-0 text-muted-foreground/40" />
                    </div>
                    <p className="mt-2 text-xl font-bold tracking-tight text-foreground">{kpi.value}</p>
                  </Card>
                );
              })}
            </motion.div>

            {/* Usage bars */}
            <motion.div variants={fadeUp}>
              <Card className="rounded-[18px] border-border/55 bg-card/80 p-6">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Current Period Usage</p>
                    <p className="text-xs text-muted-foreground">Resets monthly. Managed by your account administrator.</p>
                  </div>
                  <Badge className="border-0 bg-primary/10 text-primary">{currentPlan.name}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {[
                    {
                      label: currentPlan.tier === "free" ? "Daily Bedrock Queries" : "Queries",
                      value: currentPlan.tier === "free" && dailyTokens ? dailyTokens.queriesUsed : usage.monthlyQueries,
                      max: currentPlan.tier === "free" && dailyTokens ? dailyTokens.queryLimit : currentPlan.monthlyQueries,
                    },
                    {
                      label: currentPlan.tier === "free" ? "Daily Bedrock Tokens" : "Tokens",
                      value: currentPlan.tier === "free" && dailyTokens ? dailyTokens.tokensUsed : usage.monthlyTokens,
                      max: currentPlan.tier === "free" && dailyTokens ? dailyTokens.limit : currentPlan.monthlyTokens,
                    },
                    { label: "Datasets", value: usage.datasets, max: currentPlan.datasets },
                    { label: "Saved insights", value: usage.insights, max: currentPlan.insights },
                    { label: "Team members", value: usage.members, max: currentPlan.members },
                    { label: "Success rate", value: successRate, max: 100 },
                  ].map(({ label, value, max }) => {
                    const pct = usagePercent(value, max);
                    const isNear = pct >= 80 && pct < 100;
                    const isOver = pct >= 100;
                    return (
                      <div key={label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono text-foreground">
                            {value.toLocaleString()} / {formatPlanLimit(max)}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full border border-border/50 bg-background-secondary">
                          <motion.div
                            className={cn("h-full rounded-full", isOver ? "bg-destructive" : isNear ? "bg-amber-500" : "bg-primary")}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(2, pct)}%` }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>

            {/* Plan comparison grid */}
            <motion.div variants={fadeUp}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Available Plans</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {PLAN_TIERS.map((tier: PlanTier) => {
                  const plan = PLAN_DEFINITIONS[tier];
                  const active = plan.tier === currentPlan.tier;
                  return (
                    <Card key={plan.tier} className={cn("rounded-[18px] border-border/55 bg-card/80 p-5 transition-all", active && "border-primary/35 shadow-[0_4px_18px_-8px_hsl(var(--primary)/0.2)]")}>
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-foreground">{plan.name}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {plan.adminPage ? "Includes admin panel access" : "Personal workspace plan"}
                          </p>
                        </div>
                        {active ? (
                          <Badge className="border-0 bg-primary/10 text-primary text-xs">Current</Badge>
                        ) : (
                          <Badge variant="outline" className="border-border text-xs text-muted-foreground">Available</Badge>
                        )}
                      </div>
                      <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                        {[
                          { label: "Queries", val: formatPlanLimit(plan.monthlyQueries) },
                          { label: "Tokens", val: formatPlanLimit(plan.monthlyTokens) },
                          { label: "Datasets", val: formatPlanLimit(plan.datasets) },
                          { label: "File size", val: formatFileSizeLimit(plan.fileSizeLimitBytes) },
                        ].map((item) => (
                          <div key={item.label} className="rounded-[10px] border border-border/60 bg-background/60 px-2.5 py-1.5">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
                            <p className="font-mono font-medium text-foreground">{item.val}</p>
                          </div>
                        ))}
                      </div>
                      <ul className="mb-4 space-y-1.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-center gap-2 text-xs text-foreground">
                            <Check size={11} className="shrink-0 text-success" /> {feature}
                          </li>
                        ))}
                      </ul>
                      <Button
                        variant={active ? "default" : "outline"}
                        className="w-full border-border text-xs"
                        disabled={active}
                        onClick={() => toast.info("Plan changes are managed by an administrator")}
                      >
                        {active ? "Active plan" : "Contact admin"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </motion.div>

          </motion.div>
        </TabsContent>

        {/* ─── API Access (public REST API keys) ───────────────────────────────── */}
        <TabsContent value="apiaccess" className="mt-6">
          <motion.div variants={stagger} initial="hidden" animate="visible">
            <motion.div variants={fadeUp}>
              <ApiKeysManager />
            </motion.div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

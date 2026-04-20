import { useState } from "react";
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
import { useLLMStore, PROVIDER_LABELS, PROVIDER_MODELS } from "@/stores/llm-store";
import { useHistoryStore } from "@/stores/history-store";
import { useSettingsStore, type Theme, type CodeFont } from "@/stores/settings-store";
import type { Provider } from "@/lib/llm-client";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { Trash2, Check, Shield, Palette, User, CreditCard, Cpu, Save, Eye, EyeOff, Key, Copy, Plus } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function SettingsPage() {
  const { user, updateUserName } = useAuthStore();
  const { providerConfigs, setProviderConfig, activeProvider, setActiveProvider } = useLLMStore();
  const { entries } = useHistoryStore();
  const { theme, compactMode, codeFont, setTheme, setCompactMode, setCodeFont, saveSettings, loading } = useSettingsStore();

  const [editName, setEditName] = useState(user?.name || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>(
    Object.fromEntries(
      (Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [p, providerConfigs[p]?.apiKey || ""])
    )
  );


  const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);
  const successRate = entries.length
    ? Math.round((entries.filter((e) => e.status === "success").length / entries.length) * 100)
    : 0;

  const handleSaveProfile = async () => {
    if (!editName.trim()) { toast.error("Name cannot be empty"); return; }
    setSavingProfile(true);
    try {
      await api.put("/settings/profile", { name: editName.trim() });
      updateUserName(editName.trim());
      toast.success("Profile updated successfully");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAppearance = async () => {
    setSavingAppearance(true);
    try {
      await saveSettings(providerConfigs);
      toast.success("Appearance preferences saved");
    } catch {
      toast.error("Failed to save appearance");
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleSaveApiKeys = async () => {
    setSavingKeys(true);
    try {
      // Commit all key inputs to LLM store first
      (Object.keys(PROVIDER_LABELS) as Provider[]).forEach((provider) => {
        const key = keyInputs[provider];
        if (key !== undefined) setProviderConfig(provider, { apiKey: key });
      });
      // Then persist to MongoDB
      const updatedConfigs = Object.fromEntries(
        (Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => [
          p,
          { ...providerConfigs[p], apiKey: keyInputs[p] || "" },
        ])
      );
      await saveSettings(updatedConfigs);
      toast.success("API keys saved to your account");
    } catch {
      toast.error("Failed to save API keys");
    } finally {
      setSavingKeys(false);
    }
  };

  const configuredCount = (Object.keys(PROVIDER_LABELS) as Provider[]).filter(
    (p) => keyInputs[p]?.length > 0
  ).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account, appearance and API configuration</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="bg-background-secondary">
          <TabsTrigger value="profile" className="flex items-center gap-2"><User size={13} />Profile</TabsTrigger>
          <TabsTrigger value="apikeys" className="flex items-center gap-2"><Cpu size={13} />Providers</TabsTrigger>

          <TabsTrigger value="appearance" className="flex items-center gap-2"><Palette size={13} />Appearance</TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2"><CreditCard size={13} />Usage</TabsTrigger>
        </TabsList>

        {/* ─── Profile ─────────────────────────────────────────────────────────── */}
        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="p-6 bg-background-secondary border-border">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 text-primary flex items-center justify-center text-xl font-bold ring-2 ring-primary/20">
                {user?.avatarInitials}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <Badge className="mt-1 bg-success/10 text-success border-0 text-xs">Active</Badge>
              </div>
            </div>
            <Separator className="bg-border mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1.5 bg-card border-border"
                  placeholder="Your display name"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email Address</Label>
                <Input
                  defaultValue={user?.email}
                  readOnly
                  className="mt-1.5 bg-card border-border text-muted-foreground cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground mt-1">Email cannot be changed</p>
              </div>
            </div>
            <Button className="mt-4" onClick={handleSaveProfile} disabled={savingProfile}>
              <Save size={14} className="mr-2" />
              {savingProfile ? "Saving..." : "Save Changes"}
            </Button>
          </Card>
        </TabsContent>

        {/* ─── API Keys (Providers) ────────────────────────────────────────────────── */}
        <TabsContent value="apikeys" className="mt-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-foreground">{configuredCount} of {Object.keys(PROVIDER_LABELS).length} providers configured</p>
              <p className="text-xs text-muted-foreground">Provider keys are used for running queries via DataVault UI</p>
            </div>
            <Button onClick={handleSaveApiKeys} disabled={savingKeys} size="sm">
              <Save size={13} className="mr-2" />
              {savingKeys ? "Saving..." : "Save All Keys"}
            </Button>
          </div>

          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => {
            const hasKey = !!keyInputs[provider];
            const visible = showKeys[provider];
            return (
              <Card key={provider} className="p-4 bg-background-secondary border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
                      style={{
                        backgroundColor: `hsl(${provider.length * 37 % 360}, 70%, 50%, 0.12)`,
                        color: `hsl(${provider.length * 37 % 360}, 70%, 55%)`,
                      }}
                    >
                      {PROVIDER_LABELS[provider][0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{PROVIDER_LABELS[provider]}</p>
                      <p className="text-xs text-muted-foreground">
                        {hasKey ? `****${keyInputs[provider].slice(-4)}` : "Not configured"}
                      </p>
                    </div>
                  </div>
                  <Badge className={`border-0 text-xs ${hasKey ? "bg-success/10 text-success" : "bg-muted/50 text-muted-foreground"}`}>
                    {hasKey ? "Connected" : "Not set"}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={visible ? "text" : "password"}
                      placeholder={`Enter ${PROVIDER_LABELS[provider]} API key`}
                      value={keyInputs[provider]}
                      onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                      className="bg-card border-border text-xs font-mono pr-9"
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowKeys((prev) => ({ ...prev, [provider]: !visible }))}
                    >
                      {visible ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {keyInputs[provider] && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setKeyInputs((prev) => ({ ...prev, [provider]: "" }))}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}

          <Button onClick={handleSaveApiKeys} disabled={savingKeys} className="w-full">
            <Save size={14} className="mr-2" />
            {savingKeys ? "Saving to account..." : "Save All API Keys to Account"}
          </Button>
        </TabsContent>



        {/* ─── Providers ───────────────────────────────────────────────────────── */}
        <TabsContent value="providers" className="mt-6 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Default Provider</Label>
            <Select value={activeProvider} onValueChange={(v) => { setActiveProvider(v as Provider); }}>
              <SelectTrigger className="mt-1.5 bg-background-secondary border-border w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                  <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Separator className="bg-border" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => (
              <Card key={provider} className="p-4 bg-background-secondary border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground">{PROVIDER_LABELS[provider]}</span>
                  <Switch
                    checked={providerConfigs[provider]?.enabled !== false}
                    onCheckedChange={(v) => setProviderConfig(provider, { enabled: v })}
                  />
                </div>
                <Select
                  value={providerConfigs[provider]?.model || PROVIDER_MODELS[provider][0]}
                  onValueChange={(v) => setProviderConfig(provider, { model: v })}
                >
                  <SelectTrigger className="bg-card border-border text-xs">
                    <SelectValue placeholder="Default model" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {PROVIDER_MODELS[provider].map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ─── Appearance ──────────────────────────────────────────────────────── */}
        <TabsContent value="appearance" className="mt-6 space-y-4">
          <Card className="p-6 bg-background-secondary border-border space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">Choose your preferred color scheme</p>
              </div>
              <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
                <SelectTrigger className="w-32 bg-card border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Compact Mode</p>
                <p className="text-xs text-muted-foreground">Reduce spacing for denser layouts</p>
              </div>
              <Switch checked={compactMode} onCheckedChange={setCompactMode} />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Code Font</p>
                <p className="text-xs text-muted-foreground">Font used in code blocks and queries</p>
              </div>
              <Select value={codeFont} onValueChange={(v) => setCodeFont(v as CodeFont)}>
                <SelectTrigger className="w-44 bg-card border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="jetbrains">JetBrains Mono</SelectItem>
                  <SelectItem value="fira">Fira Code</SelectItem>
                  <SelectItem value="cascadia">Cascadia Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
          <Button onClick={handleSaveAppearance} disabled={savingAppearance}>
            <Save size={14} className="mr-2" />
            {savingAppearance ? "Saving..." : "Save Appearance"}
          </Button>
        </TabsContent>

        {/* ─── Usage/Billing ───────────────────────────────────────────────────── */}
        <TabsContent value="billing" className="mt-6 space-y-4">
          <Card className="p-6 bg-background-secondary border-border">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-medium text-foreground">Current Plan</p>
                <p className="text-xs text-muted-foreground">Usage resets monthly</p>
              </div>
              <Badge className="bg-primary/10 text-primary border-0">Free</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-5">
              {[
                { label: "Queries run", value: entries.length, max: 100, unit: "" },
                { label: "Tokens used", value: totalTokens, max: 100000, unit: "" },
                { label: "Success rate", value: successRate, max: 100, unit: "%" },
                { label: "Providers set up", value: configuredCount, max: Object.keys(PROVIDER_LABELS).length, unit: "" },
              ].map(({ label, value, max, unit }) => (
                <div key={label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-mono">{value.toLocaleString()}{unit} / {max.toLocaleString()}{unit}</span>
                  </div>
                  <Progress value={Math.min((value / max) * 100, 100)} className="h-1.5" />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 bg-background-secondary border-border border-primary/20">
            <h3 className="text-sm font-semibold text-foreground mb-2">Upgrade to Pro</h3>
            <p className="text-xs text-muted-foreground mb-4">Unlock unlimited queries, priority support, and advanced analytics.</p>
            <ul className="space-y-2 mb-4">
              {["Unlimited queries & tokens", "Priority API routing", "Advanced analytics dashboard", "Team collaboration", "Audit logs & history export"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-foreground">
                  <Check size={12} className="text-success flex-shrink-0" /> {f}
                </li>
              ))}
            </ul>
            <Button onClick={() => toast.info("Billing integration coming soon")}>Upgrade — $29/mo</Button>
          </Card>
        </TabsContent>
      </Tabs>


    </div>
  );
}

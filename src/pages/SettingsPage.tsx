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
import type { Provider } from "@/lib/llm-client";
import { toast } from "sonner";
import { Eye, EyeOff, Trash2, Plus, Check, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { providerConfigs, setProviderConfig, activeProvider, setActiveProvider } = useLLMStore();
  const { entries } = useHistoryStore();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const totalTokens = entries.reduce((s, e) => s + e.totalTokens, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-foreground">Settings</h1>

      <Tabs defaultValue="profile">
        <TabsList className="bg-background-secondary">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="apikeys">API Keys</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6 space-y-6">
          <Card className="p-6 bg-background-secondary border-border">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-semibold">
                {user?.avatarInitials}
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Separator className="bg-border mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Full Name</Label>
                <Input defaultValue={user?.name} className="mt-1.5 bg-card border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input defaultValue={user?.email} readOnly className="mt-1.5 bg-card border-border text-muted-foreground" />
              </div>
            </div>
            <Button className="mt-4" onClick={() => toast.success("Profile updated")}>Save Changes</Button>
          </Card>
        </TabsContent>

        <TabsContent value="apikeys" className="mt-6 space-y-4">
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => {
            const config = providerConfigs[provider];
            const hasKey = !!config?.apiKey;
            return (
              <Card key={provider} className="p-4 bg-background-secondary border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: `hsl(${provider.length * 37 % 360}, 70%, 50%, 0.15)`, color: `hsl(${provider.length * 37 % 360}, 70%, 50%)` }}>
                      {PROVIDER_LABELS[provider][0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{PROVIDER_LABELS[provider]}</p>
                      <p className="text-xs text-muted-foreground">{hasKey ? `Key: ****${config!.apiKey.slice(-4)}` : "Not configured"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`border-0 text-xs ${hasKey ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {hasKey ? "Connected" : "Not configured"}
                    </Badge>
                    {hasKey && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setProviderConfig(provider, { apiKey: "" }); toast.success("API key removed"); }}>
                        <Trash2 size={14} className="text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {!hasKey && (
                  <div className="mt-3 flex gap-2">
                    <Input type="password" placeholder="Enter API key" className="bg-card border-border text-xs font-mono" onChange={(e) => setProviderConfig(provider, { apiKey: e.target.value })} />
                    <Button size="sm" variant="outline" className="border-border" onClick={() => toast.success("API key saved")}>Save</Button>
                  </div>
                )}
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="providers" className="mt-6 space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Default Provider</Label>
            <Select value={activeProvider} onValueChange={(v) => { setActiveProvider(v as Provider); toast.success("Default provider updated"); }}>
              <SelectTrigger className="mt-1.5 bg-background-secondary border-border w-64"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Separator className="bg-border" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(PROVIDER_LABELS) as Provider[]).map((provider) => (
              <Card key={provider} className="p-4 bg-background-secondary border-border">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground">{PROVIDER_LABELS[provider]}</span>
                  <Switch checked={providerConfigs[provider]?.enabled !== false} onCheckedChange={(v) => setProviderConfig(provider, { enabled: v })} />
                </div>
                <Select defaultValue={PROVIDER_MODELS[provider][0]}>
                  <SelectTrigger className="bg-card border-border text-xs"><SelectValue placeholder="Default model" /></SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {PROVIDER_MODELS[provider].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="appearance" className="mt-6 space-y-4">
          <Card className="p-6 bg-background-secondary border-border space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Theme</p>
                <p className="text-xs text-muted-foreground">Choose your preferred color scheme</p>
              </div>
              <Select defaultValue="dark">
                <SelectTrigger className="w-32 bg-card border-border"><SelectValue /></SelectTrigger>
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
              <Switch />
            </div>
            <Separator className="bg-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Code Font</p>
                <p className="text-xs text-muted-foreground">Font used in code blocks and queries</p>
              </div>
              <Select defaultValue="jetbrains">
                <SelectTrigger className="w-40 bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="jetbrains">JetBrains Mono</SelectItem>
                  <SelectItem value="fira">Fira Code</SelectItem>
                  <SelectItem value="cascadia">Cascadia Code</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-6 space-y-4">
          <Card className="p-6 bg-background-secondary border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-foreground">Current Plan</p>
                <p className="text-xs text-muted-foreground">You're on the Free plan</p>
              </div>
              <Badge className="bg-primary/10 text-primary border-0">Free</Badge>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Queries this month</span>
                  <span className="text-foreground">{entries.length} / 100</span>
                </div>
                <Progress value={Math.min(entries.length, 100)} max={100} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Tokens used</span>
                  <span className="text-foreground">{totalTokens.toLocaleString()} / 100,000</span>
                </div>
                <Progress value={Math.min(totalTokens / 1000, 100)} max={100} className="h-1.5" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-background-secondary border-border border-primary/20">
            <h3 className="text-sm font-semibold text-foreground mb-2">Upgrade to Pro</h3>
            <p className="text-xs text-muted-foreground mb-4">Unlock unlimited queries, priority support, and advanced features.</p>
            <ul className="space-y-2 mb-4">
              {["Unlimited queries & tokens", "Priority API routing", "Advanced analytics", "Team collaboration"].map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-foreground">
                  <Check size={12} className="text-success" /> {f}
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

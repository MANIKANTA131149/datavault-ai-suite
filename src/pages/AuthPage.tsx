import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/stores/auth-store";
import { toast } from "sonner";

const FEATURES = ["Multi-LLM Support", "CSV & Excel Native", "Agent Reasoning Trace"];

function FeaturePills() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActive((previous) => (previous + 1) % FEATURES.length);
    }, 2500);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {FEATURES.map((feature, index) => (
        <motion.span
          key={feature}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            index === active
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground"
          }`}
          animate={{ scale: index === active ? 1.04 : 1 }}
          transition={{ duration: 0.3 }}
        >
          {feature}
        </motion.span>
      ))}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { login, signup, loginWithAuth0, user: storeUser } = useAuthStore();
  const {
    isAuthenticated: auth0Authenticated,
    user: auth0User,
    getIdTokenClaims,
    isLoading: auth0Loading,
    loginWithRedirect,
    logout: auth0Logout,
  } = useAuth0();
  const [isLoading, setIsLoading] = useState(false);
  const [auth0Syncing, setAuth0Syncing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const auth0SyncedRef = useRef(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ─── Auth0 callback: detect when Auth0 login completes, sync with backend ──
  useEffect(() => {
    if (auth0Authenticated && auth0User && !storeUser && !auth0SyncedRef.current) {
      auth0SyncedRef.current = true;
      (async () => {
        setAuth0Syncing(true);
        try {
          const claims = await getIdTokenClaims();
          const idToken = claims?.__raw;
          if (!idToken) {
            // Stale Auth0 session (e.g. after logout) — clear silently
            auth0Logout({ logoutParams: { returnTo: window.location.origin + "/auth" } });
            return;
          }
          await loginWithAuth0(idToken);
          toast.success("Welcome!");
          navigate("/app/dashboard");
        } catch (err: any) {
          console.error("Auth0 sync error:", err);
          toast.error(err?.message || "Social login failed. Please try again.");
          auth0SyncedRef.current = false;
        } finally {
          setAuth0Syncing(false);
        }
      })();
    }
  }, [auth0Authenticated, auth0User, storeUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // If already logged in (store user), redirect to dashboard
  useEffect(() => {
    if (storeUser) navigate("/app/dashboard");
  }, [storeUser, navigate]);

  const handleAuth0Social = (connection: string) => {
    loginWithRedirect({
      authorizationParams: {
        connection,
        redirect_uri: `${window.location.origin}/auth`,
      },
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!loginEmail) errs.loginEmail = "Email is required";
    if (!loginPassword) errs.loginPassword = "Password is required";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await login(loginEmail, loginPassword);
      toast.success("Welcome back!");
      navigate("/app/dashboard");
    } catch {
      toast.error("Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!signupName) errs.signupName = "Name is required";
    if (!signupEmail) errs.signupEmail = "Email is required";
    if (!signupPassword) errs.signupPassword = "Password is required";
    if (signupPassword.length < 6) errs.signupPassword = "Min 6 characters";
    if (signupPassword !== signupConfirm) errs.signupConfirm = "Passwords don't match";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setErrors({});
    setIsLoading(true);
    try {
      await signup(signupName, signupEmail, signupPassword);
      toast.success("Account created!");
      navigate("/app/dashboard");
    } catch {
      toast.error("Signup failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading spinner while Auth0 processes the callback or syncs with backend
  if (auth0Loading || auth0Syncing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_34%),linear-gradient(180deg,_hsl(var(--background-secondary))_0%,_hsl(var(--background))_45%)]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_34%),linear-gradient(180deg,_hsl(var(--background-secondary))_0%,_hsl(var(--background))_45%)]">
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col xl:flex-row">
        <section className="flex flex-1 flex-col justify-between border-b border-border/70 px-4 py-6 sm:px-6 lg:px-10 xl:border-b-0 xl:border-r">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex-1"
          >
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground">
                DV
              </div>
              <span className="text-lg font-semibold text-foreground sm:text-xl">DataVault Agent</span>
            </div>

            <div className="max-w-2xl">
              <p className="mb-3 text-sm font-medium uppercase tracking-[0.24em] text-primary/80">
                Analytics workspace
              </p>
              <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl lg:text-5xl">
                Query your data in plain English on any device.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                Upload CSV or Excel files, connect your preferred LLM provider, and get instant insights with a full
                reasoning trace whether you are on mobile, tablet, or desktop.
              </p>
              <FeaturePills />
            </div>
          </motion.div>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: "Datasets", value: "CSV, XLSX, XLS" },
              { label: "Providers", value: "OpenAI, Gemini, Bedrock+" },
              { label: "Output", value: "Answers, history, insights" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border/70 bg-background/60 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-sm font-medium text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex w-full flex-1 items-center justify-center px-4 py-6 sm:px-6 lg:px-10">
          <motion.div
            className="w-full max-w-md rounded-[28px] border border-border/80 bg-background/95 p-5 shadow-2xl shadow-black/20 backdrop-blur sm:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Welcome</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to continue or create a new workspace account.
              </p>
            </div>

            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-background-secondary p-1">
                <TabsTrigger value="login" className="min-w-0">
                  Log in
                </TabsTrigger>
                <TabsTrigger value="signup" className="min-w-0">
                  Sign up
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="mt-1.5 bg-background-secondary border-border"
                    />
                    {errors.loginEmail && <p className="mt-1 text-xs text-destructive">{errors.loginEmail}</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="login-password">Password</Label>
                      <button type="button" className="shrink-0 text-xs text-primary hover:underline">
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative mt-1.5">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="bg-background-secondary border-border pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {errors.loginPassword && <p className="mt-1 text-xs text-destructive">{errors.loginPassword}</p>}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Signing in..." : "Sign in"}
                    {!isLoading && <ArrowRight size={16} className="ml-1" />}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <Label htmlFor="signup-name">Full name</Label>
                    <Input
                      id="signup-name"
                      autoComplete="name"
                      placeholder="John Doe"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="mt-1.5 bg-background-secondary border-border"
                    />
                    {errors.signupName && <p className="mt-1 text-xs text-destructive">{errors.signupName}</p>}
                  </div>

                  <div>
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@company.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="mt-1.5 bg-background-secondary border-border"
                    />
                    {errors.signupEmail && <p className="mt-1 text-xs text-destructive">{errors.signupEmail}</p>}
                  </div>

                  <div>
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="Min 6 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="mt-1.5 bg-background-secondary border-border"
                    />
                    {errors.signupPassword && <p className="mt-1 text-xs text-destructive">{errors.signupPassword}</p>}
                  </div>

                  <div>
                    <Label htmlFor="signup-confirm">Confirm password</Label>
                    <Input
                      id="signup-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={signupConfirm}
                      onChange={(e) => setSignupConfirm(e.target.value)}
                      className="mt-1.5 bg-background-secondary border-border"
                    />
                    {errors.signupConfirm && <p className="mt-1 text-xs text-destructive">{errors.signupConfirm}</p>}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? "Creating account..." : "Create account"}
                    {!isLoading && <ArrowRight size={16} className="ml-1" />}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="border-border bg-background-secondary hover:bg-card"
                  onClick={() => handleAuth0Social("google-oauth2")}
                  disabled={isLoading}
                >
                  <GoogleIcon /> Google
                </Button>
                <Button
                  variant="outline"
                  className="border-border bg-background-secondary hover:bg-card"
                  onClick={() => handleAuth0Social("github")}
                  disabled={isLoading}
                >
                  <GitHubIcon /> GitHub
                </Button>
              </div>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              By signing in you agree to our <button className="text-primary hover:underline">Terms</button> and{" "}
              <button className="text-primary hover:underline">Privacy Policy</button>
            </p>
          </motion.div>
        </section>
      </div>
    </div>
  );
}

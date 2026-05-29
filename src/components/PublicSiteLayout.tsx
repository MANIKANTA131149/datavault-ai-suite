import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ExternalLink, Menu, Moon, Shield, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const PUBLIC_THEME_KEY = "querify-site-theme";

type SiteTheme = "light" | "dark";

const NAV_ITEMS = [
  { label: "Product", href: "/website#product" },
  { label: "Security", href: "/website#security" },
  { label: "Pricing", href: "/website#pricing" },
  { label: "FAQ", href: "/website#faq" },
];

function getPreferredTheme(): SiteTheme {
  if (typeof window === "undefined") return "dark";
  const saved = localStorage.getItem(PUBLIC_THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: SiteTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("querify-cookie-consent");
      setVisible(!raw);
    } catch {
      setVisible(true);
    }
  }, []);

  const saveChoice = (accepted: boolean) => {
    try {
      localStorage.setItem(
        "querify-cookie-consent",
        JSON.stringify({
          essential: true,
          preferences: true,
          analytics: accepted,
          acceptedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Ignore storage failures; the banner can still dismiss in-session.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 lg:px-8">
      <div className="site-shell">
        <div className="rounded-[24px] border border-border/70 bg-background/95 p-4 shadow-[0_20px_54px_-30px_hsl(var(--foreground)/0.85)] backdrop-blur-xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-foreground">Cookie consent</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                We use essential storage to keep the site working, remember your theme, and support sign-in and workspace preferences.
                Optional analytics are not required. You can accept them now or reject non-essential storage.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="border-border" onClick={() => saveChoice(false)}>
                Reject non-essential
              </Button>
              <Button onClick={() => saveChoice(true)}>
                Accept all <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublicSiteLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [theme, setTheme] = useState<SiteTheme>(() => getPreferredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(PUBLIC_THEME_KEY, theme);
    } catch {
      // Ignore localStorage failures in private browsing.
    }
  }, [theme]);

  useEffect(() => {
    applyTheme(theme);
  }, [location.pathname, theme]);

  const showConsent =
    location.pathname === "/website" ||
    location.pathname === "/" ||
    location.pathname === "/privacy-policy" ||
    location.pathname === "/terms-and-conditions";

  const headerBadge = useMemo(
    () => (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <Shield size={10} className="text-primary" />
        Enterprise AI
      </span>
    ),
    [],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-[8px] transition-all duration-300">
        <div className="site-shell">
          <div className="flex items-center justify-between gap-3 py-4 sm:py-5">
            <Link to="/website" className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80">
              <img src="/logo.png" alt="Querify" className="h-10 w-10 rounded-lg object-contain ring-1 ring-border/70" />
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-bold text-foreground">Querify</p>
                <p className="truncate text-xs text-muted-foreground">AI Data Platform</p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {NAV_ITEMS.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-primary/10 hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
                className="h-10 w-10 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-foreground"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>

              <Button asChild className="hidden gap-2 rounded-lg sm:inline-flex">
                <Link to="/auth">
                  Sign in <ArrowRight size={14} />
                </Link>
              </Button>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-lg hover:bg-primary/10 lg:hidden">
                    <Menu size={18} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px]">
                  <div className="space-y-6 pt-8">
                    <div className="space-y-2">
                      {headerBadge}
                      <p className="text-sm font-semibold text-foreground">Navigation</p>
                    </div>

                    <nav className="space-y-2">
                      {NAV_ITEMS.map((item) => (
                        <a
                          key={item.label}
                          href={item.href}
                          className="block rounded-lg border border-border/60 px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                        >
                          {item.label}
                        </a>
                      ))}
                    </nav>

                    <div className="space-y-2 border-t border-border/60 pt-4">
                      <Link
                        to="/auth"
                        className="flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        Sign in
                      </Link>
                      <Link
                        to="/privacy-policy"
                        className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Privacy policy
                      </Link>
                      <Link
                        to="/terms-and-conditions"
                        className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Terms and conditions
                      </Link>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border/70 bg-background">
        <div className="site-shell py-12 sm:py-16">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-4 sm:col-span-1">
              {headerBadge}
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Enterprise AI data intelligence platform with natural-language analytics, governance, and deployment.
              </p>
              <div className="flex gap-3 pt-2">
                <a href="#" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="GitHub">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                </a>
                <a href="#" className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Twitter">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                  </svg>
                </a>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground">Product</p>
              <ul className="mt-4 space-y-2.5">
                {NAV_ITEMS.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground">Company</p>
              <ul className="mt-4 space-y-2.5">
                <li>
                  <Link to="/privacy-policy" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Privacy policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms-and-conditions" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Terms and conditions
                  </Link>
                </li>
                <li>
                  <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Status
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground">Support</p>
              <div className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">Have questions? We are here to help.</p>
                <a
                  href="mailto:support@querify.in"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  Email us <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-border/70 pt-6 sm:mt-12 sm:pt-8">
            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>(c) 2024 Querify. All rights reserved.</span>
              <span className="hidden sm:inline">Built by the DataVault team for modern enterprises.</span>
            </div>
          </div>
        </div>
      </footer>

      {showConsent && <CookieConsent />}
    </div>
  );
}

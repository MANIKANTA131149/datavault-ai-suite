import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ExternalLink, Menu, Moon, Shield, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollProgress, SiteBackground } from "@/components/site-motion";
import { cn } from "@/lib/utils";

const PUBLIC_THEME_KEY = "querify-site-theme";

type SiteTheme = "light" | "dark";

const NAV_ITEMS = [
  { label: "Product", href: "/website#product" },
  { label: "Platform", href: "/website#platform" },
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

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 lg:px-8"
        >
          <div className="site-shell">
            <div className="site-glass rounded-3xl p-4 shadow-[0_24px_60px_-30px_hsl(0_0%_0%/0.9)]">
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
                  <Button className="site-cta gap-2" onClick={() => saveChoice(true)}>
                    Accept all <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SiteNav({ theme, onToggleTheme }: { theme: SiteTheme; onToggleTheme: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        scrolled
          ? "border-b border-border/60 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/55"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="site-shell">
        <div className="flex items-center justify-between gap-3 py-3.5 sm:py-4">
          <Link to="/website" className="group flex min-w-0 items-center gap-2.5">
            <span className="relative">
              <span className="absolute inset-0 rounded-lg bg-primary/40 opacity-0 blur-md transition-opacity duration-300 group-hover:opacity-100" />
              <img src="/logo.png" alt="Querify" className="relative h-9 w-9 rounded-lg object-contain ring-1 ring-border/70 transition-transform duration-300 group-hover:scale-105" />
            </span>
            <div className="hidden min-w-0 sm:block">
              <p className="truncate text-sm font-bold text-foreground">Querify</p>
              <p className="truncate text-[11px] text-muted-foreground">AI Data Platform</p>
            </div>
          </Link>

          <nav
            className="hidden items-center gap-1 rounded-full border border-border/50 bg-card/40 p-1 backdrop-blur-md lg:flex"
            onMouseLeave={() => setHovered(null)}
          >
            {NAV_ITEMS.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onMouseEnter={() => setHovered(item.label)}
                className="relative rounded-full px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                {hovered === item.label && (
                  <motion.span
                    layoutId="nav-hover-pill"
                    className="absolute inset-0 rounded-full bg-primary/12"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={onToggleTheme}
              className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-foreground"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={theme}
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.25 }}
                  className="flex"
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </motion.span>
              </AnimatePresence>
            </Button>

            <Button asChild className="site-cta hidden gap-2 rounded-xl sm:inline-flex">
              <Link to="/auth">
                Sign in <ArrowRight size={14} />
              </Link>
            </Button>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-primary/10 lg:hidden">
                  <Menu size={18} />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] border-border/60 bg-background/85 backdrop-blur-2xl">
                <div className="space-y-6 pt-8">
                  <div className="space-y-2">
                    <span className="site-kicker">Navigation</span>
                  </div>

                  <nav className="space-y-2">
                    {NAV_ITEMS.map((item, i) => (
                      <motion.a
                        key={item.label}
                        href={item.href}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.05 * i, duration: 0.3 }}
                        className="flex items-center justify-between rounded-xl border border-border/50 bg-card/40 px-4 py-3 text-sm font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                      >
                        {item.label}
                        <ArrowRight size={14} className="opacity-50" />
                      </motion.a>
                    ))}
                  </nav>

                  <div className="space-y-2 border-t border-border/60 pt-4">
                    <Link
                      to="/auth"
                      className="site-cta flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white"
                    >
                      Sign in <ArrowRight size={14} />
                    </Link>
                    <Link to="/privacy-policy" className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      Privacy policy
                    </Link>
                    <Link to="/terms-and-conditions" className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      Terms and conditions
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </motion.header>
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
    <div className="site-root min-h-screen bg-background text-foreground">
      <SiteBackground />
      <ScrollProgress />

      <SiteNav theme={theme} onToggleTheme={() => setTheme((c) => (c === "dark" ? "light" : "dark"))} />

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 mt-10 border-t border-border/60">
        <div className="site-divider" />
        <div className="site-shell py-14 sm:py-20">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="space-y-4">
              <Link to="/website" className="inline-flex items-center gap-2.5">
                <img src="/logo.png" alt="Querify" className="h-10 w-10 rounded-lg object-contain ring-1 ring-border/70" />
                <div>
                  <p className="text-sm font-bold text-foreground">Querify</p>
                  <p className="text-[11px] text-muted-foreground">AI Data Platform</p>
                </div>
              </Link>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                Enterprise AI data intelligence platform with natural-language analytics, governance, and deployment.
              </p>
              <div className="flex gap-2.5 pt-2">
                {[
                  { label: "GitHub", path: "M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" },
                  { label: "Twitter", path: "M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" },
                ].map((social) => (
                  <a
                    key={social.label}
                    href="#"
                    aria-label={social.label}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/40 text-muted-foreground backdrop-blur transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d={social.path} /></svg>
                  </a>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground">Product</p>
              <ul className="mt-4 space-y-2.5">
                {NAV_ITEMS.map((item) => (
                  <li key={item.label}>
                    <a href={item.href} className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                      <span className="h-px w-0 bg-primary transition-all duration-300 group-hover:w-3" />
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
                  <Link to="/privacy-policy" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <span className="h-px w-0 bg-primary transition-all duration-300 group-hover:w-3" />
                    Privacy policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms-and-conditions" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <span className="h-px w-0 bg-primary transition-all duration-300 group-hover:w-3" />
                    Terms and conditions
                  </Link>
                </li>
                <li>
                  <a href="#" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <span className="h-px w-0 bg-primary transition-all duration-300 group-hover:w-3" />
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
                  className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                >
                  Email us <ExternalLink size={14} />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-border/60 pt-6">
            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="inline-flex items-center gap-2">
                {headerBadge}
                © {new Date().getFullYear()} Querify. All rights reserved.
              </span>
              <span className="hidden sm:inline">Built by the DataVault team for modern enterprises.</span>
            </div>
          </div>
        </div>
      </footer>

      {showConsent && <CookieConsent />}
    </div>
  );
}

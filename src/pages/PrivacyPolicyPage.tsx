import { CalendarDays, Mail, Shield, Database, Cookie, Eye, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicSiteLayout } from "@/components/PublicSiteLayout";

const SECTIONS = [
  {
    title: "Information we collect",
    icon: Database,
    body: [
      "Account details such as name, email address, and authentication state.",
      "Workspace content that you upload or create, including datasets, queries, insights, and notes.",
      "Configuration data such as themes, preferences, plan details, and provider settings.",
      "Operational data such as usage, history, audit events, and error records.",
    ],
  },
  {
    title: "How we use information",
    icon: Eye,
    body: [
      "Provide the service, authenticate users, and manage workspace access.",
      "Run queries, render results, save history, and maintain exported artifacts.",
      "Support analytics, security monitoring, debugging, billing, and customer support.",
      "Improve product quality and prepare account-level reporting for plan and admin features.",
    ],
  },
  {
    title: "Storage and security",
    icon: Lock,
    body: [
      "We use browser storage and server-side storage for session state, settings, and workspace data depending on the feature.",
      "The platform uses authenticated requests, role-aware permissions, and encrypted request handling in the app stack.",
      "Provider credentials may be stored in browser storage for the signed-in user and synchronized according to workspace settings.",
      "No system can be guaranteed perfectly secure, but we design the platform to reduce unnecessary exposure of sensitive data.",
    ],
  },
  {
    title: "Cookies and local storage",
    icon: Cookie,
    body: [
      "Essential storage keeps the site working, remembers your theme, and preserves sign-in or workspace state.",
      "Preference storage may remember interface choices such as density, selected provider, or navigation preferences.",
      "Optional analytics cookies are not required today, but if they are introduced later, this policy will be updated.",
    ],
  },
  {
    title: "Sharing information",
    icon: Shield,
    body: [
      "We may share information with service providers that help run the application, such as hosting, authentication, or storage vendors.",
      "Workspace owners and admins may see team data, plans, or audit records where the product design allows it.",
      "We may disclose information when required by law, to protect the service, or to enforce our agreements.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <PublicSiteLayout>
      <div className="site-shell">
        <div className="site-section max-w-4xl">
          <p className="site-kicker">Privacy policy</p>
          <h1 className="site-title">How Querify handles information</h1>
          <p className="site-copy">
            Last updated May 29, 2026. This policy explains how the platform collects, uses, stores, and protects information.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border text-xs">Enterprise workspace</Badge>
            <Badge variant="outline" className="border-border text-xs">Browser storage</Badge>
            <Badge variant="outline" className="border-border text-xs">Role-based access</Badge>
          </div>
        </div>

        <div className="space-y-4 pb-24">
          {SECTIONS.map(({ title, icon: Icon, body }) => (
            <Card key={title} className="site-panel max-w-4xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon size={18} />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
              </div>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
                {body.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}

          <Card className="site-panel max-w-4xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Mail size={18} />
              </div>
              <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              If you have a privacy question, data request, or account concern, contact{" "}
              <a href="mailto:support@querify.in" className="text-primary hover:underline">
                support@querify.in
              </a>
              .
            </p>
            <Button asChild variant="outline" className="mt-4 border-border">
              <Link to="/website">Back to website</Link>
            </Button>
          </Card>

          <div className="max-w-4xl text-xs leading-5 text-muted-foreground">
            <div className="flex items-start gap-2">
              <CalendarDays size={14} className="mt-0.5 shrink-0" />
              <p>
                Publication requires review against your hosting, legal, and operational setup.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PublicSiteLayout>
  );
}

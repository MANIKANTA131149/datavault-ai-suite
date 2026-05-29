import { CalendarDays, ClipboardList, Shield, TriangleAlert, UserCheck, Zap, BookMarked } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PublicSiteLayout } from "@/components/PublicSiteLayout";

const TERMS = [
  {
    title: "Use of the service",
    icon: UserCheck,
    body: [
      "You must provide accurate account information and keep your login credentials secure.",
      "You are responsible for the content you upload, query, share, or deploy through the platform.",
      "You must only use the service for lawful and authorized purposes.",
    ],
  },
  {
    title: "AI and analytics results",
    icon: Zap,
    body: [
      "Outputs can be helpful, but they may still be incomplete, inaccurate, or context-dependent.",
      "You should review results before relying on them for financial, operational, legal, or public decisions.",
      "The platform helps generate analysis; it does not replace professional judgment.",
    ],
  },
  {
    title: "Acceptable use",
    icon: ClipboardList,
    body: [
      "Do not attempt to bypass authentication, access controls, plan limits, or security protections.",
      "Do not upload or process data you do not have the right to use.",
      "Do not use the service to harm, exploit, or unlawfully expose another person or organization.",
    ],
  },
  {
    title: "Plans, billing, and limits",
    icon: BookMarked,
    body: [
      "Usage limits, exports, and admin capabilities may vary by plan.",
      "The platform may suspend or restrict features if limits are exceeded or if the account is misused.",
      "Enterprise or custom arrangements may include additional terms outside this page.",
    ],
  },
  {
    title: "Intellectual property",
    icon: Shield,
    body: [
      "The platform, interface, and brand assets remain the property of their respective owners.",
      "You keep rights to your data, subject to the license you grant us to process it for the service.",
      "Any feedback you give may be used to improve the product without obligation to compensate you.",
    ],
  },
  {
    title: "Suspension and termination",
    icon: TriangleAlert,
    body: [
      "We may suspend or terminate access for security, abuse, legal, or operational reasons.",
      "You may stop using the service at any time and request deletion where applicable.",
      "Some records may be retained for audit, compliance, or account integrity purposes.",
    ],
  },
];

export default function TermsPage() {
  return (
    <PublicSiteLayout>
      <div className="site-shell">
        <div className="site-section max-w-4xl">
          <p className="site-kicker">Terms and conditions</p>
          <h1 className="site-title">The rules for using Querify</h1>
          <p className="site-copy">
            Last updated May 29, 2026. These terms describe service use, account responsibility, and platform limits.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-border text-xs">Account responsibility</Badge>
            <Badge variant="outline" className="border-border text-xs">Output review required</Badge>
            <Badge variant="outline" className="border-border text-xs">Plan limits apply</Badge>
          </div>
        </div>

        <div className="space-y-4 pb-24">
          {TERMS.map(({ title, icon: Icon, body }) => (
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
            <h2 className="text-lg font-semibold text-foreground">Contact</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              For legal, support, or commercial questions, contact{" "}
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
                Publication requires alignment with billing, privacy, and service policies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PublicSiteLayout>
  );
}

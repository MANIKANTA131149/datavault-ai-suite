import { useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const SITE_NAME = "Querify Agent";
const DEFAULT_DESCRIPTION =
  "Enterprise AI data analytics with natural language SQL, multi-LLM reasoning, and secure team workflows.";
const DEFAULT_IMAGE =
  "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c0d1d314-e6bf-4f7b-8465-516300fbbfa6/id-preview-7962d302--4a5c5385-79b0-4902-8a36-cd3ada9a38e3.lovable.app-1775892635403.png";
const DEFAULT_KEYWORDS =
  "enterprise AI, data analytics, natural language SQL, business intelligence, secure analytics, LLM, agent reasoning";

function getSeoMetadata(pathname: string) {
  const base = {
    title: `${SITE_NAME} | Enterprise AI Data Intelligence`,
    description: DEFAULT_DESCRIPTION,
    image: DEFAULT_IMAGE,
    keywords: DEFAULT_KEYWORDS,
  };

  if (pathname === "/auth") {
    return {
      ...base,
      title: `${SITE_NAME} | Secure AI Data Access`,
      description:
        "Secure enterprise login for Querify Agent. Access AI-powered analytics, natural language query, and team intelligence.",
    };
  }

  if (pathname.startsWith("/app/query")) {
    return {
      ...base,
      title: `${SITE_NAME} | Query Any Database with AI`,
      description:
        "Use natural language to ask any dataset questions with Querify Agent's enterprise AI query engine.",
    };
  }

  if (pathname.startsWith("/app/dashboard")) {
    return {
      ...base,
      title: `${SITE_NAME} | Enterprise Analytics Dashboard`,
      description:
        "Monitor performance, user activity, and data insights from a centralized enterprise dashboard.",
    };
  }

  if (pathname.startsWith("/app/get-started")) {
    return {
      ...base,
      title: `${SITE_NAME} | Get Started with AI Data Analytics`,
      description:
        "Onboard your team quickly with enterprise-ready AI analytics, no-code data query, and secure collaboration.",
    };
  }

  if (pathname.startsWith("/app/insights")) {
    return {
      ...base,
      title: `${SITE_NAME} | Insightful AI Reports`,
      description:
        "Discover AI-generated intelligence and trend analysis across your enterprise data.",
    };
  }

  if (pathname.startsWith("/app/pricing") || pathname === "/pricing") {
    return {
      ...base,
      title: `${SITE_NAME} | Pricing for Enterprise Analytics`,
      description:
        "Choose the right Querify Agent plan for enterprise scale, security, and advanced AI capabilities.",
    };
  }

  if (pathname.startsWith("/deploy")) {
    return {
      ...base,
      title: `${SITE_NAME} | Embedded AI Chat for Data`,
      description:
        "Deploy secure AI chat experiences that connect business users directly to enterprise data.",
    };
  }

  return base;
}

export function Seo() {
  const location = useLocation();
  const metadata = useMemo(() => getSeoMetadata(location.pathname), [location.pathname]);
  const canonical = `${window.location.origin}${location.pathname}`;

  return (
    <Helmet>
      <title>{metadata.title}</title>
      <meta name="description" content={metadata.description} />
      <meta name="keywords" content={metadata.keywords} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={canonical} />

      <meta property="og:type" content="website" />
      <meta property="og:title" content={metadata.title} />
      <meta property="og:description" content={metadata.description} />
      <meta property="og:image" content={metadata.image} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:url" content={canonical} />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={metadata.title} />
      <meta name="twitter:description" content={metadata.description} />
      <meta name="twitter:image" content={metadata.image} />

      <meta name="theme-color" content="#2563eb" />

      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: SITE_NAME,
          description: metadata.description,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          publisher: {
            "@type": "Organization",
            name: SITE_NAME,
          },
        })}
      </script>
    </Helmet>
  );
}

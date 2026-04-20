import type { Provider } from "@/lib/llm-client";

const PROVIDER_MARKS: Record<Provider, string> = {
  groq: "GQ",
  openai: "AI",
  anthropic: "A",
  bedrock: "AWS",
  azure: "AZ",
  cohere: "CO",
  mistral: "M",
  together: "TG",
  ollama: "OL",
};

interface ProviderLogoProps {
  provider: Provider;
  size?: "sm" | "md";
}

export function ProviderLogo({ provider, size = "md" }: ProviderLogoProps) {
  const isSmall = size === "sm";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-sm ${
        isSmall ? "h-5 w-5 text-[8px]" : "h-9 w-9 text-[10px]"
      } font-semibold tracking-normal`}
      aria-hidden="true"
    >
      {PROVIDER_MARKS[provider] || provider.slice(0, 2).toUpperCase()}
    </span>
  );
}

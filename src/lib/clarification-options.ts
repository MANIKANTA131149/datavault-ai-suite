/** Parse selectable choices from agent clarification text or structured args. */

function normalizeOption(text: string): string {
  return text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\(([^)]+)\)$/, "$1")
    .trim();
}

function pushUnique(options: string[], text: string) {
  const normalized = normalizeOption(text);
  if (!normalized || normalized.length < 2) return;
  if (options.some((o) => o.toLowerCase() === normalized.toLowerCase())) return;
  options.push(normalized);
}

export function extractOptionsFromArgs(args: Record<string, unknown> | undefined): string[] {
  if (!args) return [];
  const options: string[] = [];
  for (const key of ["options", "choices", "alternatives"] as const) {
    const value = args[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string") {
        pushUnique(options, item);
      } else if (item && typeof item === "object") {
        const label = (item as { label?: string; value?: string }).label ?? (item as { value?: string }).value;
        if (typeof label === "string") pushUnique(options, label);
      }
    }
  }
  return options;
}

export function parseOptionsFromText(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return [];

  const options: string[] = [];

  // Numbered / bulleted lists (1. Option, - Option, * Option)
  const listRegex = /(?:\n|^)\s*(?:\d+[\s.)]+|[*+\-•]\s+)([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = listRegex.exec(text)) !== null) {
    pushUnique(options, match[1]);
  }
  if (options.length > 0) return options;

  // Lettered lists (A) Option, B. Option
  const letterRegex = /(?:\n|^)\s*[A-Za-z][\s.)]+([^\n]+)/g;
  while ((match = letterRegex.exec(text)) !== null) {
    pushUnique(options, match[1]);
  }
  if (options.length > 0) return options;

  // Inline intro phrases: "options include: a, b, or c"
  const introRegex =
    /(?:options include|choices include|choose from|pick one of|select one of|prefer|either|one of|which of the following):?\s*([^\n?.]+)/i;
  const introMatch = text.match(introRegex);
  if (introMatch) {
    const listPart = introMatch[1].trim();
    for (const part of listPart.split(/,|\bor\b|\band\b|\/|\|/i)) {
      pushUnique(options, part.replace(/^(?:or|and|either)\s+/i, ""));
    }
  }
  if (options.length > 0) return options;

  // Quoted choices: "Revenue" or "Profit"
  const quotedRegex = /["“]([^"”\n]+)["”]/g;
  while ((match = quotedRegex.exec(text)) !== null) {
    pushUnique(options, match[1]);
  }
  if (options.length >= 2) return options;

  return options;
}

export function mergeClarificationOptions(
  text: string,
  args?: Record<string, unknown>
): string[] {
  const fromArgs = extractOptionsFromArgs(args);
  if (fromArgs.length > 0) return fromArgs;
  return parseOptionsFromText(text);
}

export function cleanPromptText(text: string, options?: string[]): string {
  if (typeof text !== "string") return "";

  const listMatch = /(?:\n|^)\s*(?:\d+[\s.)]+|[*+\-•]\s+|[A-Za-z][\s.)]+)/.exec(text);
  if (listMatch) {
    const intro = text.slice(0, listMatch.index).trim();
    return intro
      .replace(
        /(?:options|options include|choices|choices include|the following options|the following|following|please clarify|pick one of):?\s*$/i,
        ""
      )
      .trim();
  }

  const introRegex =
    /(?:\n|^|[\s,])(?:options include|choices include|choose from|pick one of|select one of|prefer|either|one of):/i;
  const introMatch = text.match(introRegex);
  if (introMatch && introMatch.index !== undefined) {
    const intro = text.slice(0, introMatch.index).trim();
    return intro.endsWith("?") ? intro : `${intro}?`;
  }

  if (options && options.length > 0 && !text.trim().endsWith("?")) {
    return `${text.trim()}?`;
  }

  return text;
}

export function isClarificationAnswer(
  command: string,
  answerText: string,
  args?: Record<string, unknown>
): boolean {
  if (!["Answer", "FinalAnswer", "NarrativeAnswer"].includes(command)) return false;

  const structuredOptions = extractOptionsFromArgs(args);
  if (structuredOptions.length > 0) return true;

  if (typeof answerText !== "string") return false;

  const parsedOptions = parseOptionsFromText(answerText);
  const hasClarificationCue =
    answerText.includes("?") ||
    /\b(?:clarify|which|do you mean|please (?:choose|select|pick)|would you like|help me narrow)\b/i.test(
      answerText
    ) ||
    /\b(?:option|choice)s?\s*(?:include|are|:)/i.test(answerText);

  if (command === "NarrativeAnswer") {
    return hasClarificationCue && parsedOptions.length > 0;
  }

  return hasClarificationCue || parsedOptions.length > 0;
}

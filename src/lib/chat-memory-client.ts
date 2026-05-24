/**
 * chat-memory-client.ts
 *
 * LangChain-style short-term memory client.
 * Reads/writes the last 3 Q→A turns from MongoDB via /api/chat-memory.
 *
 * Usage pattern (mirrors LangChain MessagesPlaceholder + BufferWindowMemory):
 *   const history = await fetchChatMemory(sessionId);
 *   // … run agent …
 *   await saveChatMemoryTurn(sessionId, question, answer);
 */

import { getApiBaseUrl } from "./api-base";

export interface ChatMemoryTurn {
  question: string;
  answer: string;
  ts?: string;
}

function memoryUrl(): string {
  return `${getApiBaseUrl()}/chat-memory`;
}

/** Fetch up to 3 prior Q/A turns for a session from MongoDB */
export async function fetchChatMemory(
  sessionId: string,
  token?: string | null
): Promise<ChatMemoryTurn[]> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${memoryUrl()}?sessionId=${encodeURIComponent(sessionId)}`, {
      headers,
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.turns) ? data.turns : [];
  } catch {
    return [];
  }
}

/** Persist a Q/A turn to MongoDB (fire-and-forget safe) */
export async function saveChatMemoryTurn(
  sessionId: string,
  question: string,
  answer: string,
  token?: string | null
): Promise<void> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await fetch(memoryUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId, question, answer }),
    });
  } catch {
    // Non-critical — silent fail
  }
}

/** Clear all memory for a session (on dataset switch or explicit clear) */
export async function clearChatMemory(
  sessionId: string,
  token?: string | null
): Promise<void> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await fetch(`${memoryUrl()}?sessionId=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers,
    });
  } catch {
    // Non-critical
  }
}

/**
 * Build a compact context block from memory turns.
 * This is the LangChain MessagesPlaceholder equivalent:
 * inject prior turns as human/ai pairs in the prompt.
 *
 * Token budget: 3 turns × (Q≤120 + A≤200) ≈ ~1 000 tokens max.
 */
export function buildContextBlock(turns: ChatMemoryTurn[]): string {
  if (!turns.length) return "";

  return (
    "\n\nPrior conversation (last " +
    turns.length +
    " turn" +
    (turns.length !== 1 ? "s" : "") +
    " — use for follow-up context):\n" +
    turns
      .map(
        (t, i) =>
          `  Human[${i + 1}]: ${t.question.slice(0, 120)}\n  AI[${i + 1}]: ${t.answer.slice(0, 200)}`
      )
      .join("\n")
  );
}

/**
 * Generate a deterministic session ID from the user + data source.
 * Mirrors LangChain's thread_id concept: same user + same source = same thread.
 */
export function makeSessionId(userId: string, sourceId: string): string {
  // Simple stable hash — avoids crypto dependency
  return `${userId}__${sourceId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

import type { AIProvider } from "@/lib/ai/provider";
import { MockAIProvider } from "@/lib/ai/mock";
import { OpenAIProvider } from "@/lib/ai/openai";

let instance: AIProvider | null = null;

/** True when a real AI provider is configured (key present, server-side). */
export function isRealAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Singleton AI provider — real when a key exists, deterministic mock otherwise. */
export function getAI(): AIProvider {
  if (instance) return instance;
  instance = isRealAI() ? new OpenAIProvider() : new MockAIProvider();
  return instance;
}

export type { AIProvider };

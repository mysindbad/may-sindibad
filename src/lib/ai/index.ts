import "server-only";
import type { AiProvider } from "./provider";
import { createOpenAiProviderFromEnv } from "./openai";

export { isAiConfigured } from "./provider";
export type { AiMessage, AiToolCall, AiToolDefinition, AiCompletionResult, AiProvider } from "./provider";

let cachedProvider: AiProvider | null | undefined;

/** Returns the configured AI provider, or null if none is set up. */
export function getAiProvider(): AiProvider | null {
  if (cachedProvider === undefined) {
    cachedProvider = createOpenAiProviderFromEnv();
  }
  return cachedProvider;
}

import "server-only";
import type { AiCompletionResult, AiMessage, AiProvider, AiToolDefinition } from "./provider";

/**
 * Tries a cheaper/free model first, on a short leash, and falls back to the
 * primary model on any failure - a slow or overloaded free tier should delay
 * Sindbad's answer by a few seconds at most, never make it fail to answer.
 */
export class FallbackAiProvider implements AiProvider {
  readonly name: string;

  constructor(
    private readonly first: AiProvider,
    private readonly second: AiProvider,
  ) {
    this.name = `fallback(${first.name} -> ${second.name})`;
  }

  async complete(messages: AiMessage[], tools?: AiToolDefinition[]): Promise<AiCompletionResult> {
    try {
      return await this.first.complete(messages, tools);
    } catch (error) {
      console.error(`AI provider ${this.first.name} failed, falling back to ${this.second.name}`, error);
      return this.second.complete(messages, tools);
    }
  }
}

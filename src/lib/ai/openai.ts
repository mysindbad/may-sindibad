import "server-only";
import type { AiCompletionResult, AiMessage, AiProvider, AiToolCall, AiToolDefinition } from "./provider";
import { parseJsonResponseWithLimit, readResponseBodyWithLimit } from "@/lib/http/bounded-body";
import { FallbackAiProvider } from "./fallback";

const MAX_AI_RESPONSE_BYTES = 2 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 30_000;

// OpenAI-compatible chat completions adapter. Works with OpenAI itself and
// any endpoint that implements the same tool-calling message contract.
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(apiKey: string, baseUrl = "https://api.openai.com/v1", model = "gpt-4o-mini", timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
    this.name = `openai-compatible(${model})`;
  }

  async complete(messages: AiMessage[], tools?: AiToolDefinition[]): Promise<AiCompletionResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toOpenAiMessage),
      temperature: 0.5,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      body.tool_choice = "auto";
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const bytes = await readResponseBodyWithLimit(response, MAX_AI_RESPONSE_BYTES);
        detail = new TextDecoder().decode(bytes).slice(0, 300);
      } catch {
        detail = "provider error body exceeded the safety limit";
      }
      throw new Error(`AI provider error (${response.status}): ${detail}`);
    }

    const json = await parseJsonResponseWithLimit<{
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
    }>(response, MAX_AI_RESPONSE_BYTES);

    const message = json.choices?.[0]?.message;
    if (!message) {
      // Nothing in the expected OpenAI-compatible shape ({choices[0].message}).
      // Log the actual shape (truncated, no secrets) so a misconfigured
      // AI_API_BASE_URL / AI_MODEL pairing is diagnosable instead of silently
      // producing the generic "couldn't find an answer" fallback.
      console.error("AI provider returned an unexpected response shape", JSON.stringify(json).slice(0, 500));
    }
    const toolCalls: AiToolCall[] = (message?.tool_calls ?? []).map((call) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        const value = JSON.parse(call.function.arguments);
        if (value && typeof value === "object" && !Array.isArray(value)) parsedArgs = value as Record<string, unknown>;
      } catch {
        parsedArgs = {};
      }
      return { id: call.id, name: call.function.name, arguments: parsedArgs };
    });

    return { content: message?.content ?? null, toolCalls };
  }
}

function toOpenAiMessage(message: AiMessage): Record<string, unknown> {
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  }

  if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    };
  }

  return { role: message.role, content: message.content, ...(message.name ? { name: message.name } : {}) };
}

const FREE_MODEL_TIMEOUT_MS = 8_000;

/**
 * AI_FREE_MODEL is optional: a cheaper or free-tier model id on the same
 * gateway/key (e.g. an OpenRouter ":free" model) to try first, on a short
 * timeout, before the primary AI_MODEL. Left unset, only AI_MODEL is used,
 * exactly as before.
 */
export function createOpenAiProviderFromEnv(): AiProvider | null {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.AI_API_BASE_URL;
  const primary = new OpenAiCompatibleProvider(apiKey, baseUrl, process.env.AI_MODEL);

  const freeModel = process.env.AI_FREE_MODEL?.trim();
  if (!freeModel) return primary;

  const free = new OpenAiCompatibleProvider(apiKey, baseUrl, freeModel, FREE_MODEL_TIMEOUT_MS);
  return new FallbackAiProvider(free, primary);
}

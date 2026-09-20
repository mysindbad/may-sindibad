import "server-only";
import type { AiCompletionResult, AiMessage, AiProvider, AiToolCall, AiToolDefinition } from "./provider";
import { parseJsonResponseWithLimit, readResponseBodyWithLimit } from "@/lib/http/bounded-body";

const MAX_AI_RESPONSE_BYTES = 2 * 1024 * 1024;

// OpenAI-compatible chat completions adapter. Works with OpenAI itself and
// any endpoint that implements the same tool-calling message contract.
export class OpenAiCompatibleProvider implements AiProvider {
  readonly name = "openai-compatible";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(apiKey: string, baseUrl = "https://api.openai.com/v1", model = "gpt-4o-mini") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
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
      signal: AbortSignal.timeout(30_000),
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

export function createOpenAiProviderFromEnv(): AiProvider | null {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) return null;
  return new OpenAiCompatibleProvider(apiKey, process.env.AI_API_BASE_URL, process.env.AI_MODEL);
}

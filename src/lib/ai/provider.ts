// Provider-agnostic AI adapter. The rest of the app only talks to this
// interface, so swapping OpenAI for another vendor never touches UI/API
// route code. If no key is configured the app must keep working — callers
// check `isAiConfigured()` and show an honest state instead of faking output.
export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: AiToolCall[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AiCompletionResult {
  content: string | null;
  toolCalls: AiToolCall[];
}

export interface AiProvider {
  readonly name: string;
  complete(messages: AiMessage[], tools?: AiToolDefinition[]): Promise<AiCompletionResult>;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY);
}

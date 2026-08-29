export type AIMessageRole = "system" | "user" | "assistant" | "tool";

export interface AIToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIMessage {
  role: AIMessageRole;
  content: string;
  /** Present on assistant messages that request one or more tool calls. */
  toolCalls?: AIToolCallRequest[];
  /** Present on "tool" role messages, linking the result back to its request. */
  toolCallId?: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  parameters: Record<string, unknown>;
}

export interface GenerateRequest {
  model: string;
  messages: AIMessage[];
  tools?: AIToolDefinition[];
  /** Ask the provider to constrain output to valid JSON (e.g. for the
   * intent classifier, which has no tool calls to structure its answer). */
  responseFormat?: "json";
}

export interface AIResponse {
  content: string;
  toolCalls?: AIToolCallRequest[];
}

export interface AIProvider {
  generateResponse(request: GenerateRequest): Promise<AIResponse>;
}

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

export interface AITokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface AIResponse {
  content: string;
  toolCalls?: AIToolCallRequest[];
  /** Omitted if the provider doesn't report usage for this call. */
  usage?: AITokenUsage;
}

export interface EmbeddingRequest {
  model: string;
  /** One or more texts to embed in a single call. */
  input: string[];
}

export interface EmbeddingResponse {
  /** One vector per input, in the same order. */
  embeddings: number[][];
}

export interface AIProvider {
  generateResponse(request: GenerateRequest): Promise<AIResponse>;
  /**
   * Optional: not every provider offers embeddings, and nothing outside
   * the knowledge base needs them. Callers must handle its absence rather
   * than assume — lib/knowledge/ surfaces a clear "this provider can't
   * embed" error instead of failing obscurely.
   */
  generateEmbedding?(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

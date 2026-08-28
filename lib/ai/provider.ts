export type AIMessageRole = "system" | "user" | "assistant";

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export interface GenerateRequest {
  model: string;
  messages: AIMessage[];
}

export interface AIResponse {
  content: string;
}

export interface AIProvider {
  generateResponse(request: GenerateRequest): Promise<AIResponse>;
}

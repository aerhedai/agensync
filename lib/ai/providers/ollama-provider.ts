import type {
  AIProvider,
  AIResponse,
  GenerateRequest,
} from "@/lib/ai/provider";

interface OllamaChatResponse {
  message: { role: string; content: string };
}

export class OllamaProvider implements AIProvider {
  constructor(private readonly baseUrl: string) {}

  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    return { content: data.message.content };
  }
}

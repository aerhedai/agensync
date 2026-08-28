import type {
  AIMessage,
  AIProvider,
  AIResponse,
  AIToolCallRequest,
  GenerateRequest,
} from "@/lib/ai/provider";

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatResponse {
  message: { role: string; content: string; tool_calls?: OllamaToolCall[] };
}

function toOllamaMessage(message: AIMessage) {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls && {
      tool_calls: message.toolCalls.map((call) => ({
        function: { name: call.name, arguments: call.arguments },
      })),
    }),
    ...(message.toolCallId && { tool_call_id: message.toolCallId }),
  };
}

function fromOllamaToolCalls(
  calls: OllamaToolCall[] | undefined,
): AIToolCallRequest[] | undefined {
  if (!calls || calls.length === 0) return undefined;

  return calls.map((call, index) => ({
    // Ollama doesn't return a call ID; index-based IDs are stable within a
    // single response, which is all that's needed to pair results back up.
    id: `call_${index}`,
    name: call.function.name,
    arguments: call.function.arguments,
  }));
}

export class OllamaProvider implements AIProvider {
  constructor(private readonly baseUrl: string) {}

  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(toOllamaMessage),
        ...(request.tools && {
          tools: request.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
        }),
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    return {
      content: data.message.content,
      toolCalls: fromOllamaToolCalls(data.message.tool_calls),
    };
  }
}

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
  // Ollama's own token counts for this call — prompt_eval_count covers the
  // input (system + history + tools), eval_count the generated output.
  prompt_eval_count?: number;
  eval_count?: number;
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
  /**
   * proxySecret is only needed when baseUrl points at the auth proxy in
   * scripts/ollama-auth-proxy.py (see docs/production-notes.md) — a thin
   * bearer-token-gated reverse proxy that runs on the Ollama host itself,
   * used so a hosted deployment (which can't reach a Tailscale-only
   * network directly) can still call it over a public Tailscale Funnel
   * URL without leaving the real Ollama API open to the internet. Plain
   * local Ollama has no auth of its own, so this is omitted entirely for
   * local dev, which talks to Ollama directly.
   */
  constructor(
    private readonly baseUrl: string,
    private readonly proxySecret?: string,
  ) {}

  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.proxySecret && {
          Authorization: `Bearer ${this.proxySecret}`,
        }),
      },
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
        ...(request.responseFormat === "json" && { format: "json" }),
        // Reasoning-capable models (e.g. qwen3.5) generate a hidden chain-
        // of-thought before their visible answer by default — Ollama
        // strips it from `content` but still counts it in eval_count.
        // Measured live: a one-sentence reply cost 476 completion tokens
        // and several seconds with thinking on, vs 10 tokens and ~150ms
        // with it off. None of our calls (classification, extraction,
        // tool-calling) need hidden deliberation, so it's off for all of
        // them — ignored harmlessly by models that don't support it.
        think: false,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    const hasUsage =
      typeof data.prompt_eval_count === "number" &&
      typeof data.eval_count === "number";
    return {
      content: data.message.content,
      toolCalls: fromOllamaToolCalls(data.message.tool_calls),
      ...(hasUsage && {
        usage: {
          promptTokens: data.prompt_eval_count!,
          completionTokens: data.eval_count!,
        },
      }),
    };
  }
}

import type {
  AIMessage,
  AIProvider,
  AIResponse,
  AIToolCallRequest,
  GenerateRequest,
} from "@/lib/ai/provider";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

interface OpenRouterToolCall {
  id: string;
  function: { name: string; arguments: string };
}

interface OpenRouterChatResponse {
  choices: {
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenRouterToolCall[];
    };
  }[];
  // Present because every request opts in with `usage: { include: true }` —
  // `cost` is OpenRouter's own accounting of what this exact call billed, in
  // dollars. Preferred over multiplying token counts by a price list this
  // app would have to keep in sync itself, since OpenRouter's per-model
  // pricing is out of this app's control and changes independently of it.
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
  };
}

function toOpenRouterMessage(message: AIMessage) {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls && {
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    }),
    ...(message.toolCallId && { tool_call_id: message.toolCallId }),
  };
}

function fromOpenRouterToolCalls(
  calls: OpenRouterToolCall[] | undefined,
): AIToolCallRequest[] | undefined {
  if (!calls || calls.length === 0) return undefined;

  return calls.map((call) => ({
    id: call.id,
    name: call.function.name,
    // Tool call arguments always arrive as a JSON string on OpenRouter's
    // OpenAI-compatible shape — parsed here, never string-matched, the same
    // rule the model layer applies to every provider's tool calls.
    arguments: JSON.parse(call.function.arguments) as Record<string, unknown>,
  }));
}

/**
 * OpenRouter (openrouter.ai) — a hosted proxy in front of many third-party
 * models (an org can point this at any model OpenRouter carries, including
 * ones far cheaper per token than self-hosted Ollama's compute cost). Its
 * chat completions endpoint is OpenAI-compatible, which maps directly onto
 * this app's generic AIMessage/AIToolDefinition shapes with no translation
 * beyond field renaming — unlike a provider with its own message format
 * (e.g. Anthropic's), so plain fetch is enough, matching OllamaProvider's
 * own no-SDK approach for the same reason (CLAUDE.md §3: a bespoke SDK
 * dependency isn't justified when a generic HTTP call already reaches it).
 */
export class OpenRouterProvider implements AIProvider {
  /**
   * referer/title are OpenRouter's optional attribution headers (surfaced
   * on openrouter.ai's public model rankings) — harmless to omit, so both
   * default to undefined rather than forcing every caller to supply them.
   */
  constructor(
    private readonly apiKey: string,
    private readonly referer?: string,
    private readonly title?: string,
  ) {}

  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...(this.referer && { "HTTP-Referer": this.referer }),
        ...(this.title && { "X-OpenRouter-Title": this.title }),
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map(toOpenRouterMessage),
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
        ...(request.responseFormat === "json" && {
          response_format: { type: "json_object" },
        }),
        usage: { include: true },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter request failed: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as OpenRouterChatResponse;
    const message = data.choices[0]?.message;
    if (!message) {
      throw new Error("OpenRouter returned no choices in its response.");
    }

    const hasUsage =
      typeof data.usage?.prompt_tokens === "number" &&
      typeof data.usage?.completion_tokens === "number";

    return {
      content: message.content ?? "",
      toolCalls: fromOpenRouterToolCalls(message.tool_calls),
      ...(hasUsage && {
        usage: {
          promptTokens: data.usage!.prompt_tokens!,
          completionTokens: data.usage!.completion_tokens!,
          ...(typeof data.usage!.cost === "number" && {
            costUsd: data.usage!.cost,
          }),
        },
      }),
    };
  }
}

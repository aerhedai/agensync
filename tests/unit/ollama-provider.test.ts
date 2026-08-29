import { afterEach, describe, expect, it, vi } from "vitest";

import { OllamaProvider } from "@/lib/ai/providers/ollama-provider";

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the request in Ollama's /api/chat shape and parses the response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: { role: "assistant", content: "pong" } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider("http://ollama.test:11434");
    const result = await provider.generateResponse({
      model: "qwen2.5:14b",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result).toEqual({ content: "pong" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ollama.test:11434/api/chat",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "qwen2.5:14b",
          messages: [{ role: "user", content: "ping" }],
          think: false,
          stream: false,
        }),
      }),
    );
  });

  it("captures token usage when Ollama reports it", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: { role: "assistant", content: "pong" },
            prompt_eval_count: 42,
            eval_count: 7,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider("http://ollama.test:11434");
    const result = await provider.generateResponse({
      model: "qwen2.5:14b",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.usage).toEqual({ promptTokens: 42, completionTokens: 7 });
  });

  it("omits usage when Ollama doesn't report token counts", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: { role: "assistant", content: "pong" } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider("http://ollama.test:11434");
    const result = await provider.generateResponse({
      model: "qwen2.5:14b",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.usage).toBeUndefined();
  });

  it("sends tools in Ollama's function-calling shape and parses tool_calls back", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            message: {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  function: {
                    name: "calculate_quote",
                    arguments: { productId: "prod-1", quantity: 500 },
                  },
                },
              ],
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider("http://ollama.test:11434");
    const result = await provider.generateResponse({
      model: "qwen2.5:14b",
      messages: [{ role: "user", content: "quote 500 units" }],
      tools: [
        {
          name: "calculate_quote",
          description: "Calculate a quote.",
          parameters: { type: "object", properties: {} },
        },
      ],
    });

    expect(result.toolCalls).toEqual([
      {
        id: "call_0",
        name: "calculate_quote",
        arguments: { productId: "prod-1", quantity: 500 },
      },
    ]);

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody.tools).toEqual([
      {
        type: "function",
        function: {
          name: "calculate_quote",
          description: "Calculate a quote.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("round-trips a tool result message with its tool_call_id", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: { role: "assistant", content: "done" } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider("http://ollama.test:11434");
    await provider.generateResponse({
      model: "qwen2.5:14b",
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call_0",
              name: "find_product",
              arguments: { query: "Product A" },
            },
          ],
        },
        { role: "tool", content: '{"found":true}', toolCallId: "call_0" },
      ],
    });

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody.messages).toEqual([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            function: {
              name: "find_product",
              arguments: { query: "Product A" },
            },
          },
        ],
      },
      { role: "tool", content: '{"found":true}', tool_call_id: "call_0" },
    ]);
  });

  it("always disables thinking mode — measured live at 476 hidden tokens and multi-second latency for a one-sentence reply with it on, vs 10 tokens/~150ms with it off", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: { role: "assistant", content: "pong" } }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OllamaProvider("http://ollama.test:11434");
    await provider.generateResponse({
      model: "qwen3.5:4b",
      messages: [{ role: "user", content: "ping" }],
    });

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody.think).toBe(false);
  });

  it("throws a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("model not found", {
            status: 404,
            statusText: "Not Found",
          }),
      ),
    );

    const provider = new OllamaProvider("http://ollama.test:11434");

    await expect(
      provider.generateResponse({ model: "missing-model", messages: [] }),
    ).rejects.toThrow("Ollama request failed: 404 Not Found");
  });
});

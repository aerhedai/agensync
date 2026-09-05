import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenRouterProvider } from "@/lib/ai/providers/openrouter-provider";

describe("OpenRouterProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the request in OpenRouter's chat-completions shape and parses the response", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "pong" } }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider("test-key");
    const result = await provider.generateResponse({
      model: "upstage/solar-pro-2",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result).toEqual({ content: "pong", toolCalls: undefined });

    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = requestInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["HTTP-Referer"]).toBeUndefined();

    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody).toEqual({
      model: "upstage/solar-pro-2",
      messages: [{ role: "user", content: "ping" }],
      usage: { include: true },
    });
  });

  it("sends attribution headers when referer/title are configured", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "pong" } }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider(
      "test-key",
      "https://aperator.com",
      "Aperator",
    );
    await provider.generateResponse({
      model: "upstage/solar-pro-2",
      messages: [{ role: "user", content: "ping" }],
    });

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const headers = requestInit.headers as Record<string, string>;
    expect(headers["HTTP-Referer"]).toBe("https://aperator.com");
    expect(headers["X-OpenRouter-Title"]).toBe("Aperator");
  });

  it("captures token usage and OpenRouter's own reported dollar cost", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "pong" } }],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 30,
              cost: 0.000045,
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider("test-key");
    const result = await provider.generateResponse({
      model: "upstage/solar-pro-2",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.usage).toEqual({
      promptTokens: 120,
      completionTokens: 30,
      costUsd: 0.000045,
    });
  });

  it("omits usage when OpenRouter doesn't report token counts", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "pong" } }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider("test-key");
    const result = await provider.generateResponse({
      model: "upstage/solar-pro-2",
      messages: [{ role: "user", content: "ping" }],
    });

    expect(result.usage).toBeUndefined();
  });

  it("sends tools in OpenAI-compatible function-calling shape and parses tool_calls back", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_abc",
                      function: {
                        name: "create_record",
                        arguments: JSON.stringify({
                          recordType: "Invoice",
                          data: { number: "INV-1", total: 450 },
                        }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider("test-key");
    const result = await provider.generateResponse({
      model: "upstage/solar-pro-2",
      messages: [{ role: "user", content: "file this invoice" }],
      tools: [
        {
          name: "create_record",
          description: "Create a business record.",
          parameters: { type: "object", properties: {} },
        },
      ],
    });

    expect(result.content).toBe("");
    expect(result.toolCalls).toEqual([
      {
        id: "call_abc",
        name: "create_record",
        arguments: {
          recordType: "Invoice",
          data: { number: "INV-1", total: 450 },
        },
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
          name: "create_record",
          description: "Create a business record.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
  });

  it("round-trips a tool call and its result with matching ids", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "done" } }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider("test-key");
    await provider.generateResponse({
      model: "upstage/solar-pro-2",
      messages: [
        {
          role: "assistant",
          content: "",
          toolCalls: [
            {
              id: "call_0",
              name: "find_record",
              arguments: {
                recordType: "Invoice",
                field: "number",
                value: "INV-1",
              },
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
            id: "call_0",
            type: "function",
            function: {
              name: "find_record",
              arguments: JSON.stringify({
                recordType: "Invoice",
                field: "number",
                value: "INV-1",
              }),
            },
          },
        ],
      },
      { role: "tool", content: '{"found":true}', tool_call_id: "call_0" },
    ]);
  });

  it("requests OpenAI-compatible JSON mode when responseFormat is json", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "{}" } }],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenRouterProvider("test-key");
    await provider.generateResponse({
      model: "upstage/solar-pro-2",
      messages: [{ role: "user", content: "extract fields" }],
      responseFormat: "json",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody.response_format).toEqual({ type: "json_object" });
  });

  it("throws a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("invalid api key", {
            status: 401,
            statusText: "Unauthorized",
          }),
      ),
    );

    const provider = new OpenRouterProvider("bad-key");

    await expect(
      provider.generateResponse({ model: "upstage/solar-pro-2", messages: [] }),
    ).rejects.toThrow("OpenRouter request failed: 401 Unauthorized");
  });

  it("throws when OpenRouter returns no choices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      ),
    );

    const provider = new OpenRouterProvider("test-key");

    await expect(
      provider.generateResponse({ model: "upstage/solar-pro-2", messages: [] }),
    ).rejects.toThrow("OpenRouter returned no choices in its response.");
  });
});

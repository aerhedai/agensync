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
          stream: false,
        }),
      }),
    );
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

import { describe, expect, it } from "vitest";

import type { AIProvider } from "@/lib/ai/provider";
import { classifyIntent } from "@/lib/routing/classify-intent";

const classifier = {
  model: "test-model",
  instructions: "Classify the inbound message.",
};

const candidates = [
  { id: "agent-quote", name: "Quote Agent", description: "Handles quotes." },
  {
    id: "agent-complaints",
    name: "Complaints Agent",
    description: "Handles complaints.",
  },
];

function providerReturning(content: string): AIProvider {
  return { generateResponse: async () => ({ content }) };
}

describe("classifyIntent", () => {
  it("returns the matched agent id from valid JSON", async () => {
    const result = await classifyIntent(
      classifier,
      "Can I get a quote?",
      candidates,
      providerReturning('{"agentId": "agent-quote"}'),
    );
    expect(result).toBe("agent-quote");
  });

  it("returns null when the model says no agent fits", async () => {
    const result = await classifyIntent(
      classifier,
      "Random newsletter content",
      candidates,
      providerReturning('{"agentId": null}'),
    );
    expect(result).toBeNull();
  });

  it("strips a markdown code fence around the JSON", async () => {
    const result = await classifyIntent(
      classifier,
      "Can I get a quote?",
      candidates,
      providerReturning('```json\n{"agentId": "agent-quote"}\n```'),
    );
    expect(result).toBe("agent-quote");
  });

  it("returns null on malformed JSON rather than throwing", async () => {
    const result = await classifyIntent(
      classifier,
      "Can I get a quote?",
      candidates,
      providerReturning("not json at all"),
    );
    expect(result).toBeNull();
  });

  it("never trusts an agentId that isn't in the candidate list — the model recommends, this decides", async () => {
    const result = await classifyIntent(
      classifier,
      "Can I get a quote?",
      candidates,
      providerReturning('{"agentId": "some-other-agent-not-in-the-list"}'),
    );
    expect(result).toBeNull();
  });

  it("returns null immediately when there are no candidates, without calling the model", async () => {
    let called = false;
    const provider: AIProvider = {
      generateResponse: async () => {
        called = true;
        return { content: '{"agentId": null}' };
      },
    };

    const result = await classifyIntent(classifier, "Hello", [], provider);
    expect(result).toBeNull();
    expect(called).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { deterministicClassify } from "@/lib/routing/deterministic-classify";

const candidates = [
  { id: "quote", keywords: ["quote", "price", "how much"] },
  { id: "complaints", keywords: ["complaint", "unhappy", "damaged"] },
  { id: "general", keywords: [] },
];

describe("deterministicClassify", () => {
  it("matches when exactly one agent's keyword appears in the input", () => {
    expect(
      deterministicClassify("Can I get a quote for 500 units?", candidates),
    ).toBe("quote");
  });

  it("is case-insensitive", () => {
    expect(deterministicClassify("QUOTE please", candidates)).toBe("quote");
  });

  it("returns null when no agent's keywords match — falls through to the LLM classifier", () => {
    expect(
      deterministicClassify("What are your opening hours?", candidates),
    ).toBeNull();
  });

  it("returns null on ambiguity — more than one agent's keywords match", () => {
    const ambiguous = [
      { id: "a", keywords: ["order"] },
      { id: "b", keywords: ["order status"] },
    ];
    expect(
      deterministicClassify("What's my order status?", ambiguous),
    ).toBeNull();
  });

  it("never matches an agent with no keywords configured", () => {
    expect(
      deterministicClassify("general question about anything", candidates),
    ).toBeNull();
  });
});

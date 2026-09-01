import { describe, expect, it } from "vitest";

import { containsForbiddenKeyword } from "@/lib/harness/pipeline-guards";
import { DEFAULT_COMPLAINTS_GUARDRAIL_KEYWORDS } from "@/lib/agents/default-agent-config";

describe("containsForbiddenKeyword", () => {
  it("catches an explicit refund promise", () => {
    expect(
      containsForbiddenKeyword(
        "We would be happy to offer you a full refund.",
        DEFAULT_COMPLAINTS_GUARDRAIL_KEYWORDS,
      ),
    ).toBe(true);
  });

  it("catches a free-replacement promise", () => {
    expect(
      containsForbiddenKeyword(
        "We will send you a free replacement right away.",
        DEFAULT_COMPLAINTS_GUARDRAIL_KEYWORDS,
      ),
    ).toBe(true);
  });

  it("catches a discount offer", () => {
    expect(
      containsForbiddenKeyword(
        "Here is a 10% discount on your order.",
        DEFAULT_COMPLAINTS_GUARDRAIL_KEYWORDS,
      ),
    ).toBe(true);
  });

  it("allows a compliant reply that defers to a human", () => {
    expect(
      containsForbiddenKeyword(
        "Thank you for letting us know. A member of our team will follow up shortly.",
        DEFAULT_COMPLAINTS_GUARDRAIL_KEYWORDS,
      ),
    ).toBe(false);
  });

  it("is a no-op when no keywords are configured — the default for a category with no guardrail", () => {
    expect(
      containsForbiddenKeyword("We will send you a full refund today.", []),
    ).toBe(false);
  });

  it("is business-configurable to any category, not just complaints", () => {
    expect(
      containsForbiddenKeyword(
        "I can personally guarantee this case will win.",
        ["guarantee"],
      ),
    ).toBe(true);
  });
});

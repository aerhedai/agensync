import { describe, expect, it } from "vitest";

import { containsCompensationPromise } from "@/lib/harness/pipeline-guards";

describe("containsCompensationPromise", () => {
  it("catches an explicit refund promise", () => {
    expect(
      containsCompensationPromise(
        "We would be happy to offer you a full refund.",
      ),
    ).toBe(true);
  });

  it("catches a free-replacement promise", () => {
    expect(
      containsCompensationPromise(
        "We will send you a free replacement right away.",
      ),
    ).toBe(true);
  });

  it("catches a discount offer", () => {
    expect(
      containsCompensationPromise("Here is a 10% discount on your order."),
    ).toBe(true);
  });

  it("allows a compliant reply that defers to a human", () => {
    expect(
      containsCompensationPromise(
        "Thank you for letting us know. A member of our team will follow up shortly.",
      ),
    ).toBe(false);
  });
});

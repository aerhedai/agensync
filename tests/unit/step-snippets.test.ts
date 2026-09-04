import { describe, expect, it } from "vitest";

import { stepProgrammeSchema } from "@/lib/harness/steps/schema";
import { STEP_SNIPPETS } from "@/lib/harness/steps/snippets";

// The "add a step" buttons in the agent form hand someone JSON. If a snippet
// doesn't satisfy the runtime schema, the button's whole job — give me a
// starting point I can edit — is inverted: you get something that looks
// right and is rejected on save, with no clue which part you broke.
describe("step snippets", () => {
  it("every snippet is a step the runtime would accept", () => {
    for (const snippet of STEP_SNIPPETS) {
      const result = stepProgrammeSchema.safeParse({ steps: [snippet.step] });
      expect(
        result.success,
        `"${snippet.label}": ${result.success ? "" : result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`,
      ).toBe(true);
    }
  });

  it("covers every step kind, so no kind is undiscoverable in the form", () => {
    // The form's buttons are the only in-product listing of the vocabulary.
    // A kind with no button is one a business can only find by reading the
    // design doc.
    const kinds = new Set(STEP_SNIPPETS.map((s) => s.step.kind));
    expect([...kinds].sort()).toEqual([
      "act",
      "branch",
      "compose",
      "compute",
      "extract",
      "lookup",
      "retrieve",
    ]);
  });
});

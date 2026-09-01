import { describe, expect, it } from "vitest";

import { extractionFieldsSchema } from "@/lib/agents/extraction-fields";

describe("extractionFieldsSchema", () => {
  it("accepts a well-formed business-defined field list", () => {
    const result = extractionFieldsSchema.safeParse([
      { name: "caseNumber", description: "the case number if mentioned" },
      { name: "urgency", description: "how urgent they say this is" },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects a field named customerEmail — extracted automatically, not business-configurable", () => {
    const result = extractionFieldsSchema.safeParse([
      { name: "customerEmail", description: "their email" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects duplicate field names", () => {
    const result = extractionFieldsSchema.safeParse([
      { name: "topic", description: "first" },
      { name: "topic", description: "second" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects a field name that isn't a valid identifier", () => {
    const result = extractionFieldsSchema.safeParse([
      { name: "case number!", description: "the case number" },
    ]);
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 fields — resent on every run, an unbounded list is a real cost footgun", () => {
    const fields = Array.from({ length: 11 }, (_, i) => ({
      name: `field${i}`,
      description: `field ${i}`,
    }));
    const result = extractionFieldsSchema.safeParse(fields);
    expect(result.success).toBe(false);
  });

  it("accepts an empty list — most categories need no extra fields beyond identity", () => {
    const result = extractionFieldsSchema.safeParse([]);
    expect(result.success).toBe(true);
  });
});

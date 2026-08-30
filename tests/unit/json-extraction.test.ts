import { describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonResponse } from "@/lib/ai/json-extraction";

const schema = z.object({ agentId: z.string().nullable() });

describe("parseJsonResponse", () => {
  it("parses and validates clean JSON", () => {
    expect(parseJsonResponse('{"agentId": "quote"}', schema)).toEqual({
      agentId: "quote",
    });
  });

  it("strips a markdown code fence", () => {
    expect(
      parseJsonResponse('```json\n{"agentId": "quote"}\n```', schema),
    ).toEqual({ agentId: "quote" });
  });

  it("returns null on malformed JSON", () => {
    expect(parseJsonResponse("not json", schema)).toBeNull();
  });

  it("returns null when the JSON doesn't match the schema", () => {
    expect(parseJsonResponse('{"wrongField": 1}', schema)).toBeNull();
  });
});

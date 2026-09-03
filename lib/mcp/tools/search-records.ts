import { z } from "zod";

import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";
import {
  describeRecordTypeError,
  searchRecords,
} from "@/lib/records/record-service";

const TOOL_NAME: ToolName = "search_records";

const inputSchema = {
  recordType: z
    .string()
    .min(1)
    .describe(
      'The record type to search, e.g. "Customer", "Product", "Property"',
    ),
  query: z.string().min(1).describe("Text to search for across the fields"),
};

const outputSchema = {
  found: z.boolean(),
  records: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
};

/**
 * The fuzzy counterpart to find_record — built for an LLM's free-text
 * guesses ("the customer at Acme") rather than a known key. Kept as a
 * separate tool rather than an optional mode of find_record so the model
 * has to choose deliberately between "I know the exact value" and "I am
 * guessing", which is the distinction that decides whether a
 * deterministic pipeline can trust the result.
 */
export function createSearchRecordsTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Search records of one type by approximate text across their fields. Use find_record instead when you know an exact field value.",
    inputSchema,
    outputSchema,
    handler: async ({
      recordType,
      query,
    }: {
      recordType: string;
      query: string;
    }) => {
      try {
        const records = await searchRecords(organisationId, recordType, query);
        return toolSuccess({ found: records.length > 0, records });
      } catch (error) {
        const message = await describeRecordTypeError(organisationId, error);
        if (message) return toolError(message);
        throw error;
      }
    },
  };
}

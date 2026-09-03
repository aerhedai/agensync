import { z } from "zod";

import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";
import {
  describeRecordTypeError,
  findRecord,
} from "@/lib/records/record-service";

const TOOL_NAME: ToolName = "find_record";

const inputSchema = {
  recordType: z
    .string()
    .min(1)
    .describe('The record type to look in, e.g. "Customer", "Product", "Job"'),
  field: z
    .string()
    .min(1)
    .describe('Which field to match exactly, e.g. "email" or "jobId"'),
  value: z.string().min(1).describe("The exact value to match"),
};

const outputSchema = {
  found: z.boolean(),
  record: z
    .object({
      id: z.string(),
      type: z.string(),
      data: z.record(z.string(), z.unknown()),
    })
    .nullable(),
};

/**
 * The single exact-match lookup tool, across every record type a business
 * has — built-in (Customer/Product) or its own (CLAUDE.md §4.5: tools are
 * verbs against primitives, not against verticals). Replaced the separate
 * find_customer / find_product / check_inventory /
 * find_custom_entity_record tools, which were four spellings of one idea
 * and grew the registry every time a new domain appeared.
 *
 * organisationId is bound at server-construction time, never taken from
 * the model — a business's records must not be reachable by a call scoped
 * to a different organisation.
 */
export function createFindRecordTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      'Find a single record by an exact field match — e.g. the Customer whose email is "a@b.com", or the Job whose jobId is "1042". Use search_records instead when you only have an approximate name.',
    inputSchema,
    outputSchema,
    handler: async ({
      recordType,
      field,
      value,
    }: {
      recordType: string;
      field: string;
      value: string;
    }) => {
      try {
        const record = await findRecord(
          organisationId,
          recordType,
          field,
          value,
        );
        return toolSuccess({ found: record !== null, record });
      } catch (error) {
        // Naming a type that doesn't exist is a different failure from
        // finding nothing, and describeRecordTypeError tells the model
        // what *does* exist so it can correct itself rather than
        // concluding the business has no data.
        const message = await describeRecordTypeError(organisationId, error);
        if (message) return toolError(message);
        throw error;
      }
    },
  };
}

import { z } from "zod";

import * as entityRecordService from "@/lib/entities/entity-record-service";
import { InvalidReferenceError } from "@/lib/entities/references";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";
import {
  describeRecordTypeError,
  resolveWritableType,
} from "@/lib/records/record-service";

const TOOL_NAME: ToolName = "create_record";

const inputSchema = {
  recordType: z
    .string()
    .min(1)
    .describe('The record type to create in, e.g. "Job"'),
  data: z
    .record(z.string(), z.unknown())
    .describe(
      'The record\'s field values, e.g. {"jobId": "1042", "status": "New"}',
    ),
};

const outputSchema = {
  record: z.object({
    id: z.string(),
    type: z.string(),
    data: z.record(z.string(), z.unknown()),
  }),
};

/**
 * The write counterpart to find_record/search_records — one generic tool
 * taking a record type as a parameter, never one tool per type, so the
 * registry stays a small fixed list however many types a business
 * defines (CLAUDE.md §4.5).
 *
 * Not approval-gated: creating an internal tracking record is not a
 * customer-visible or consequential action the way send_email and
 * create_calendar_event are (see lib/policies/policy-engine.ts).
 */
export function createCreateRecordTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Create a new record of one of this business's own record types.",
    inputSchema,
    outputSchema,
    handler: async ({
      recordType,
      data,
    }: {
      recordType: string;
      data: Record<string, unknown>;
    }) => {
      try {
        const type = await resolveWritableType(organisationId, recordType);
        // Goes through the service, not the repository, so a reference
        // field pointing at a nonexistent, wrong-typed, or another
        // organisation's record is rejected rather than stored.
        const record = await entityRecordService.createRecordChecked(
          organisationId,
          type.id,
          data,
        );
        return toolSuccess({
          record: {
            id: record.id,
            type: type.name,
            data: record.data as Record<string, unknown>,
          },
        });
      } catch (error) {
        if (error instanceof InvalidReferenceError) {
          return toolError(error.message);
        }
        const message = await describeRecordTypeError(organisationId, error);
        if (message) return toolError(message);
        throw error;
      }
    },
  };
}

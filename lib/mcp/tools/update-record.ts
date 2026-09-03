import { z } from "zod";

import * as entityRecordService from "@/lib/entities/entity-record-service";
import { InvalidReferenceError } from "@/lib/entities/references";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";
import {
  describeRecordTypeError,
  resolveWritableType,
} from "@/lib/records/record-service";

const TOOL_NAME: ToolName = "update_record";

const inputSchema = {
  recordType: z
    .string()
    .min(1)
    .describe('The record type the record belongs to, e.g. "Job"'),
  recordId: z.string().min(1).describe("The id of the record to update"),
  data: z
    .record(z.string(), z.unknown())
    .describe(
      "Fields to update — merged into the existing record, other fields are left untouched.",
    ),
};

const outputSchema = {
  record: z.object({
    id: z.string(),
    type: z.string(),
    data: z.record(z.string(), z.unknown()),
  }),
};

/** Same generic-tool and not-approval-gated reasoning as create_record. */
export function createUpdateRecordTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Update fields on an existing record. Only the given fields change — everything else is left as-is.",
    inputSchema,
    outputSchema,
    handler: async ({
      recordType,
      recordId,
      data,
    }: {
      recordType: string;
      recordId: string;
      data: Record<string, unknown>;
    }) => {
      try {
        const type = await resolveWritableType(organisationId, recordType);
        const record = await entityRecordService.updateRecordChecked(
          organisationId,
          recordId,
          data,
        );
        if (!record) {
          return toolError(`No record with id "${recordId}" exists.`);
        }
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

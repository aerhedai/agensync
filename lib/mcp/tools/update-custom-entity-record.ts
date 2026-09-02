import { z } from "zod";

import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "update_custom_entity_record";

const inputSchema = {
  entityType: z
    .string()
    .min(1)
    .describe('The name of the custom entity type, e.g. "Job"'),
  recordId: z.string().min(1),
  data: z
    .record(z.string(), z.unknown())
    .describe(
      "Fields to update — merged into the existing record, other fields are left untouched.",
    ),
};

const outputSchema = {
  record: z.object({ id: z.string(), data: z.record(z.string(), z.unknown()) }),
};

/** Same reasoning as create_custom_entity_record — not approval-gated. */
export function createUpdateCustomEntityRecordTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Update fields on an existing record in one of this business's own custom entity types. Only the given fields change — everything else is left as-is.",
    inputSchema,
    outputSchema,
    handler: async ({
      entityType,
      recordId,
      data,
    }: {
      entityType: string;
      recordId: string;
      data: Record<string, unknown>;
    }) => {
      const type = await entityTypeRepository.findEntityTypeByName(
        organisationId,
        entityType,
      );
      if (!type) {
        return toolError(`No custom entity type named "${entityType}" exists.`);
      }
      const record = await entityRecordRepository.updateRecordData(
        organisationId,
        recordId,
        data,
      );
      if (!record) {
        return toolError(`No record with id "${recordId}" exists.`);
      }
      return toolSuccess({
        record: { id: record.id, data: record.data as Record<string, unknown> },
      });
    },
  };
}

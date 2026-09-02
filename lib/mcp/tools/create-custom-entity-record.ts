import { z } from "zod";

import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import type { Prisma } from "@/lib/generated/prisma/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "create_custom_entity_record";

const inputSchema = {
  entityType: z
    .string()
    .min(1)
    .describe('The name of the custom entity type, e.g. "Job"'),
  data: z
    .record(z.string(), z.unknown())
    .describe(
      'The record\'s field values, e.g. {"jobId": "1042", "status": "New"}',
    ),
};

const outputSchema = {
  record: z.object({ id: z.string(), data: z.record(z.string(), z.unknown()) }),
};

/**
 * The write counterpart to search_custom_entity/find_custom_entity_record
 * — same "one generic tool, not one per entity type" reasoning (see
 * search-custom-entity.ts's comment). Not approval-gated: creating an
 * internal tracking record is not itself a customer-visible or
 * consequential action the way send_email/create_calendar_event are (see
 * policy-engine.ts) — same class as notify_slack/notify_teams.
 */
export function createCreateCustomEntityRecordTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Create a new record in one of this business's own custom entity types.",
    inputSchema,
    outputSchema,
    handler: async ({
      entityType,
      data,
    }: {
      entityType: string;
      data: Record<string, unknown>;
    }) => {
      const type = await entityTypeRepository.findEntityTypeByName(
        organisationId,
        entityType,
      );
      if (!type) {
        return toolError(`No custom entity type named "${entityType}" exists.`);
      }
      const record = await entityRecordRepository.createRecord(
        organisationId,
        type.id,
        data as Prisma.InputJsonValue,
      );
      return toolSuccess({
        record: { id: record.id, data: record.data as Record<string, unknown> },
      });
    },
  };
}

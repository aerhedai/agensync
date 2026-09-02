import { z } from "zod";

import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "find_custom_entity_record";

const inputSchema = {
  entityType: z
    .string()
    .min(1)
    .describe('The name of the custom entity type, e.g. "Job"'),
  field: z
    .string()
    .min(1)
    .describe('Which field to match exactly, e.g. "jobId"'),
  value: z.string().min(1).describe("The exact value to match"),
};

const outputSchema = {
  found: z.boolean(),
  record: z
    .object({ id: z.string(), data: z.record(z.string(), z.unknown()) })
    .nullable(),
};

/**
 * An exact-match lookup — distinct from search_custom_entity's fuzzy
 * substring search, which is built for an LLM's free-text guesses.
 * Deterministic pipelines need to reliably find "the record where jobId is
 * exactly this one" before deciding whether to create or update it; a
 * fuzzy search can't make that call safely.
 */
export function createFindCustomEntityRecordTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      'Find a record in one of this business\'s own custom entity types by an exact field match — e.g. find the Job where jobId is "1042".',
    inputSchema,
    outputSchema,
    handler: async ({
      entityType,
      field,
      value,
    }: {
      entityType: string;
      field: string;
      value: string;
    }) => {
      const type = await entityTypeRepository.findEntityTypeByName(
        organisationId,
        entityType,
      );
      if (!type) {
        return toolError(`No custom entity type named "${entityType}" exists.`);
      }
      const record = await entityRecordRepository.findRecordByFieldValue(
        organisationId,
        type.id,
        field,
        value,
      );
      return toolSuccess({
        found: record !== null,
        record: record
          ? { id: record.id, data: record.data as Record<string, unknown> }
          : null,
      });
    },
  };
}

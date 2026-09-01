import { z } from "zod";

import * as entityTypeRepository from "@/lib/entities/entity-type-repository";
import * as entityRecordRepository from "@/lib/entities/entity-record-repository";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "search_custom_entity";

const inputSchema = {
  entityType: z
    .string()
    .min(1)
    .describe('The name of the custom entity type to search, e.g. "Property"'),
  query: z
    .string()
    .min(1)
    .describe("Text to search for across the record's fields"),
};

const outputSchema = {
  found: z.boolean(),
  records: z.array(
    z.object({ id: z.string(), data: z.record(z.string(), z.unknown()) }),
  ),
};

/**
 * The one generic lookup tool for business-defined data (lib/entities/) —
 * not one tool per entity type. Registering a new MCP tool per business-
 * defined type would mean the tool registry (a small, fixed, reviewable
 * list — see tool-registry.ts's own comment) grows with every entity type
 * any business ever defines, across every organisation. entityType being
 * a request parameter instead keeps the registry itself fixed while still
 * letting each business search its own arbitrary data.
 *
 * organisationId bound at server-construction time, same pattern as every
 * other tool here — a business's custom records must never be reachable
 * by a call scoped to a different organisation.
 */
export function createSearchCustomEntityTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Look up a record in one of this business's own custom entity types.",
    inputSchema,
    outputSchema,
    handler: async ({
      entityType,
      query,
    }: {
      entityType: string;
      query: string;
    }) => {
      const type = await entityTypeRepository.findEntityTypeByName(
        organisationId,
        entityType,
      );
      if (!type) {
        return toolError(`No custom entity type named "${entityType}" exists.`);
      }
      const records = await entityRecordRepository.searchRecords(
        organisationId,
        type.id,
        query,
      );
      return toolSuccess({
        found: records.length > 0,
        records: records.map((r) => ({
          id: r.id,
          data: r.data as Record<string, unknown>,
        })),
      });
    },
  };
}

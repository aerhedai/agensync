import { z } from "zod";

import {
  EmbeddingUnavailableError,
  search,
} from "@/lib/knowledge/knowledge-service";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "search_knowledge";

const inputSchema = {
  query: z
    .string()
    .min(1)
    .describe(
      'What to look up, in plain words — e.g. "refund policy for damaged goods"',
    ),
};

const outputSchema = {
  found: z.boolean(),
  passages: z.array(
    z.object({
      document: z.string(),
      content: z.string(),
    }),
  ),
};

/**
 * Retrieval over the business's own documents — policies, SOPs, price
 * lists, FAQs.
 *
 * The counterpart to find_record/search_records, and deliberately a
 * separate tool: records are looked up exactly by key and aggregated,
 * knowledge is retrieved by meaning. Using semantic search for "which
 * invoice is INV-2291" would be actively wrong, and exact matching for
 * "what does our policy say about X" barely works at all.
 *
 * Read-only, so never approval-gated. organisationId is bound at
 * server-construction time like every other tool — a vector index will
 * happily return the nearest neighbour from another business's documents
 * if the query isn't scoped, so this is a real boundary, not a formality.
 */
export function createSearchKnowledgeTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Look something up in this business's own documented knowledge — policies, procedures, price lists, FAQs. Use this for 'what does our policy say' questions; use find_record or search_records for looking up a specific customer, product, or other record.",
    inputSchema,
    outputSchema,
    handler: async ({ query }: { query: string }) => {
      try {
        const results = await search(organisationId, query);
        return toolSuccess({
          found: results.length > 0,
          // Scores are deliberately not returned: they'd be noise in a
          // prompt, and the model has no basis for reasoning about a
          // fused rank value.
          passages: results.map((r) => ({
            document: r.documentTitle,
            content: r.content,
          })),
        });
      } catch (error) {
        if (error instanceof EmbeddingUnavailableError) {
          return toolError(error.message);
        }
        throw error;
      }
    },
  };
}

import { z } from "zod";

import * as customerRepository from "@/lib/customers/customer-repository";
import { toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

// Typed against ToolName so this literal can't silently drift from the
// registry — removing "find_customer" from TOOL_REGISTRY breaks this line.
const TOOL_NAME: ToolName = "find_customer";

const inputSchema = {
  query: z
    .string()
    .min(1)
    .describe("Customer name, email, or company to search for"),
};

const outputSchema = {
  found: z.boolean(),
  customer: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      company: z.string(),
    })
    .nullable(),
};

/**
 * organisationId is bound at server-construction time (same pattern as
 * send-email.ts's createSendEmailTool) — a business's customer data must
 * never be reachable by an LLM call scoped to a different organisation.
 */
export function createFindCustomerTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description: "Look up a customer by name, email, or company.",
    inputSchema,
    outputSchema,
    handler: async ({ query }: { query: string }) => {
      const matches = await customerRepository.searchCustomers(
        organisationId,
        query,
      );
      const customer = matches[0] ?? null;
      return toolSuccess({ found: customer !== null, customer });
    },
  };
}

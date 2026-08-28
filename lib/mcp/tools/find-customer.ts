import { z } from "zod";

import { customers } from "@/lib/mcp/mock-data";
import { toolSuccess } from "@/lib/mcp/tool-result";

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

export const findCustomerTool = {
  name: "find_customer",
  description: "Find a customer by name, email, or company.",
  inputSchema,
  outputSchema,
  handler: async ({ query }: { query: string }) => {
    const needle = query.toLowerCase();
    const customer =
      customers.find(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.email.toLowerCase().includes(needle) ||
          c.company.toLowerCase().includes(needle),
      ) ?? null;

    return toolSuccess({ found: customer !== null, customer });
  },
};

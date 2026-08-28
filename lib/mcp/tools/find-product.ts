import { z } from "zod";

import { products } from "@/lib/mcp/mock-data";
import { toolSuccess } from "@/lib/mcp/tool-result";

const inputSchema = {
  query: z.string().min(1).describe("Product name or SKU to search for"),
};

const outputSchema = {
  found: z.boolean(),
  product: z
    .object({
      id: z.string(),
      sku: z.string(),
      name: z.string(),
      unitPrice: z.number(),
    })
    .nullable(),
};

export const findProductTool = {
  name: "find_product",
  description: "Find a product by name or SKU.",
  inputSchema,
  outputSchema,
  handler: async ({ query }: { query: string }) => {
    const needle = query.toLowerCase();
    const product =
      products.find(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.sku.toLowerCase().includes(needle),
      ) ?? null;

    return toolSuccess({ found: product !== null, product });
  },
};

import { z } from "zod";

import * as productRepository from "@/lib/products/product-repository";
import { toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "find_product";

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

export function createFindProductTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description: "Look up a product by name or SKU.",
    inputSchema,
    outputSchema,
    handler: async ({ query }: { query: string }) => {
      const matches = await productRepository.searchProducts(
        organisationId,
        query,
      );
      const product = matches[0] ?? null;
      return toolSuccess({
        found: product !== null,
        product: product
          ? {
              id: product.id,
              sku: product.sku,
              name: product.name,
              unitPrice: product.unitPrice,
            }
          : null,
      });
    },
  };
}

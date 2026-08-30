import { z } from "zod";

import * as productRepository from "@/lib/products/product-repository";
import { toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "check_inventory";

const inputSchema = {
  productId: z.string().min(1),
};

const outputSchema = {
  productId: z.string(),
  quantityAvailable: z.number(),
};

export function createCheckInventoryTool(organisationId: string) {
  return {
    name: TOOL_NAME,
    description:
      "Check how many units of a product are available, by product ID.",
    inputSchema,
    outputSchema,
    handler: async ({ productId }: { productId: string }) => {
      const product = await productRepository.findProductById(
        organisationId,
        productId,
      );
      return toolSuccess({
        productId,
        quantityAvailable: product?.stockQuantity ?? 0,
      });
    },
  };
}

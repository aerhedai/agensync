import { z } from "zod";

import { products } from "@/lib/mcp/mock-data";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";

const inputSchema = {
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
};

const outputSchema = {
  productId: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  currency: z.literal("GBP"),
};

export const calculateQuoteTool = {
  name: "calculate_quote",
  description:
    "Calculate a price quote for a quantity of a product, by product ID.",
  inputSchema,
  outputSchema,
  handler: async ({
    productId,
    quantity,
  }: {
    productId: string;
    quantity: number;
  }) => {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return toolError(`No product found with id "${productId}".`);
    }

    return toolSuccess({
      productId,
      quantity,
      unitPrice: product.unitPrice,
      total: Math.round(product.unitPrice * quantity * 100) / 100,
      currency: "GBP",
    });
  },
};

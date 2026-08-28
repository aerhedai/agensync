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

// Live testing (Phase 9) showed the model reliably calling find_product
// first but then passing its *name* ("Product A") here instead of the id
// find_product returned ("prod-1") — a common LLM tool-chaining slip, not a
// one-off. Falling back to a name/SKU match (same matching as find_product)
// makes the tool robust to that, rather than relying on prompting alone to
// prevent it.
export const calculateQuoteTool = {
  name: "calculate_quote",
  description:
    "Calculate a price quote for a quantity of a product. Accepts a product ID (preferred), or a name/SKU as a fallback.",
  inputSchema,
  outputSchema,
  handler: async ({
    productId,
    quantity,
  }: {
    productId: string;
    quantity: number;
  }) => {
    const needle = productId.toLowerCase();
    const product =
      products.find((p) => p.id === productId) ??
      products.find(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.sku.toLowerCase().includes(needle),
      );
    if (!product) {
      return toolError(`No product found matching "${productId}".`);
    }

    return toolSuccess({
      productId: product.id,
      quantity,
      unitPrice: product.unitPrice,
      total: Math.round(product.unitPrice * quantity * 100) / 100,
      currency: "GBP",
    });
  },
};

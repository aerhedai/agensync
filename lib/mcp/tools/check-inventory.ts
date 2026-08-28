import { z } from "zod";

import { inventory } from "@/lib/mcp/mock-data";
import { toolSuccess } from "@/lib/mcp/tool-result";

const inputSchema = {
  productId: z.string().min(1),
};

const outputSchema = {
  productId: z.string(),
  quantityAvailable: z.number(),
};

export const checkInventoryTool = {
  name: "check_inventory",
  description:
    "Check how many units of a product are available, by product ID.",
  inputSchema,
  outputSchema,
  handler: async ({ productId }: { productId: string }) => {
    const quantityAvailable = inventory[productId] ?? 0;
    return toolSuccess({ productId, quantityAvailable });
  },
};

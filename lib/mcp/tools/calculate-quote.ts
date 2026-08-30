import { z } from "zod";

import * as organisationRepository from "@/lib/organisations/organisation-repository";
import * as productRepository from "@/lib/products/product-repository";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "calculate_quote";

const inputSchema = {
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
};

const outputSchema = {
  productId: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
  currency: z.string(),
};

/**
 * organisationId is bound at server-construction time. The tool stays
 * self-contained regardless of caller (a future LOOP-mode agent might call
 * it directly, with no harness PipelineContext) — it looks up the
 * organisation's own currency itself rather than expecting a caller to
 * supply it.
 *
 * Live testing (Phase 9) showed the model reliably calling find_product
 * first but then passing its *name* ("Product A") here instead of the id
 * find_product returned ("prod-1") — a common LLM tool-chaining slip, not a
 * one-off. Falling back to a name/SKU match makes the tool robust to that,
 * rather than relying on prompting alone to prevent it.
 */
export function createCalculateQuoteTool(organisationId: string) {
  return {
    name: TOOL_NAME,
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
      const product =
        (await productRepository.findProductById(organisationId, productId)) ??
        (await productRepository.searchProducts(organisationId, productId))[0];
      if (!product) {
        return toolError(`No product found matching "${productId}".`);
      }

      const organisation =
        await organisationRepository.findOrganisationById(organisationId);

      return toolSuccess({
        productId: product.id,
        quantity,
        unitPrice: product.unitPrice,
        total: Math.round(product.unitPrice * quantity * 100) / 100,
        currency: organisation?.currency ?? "GBP",
      });
    },
  };
}

import { z } from "zod";

import { composeReply } from "@/lib/harness/compose-reply";
import {
  composeBaseInstructions,
  withBusinessGuidance,
} from "@/lib/harness/compose-instructions";
import { currencySymbol } from "@/lib/currency/currency-symbols";
import { extractFields } from "@/lib/harness/extract-fields";
import {
  callTool,
  extractEmailDeterministically,
} from "@/lib/harness/pipeline-helpers";
import { failPipeline } from "@/lib/harness/pipeline-failure";
import { proposeAction } from "@/lib/harness/propose-action";
import type { Pipeline } from "@/lib/harness/types";

const fieldsSchema = z.object({
  product: z.string().nullable(),
  quantity: z.number().nullable(),
  customerEmail: z.string().nullable(),
});

interface FoundProduct {
  id: string;
  name: string;
  unitPrice: number;
}

interface QuoteResult {
  total: number;
  unitPrice: number;
  currency: string;
}

/**
 * The Quote Agent's job is almost entirely deterministic: given a product
 * and quantity, the sequence is always find_customer -> find_product ->
 * check_inventory -> calculate_quote. There's no real decision happening
 * in that sequence — it was only ever a "decision" in LOOP mode because
 * the model had to re-derive it turn by turn, which is exactly where the
 * aborted-tool-call bugs came from. Here it's just code.
 */
export const runQuotePipeline: Pipeline = async (context) => {
  const fields = await extractFields(
    context,
    'Extract fields from the message as JSON: {"product": string or null, "quantity": number or null, "customerEmail": string or null}. Use null for anything not present in the message. Output ONLY the JSON object, no other text.',
    fieldsSchema,
  );

  if (!fields || !fields.product || !fields.quantity) {
    return failPipeline(
      context,
      "Could not extract a clear product and quantity from the request.",
    );
  }

  const email =
    context.senderEmail ??
    extractEmailDeterministically(context.input) ??
    fields.customerEmail;

  let customerName: string | null = null;
  if (email) {
    const customerResult = await callTool(context, "find_customer", {
      query: email,
    });
    if (!customerResult.isError && customerResult.structuredContent?.found) {
      customerName = (
        customerResult.structuredContent.customer as { name: string }
      ).name;
    }
  }

  const productResult = await callTool(context, "find_product", {
    query: fields.product,
  });
  if (productResult.isError || !productResult.structuredContent?.found) {
    return failPipeline(
      context,
      `Could not find a product matching "${fields.product}".`,
    );
  }
  const product = productResult.structuredContent.product as FoundProduct;

  await callTool(context, "check_inventory", { productId: product.id });

  const quoteResult = await callTool(context, "calculate_quote", {
    productId: product.id,
    quantity: fields.quantity,
  });
  if (quoteResult.isError || !quoteResult.structuredContent) {
    return failPipeline(
      context,
      "Could not calculate a quote for this product and quantity.",
    );
  }
  const quote = quoteResult.structuredContent as unknown as QuoteResult;

  if (!email) {
    return failPipeline(
      context,
      "No customer email address to send the quote to.",
    );
  }

  const symbol = currencySymbol(quote.currency);
  const body = await composeReply(
    context,
    withBusinessGuidance(
      `${composeBaseInstructions(context.organisation.name)} Write a short, professional email body quoting a customer a price, given the facts below. Do not include a subject line, just the body text.`,
      context.agent,
    ),
    [
      customerName
        ? `Customer: ${customerName}`
        : 'Customer name: unknown — do not invent or placeholder one, open with "Hello,"',
      `Product: ${product.name}`,
      `Quantity: ${fields.quantity}`,
      `Unit price: ${symbol}${quote.unitPrice}`,
      `Total: ${symbol}${quote.total}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  );

  return proposeAction(context, {
    toolName: context.agent.actionTool,
    args: {
      to: email,
      subject: `Quote for ${fields.quantity} x ${product.name}`,
      body,
    },
  });
};

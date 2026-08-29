import { z } from "zod";

import { composeReply } from "@/lib/harness/compose-reply";
import { COMPOSE_BASE_INSTRUCTIONS } from "@/lib/harness/compose-instructions";
import { extractFields } from "@/lib/harness/extract-fields";
import { extractEmailDeterministically } from "@/lib/harness/pipeline-helpers";
import { failPipeline } from "@/lib/harness/pipeline-failure";
import { proposeSendEmail } from "@/lib/harness/propose-send-email";
import type { Pipeline } from "@/lib/harness/types";

const fieldsSchema = z.object({
  customerEmail: z.string().nullable(),
  question: z.string().nullable(),
});

export const runGeneralPipeline: Pipeline = async (context) => {
  const fields = await extractFields(
    context,
    'Extract fields from the message as JSON: {"customerEmail": string or null, "question": a short summary of what they are asking, or null}. Output ONLY the JSON object, no other text.',
    fieldsSchema,
  );

  const email =
    extractEmailDeterministically(context.input) ??
    fields?.customerEmail ??
    null;
  if (!email) {
    return failPipeline(context, "No customer email address to reply to.");
  }

  const body = await composeReply(
    context,
    `${COMPOSE_BASE_INSTRUCTIONS} Answer the customer's question helpfully and directly. If you don't have enough information available to answer accurately, say so honestly and suggest they contact the team directly, rather than guessing. Do not include a subject line, just the body text.`,
    fields?.question ?? context.input,
  );

  return proposeSendEmail(context, {
    to: email,
    subject: "Re: your inquiry",
    body,
  });
};

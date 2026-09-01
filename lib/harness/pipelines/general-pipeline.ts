import { z } from "zod";

import { composeReply } from "@/lib/harness/compose-reply";
import {
  composeBaseInstructions,
  withBusinessGuidance,
} from "@/lib/harness/compose-instructions";
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
    context.senderEmail ??
    extractEmailDeterministically(context.input) ??
    fields?.customerEmail ??
    null;
  if (!email) {
    return failPipeline(context, "No customer email address to reply to.");
  }

  const body = await composeReply(
    context,
    withBusinessGuidance(
      `${composeBaseInstructions(context.organisation.name)} Acknowledge the customer's question. You have no access to specific business facts — hours, policies, pricing, stock, or anything else not given to you below — so never state a specific time, number, or policy. Say a member of the team will follow up with the exact details, rather than guessing one. Do not include a subject line, just the body text.`,
      context.agent,
    ),
    `What they're asking: ${fields?.question ?? context.input}`,
  );

  return proposeSendEmail(context, {
    to: email,
    subject: context.agent.replySubjectTemplate ?? "Re: your inquiry",
    body,
  });
};

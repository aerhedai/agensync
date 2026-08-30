import { z } from "zod";

import { composeReply } from "@/lib/harness/compose-reply";
import {
  composeBaseInstructions,
  withBusinessGuidance,
} from "@/lib/harness/compose-instructions";
import { extractFields } from "@/lib/harness/extract-fields";
import {
  callTool,
  extractEmailDeterministically,
} from "@/lib/harness/pipeline-helpers";
import { containsCompensationPromise } from "@/lib/harness/pipeline-guards";
import { failPipeline } from "@/lib/harness/pipeline-failure";
import { proposeSendEmail } from "@/lib/harness/propose-send-email";
import type { Pipeline } from "@/lib/harness/types";

const fieldsSchema = z.object({
  customerEmail: z.string().nullable(),
  complaintSummary: z.string().nullable(),
});

export const runComplaintsPipeline: Pipeline = async (context) => {
  const fields = await extractFields(
    context,
    'Extract fields from the message as JSON: {"customerEmail": string or null, "complaintSummary": a short one-sentence summary of what they are unhappy about, or null}. Output ONLY the JSON object, no other text.',
    fieldsSchema,
  );

  const email =
    extractEmailDeterministically(context.input) ??
    fields?.customerEmail ??
    null;
  if (!email) {
    return failPipeline(context, "No customer email address to reply to.");
  }

  let customerName: string | null = null;
  const customerResult = await callTool(context, "find_customer", {
    query: email,
  });
  if (!customerResult.isError && customerResult.structuredContent?.found) {
    customerName = (
      customerResult.structuredContent.customer as { name: string }
    ).name;
  }

  const body = await composeReply(
    context,
    withBusinessGuidance(
      `${composeBaseInstructions(context.organisation.name)} Acknowledge the customer's complaint politely and specifically — reference what they're actually unhappy about, don't reply generically. Never promise a refund, replacement, discount, or any other compensation, and don't attempt to resolve the substance of the complaint yourself — just say a member of the team will follow up. Do not include a subject line, just the body text.`,
      context.agent,
    ),
    [
      customerName
        ? `Customer: ${customerName}`
        : 'Customer name: unknown — do not invent or placeholder one, open with "Hello,"',
      `What they're unhappy about: ${fields?.complaintSummary ?? context.input}`,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
  );

  // Deterministic backstop — see pipeline-guards.ts. Prompt ordering alone
  // was proven insufficient by live testing: a strongly-worded business
  // instruction got the model to promise compensation despite the
  // hardcoded rule above being stated first.
  if (containsCompensationPromise(body)) {
    return failPipeline(
      context,
      "Composed reply appears to promise compensation (refund, replacement, discount, or similar) — refusing to propose sending it. This is a hardcoded safety rule that business instructions can't override.",
    );
  }

  return proposeSendEmail(context, {
    to: email,
    subject: context.agent.replySubjectTemplate ?? "Re: your recent experience",
    body,
  });
};

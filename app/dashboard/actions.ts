"use server";

import { redirect } from "next/navigation";

import { cleanEmailBody } from "@/lib/integrations/gmail/clean-email-body";
import {
  getGmailMessage,
  listUnreadInboxMessages,
  markGmailMessageRead,
} from "@/lib/integrations/gmail/client";
import * as integrationService from "@/lib/integrations/integration-service";
import { extractEmailDeterministically } from "@/lib/harness/pipeline-helpers";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import { dispatchInboundMessage } from "@/lib/routing/dispatch";

/**
 * On-demand inbox check (no background worker/polling infra per CLAUDE.md
 * #30 — this is a manual trigger the user clicks, not a cron job).
 * Organisation-scoped, not agent-scoped: each unread labelled email is
 * classified and routed to whichever active agent fits (see
 * lib/routing/dispatch.ts), not tied to any one agent's page.
 */
export async function checkInboxAction() {
  const organisation = await getCurrentOrganisation();

  let processed = 0;
  let skipped = 0;
  try {
    const integration = await integrationService.getDefaultGmailIntegration(
      organisation.id,
    );
    if (!integration) {
      throw new Error(
        "Gmail is not connected for this organisation. Connect it from Settings.",
      );
    }
    const accessToken = await integrationService.getValidGmailAccessToken(
      organisation.id,
      integration.id,
    );
    const unread = await listUnreadInboxMessages(accessToken);

    for (const summary of unread) {
      const message = await getGmailMessage(accessToken, summary.id);
      // Subject + body only — never the sender's address. Classification
      // (both the keyword fast path and the LLM classifier) matches
      // directly over this text, and a customer's own email address can
      // accidentally contain a keyword substring (e.g. "...price@..."
      // silently routing everything to the Quote Agent, found live). The
      // sender is passed separately below, used only for identification.
      const input = `New email received.\nSubject: ${message.subject}\n\n${cleanEmailBody(message.body)}`;
      // Gmail's "From" header is "Display Name <address@example.com>", not
      // a bare address — pull just the address out before using it for
      // identification (find_customer / reply-to).
      const senderEmail = extractEmailDeterministically(message.from);
      const result = await dispatchInboundMessage(
        organisation.id,
        "EMAIL",
        input,
        undefined,
        senderEmail,
        integration.id,
      );

      if (result.matched) {
        await markGmailMessageRead(accessToken, summary.id);
        processed += 1;
      } else if (result.reason === "no_workflow") {
        // Not a per-email skip — nothing is configured to handle email at
        // all, so stop immediately rather than repeating the same failure
        // for every remaining message.
        throw new Error(
          "No active email workflow is configured for this organisation.",
        );
      } else {
        // Left unprocessed on purpose: no agent's scope clearly fit, so
        // nothing runs and nothing gets marked read — it stays visible in
        // Gmail for a human to notice, rather than being silently dropped
        // or guessed at.
        skipped += 1;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check inbox.";
    redirect(`/dashboard?inbox_error=${encodeURIComponent(message)}`);
  }

  redirect(`/dashboard?inbox_processed=${processed}&inbox_skipped=${skipped}`);
}

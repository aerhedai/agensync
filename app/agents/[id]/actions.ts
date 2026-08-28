"use server";

import { notFound, redirect } from "next/navigation";

import * as agentService from "@/lib/agents/agent-service";
import {
  getGmailMessage,
  listUnreadInboxMessages,
  markGmailMessageRead,
} from "@/lib/integrations/gmail/client";
import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import { runAgent } from "@/lib/runtime/agent-runtime";

export type RunAgentFormState = {
  error?: string;
};

export async function runAgentAction(
  agentId: string,
  _prevState: RunAgentFormState,
  formData: FormData,
): Promise<RunAgentFormState> {
  const input = formData.get("input");
  if (typeof input !== "string" || input.trim().length === 0) {
    return { error: "Enter some input for the agent to process." };
  }

  const organisation = await getCurrentOrganisation();
  const agent = await agentService.getAgent(organisation.id, agentId);
  if (!agent) {
    notFound();
  }

  const result = await runAgent(agent, input.trim());
  redirect(`/runs/${result.runId}`);
}

/**
 * On-demand inbox check (no background worker/polling infra per CLAUDE.md
 * #30 — this is a manual trigger the user clicks, not a cron job). Each
 * unread email becomes one agent run, exactly like a manually-typed input,
 * then gets marked read so it isn't reprocessed on the next check.
 */
export async function checkInboxAction(agentId: string) {
  const organisation = await getCurrentOrganisation();
  const agent = await agentService.getAgent(organisation.id, agentId);
  if (!agent) {
    notFound();
  }

  let processed = 0;
  try {
    const accessToken = await integrationService.getValidGmailAccessToken(
      organisation.id,
    );
    const unread = await listUnreadInboxMessages(accessToken);

    for (const summary of unread) {
      const message = await getGmailMessage(accessToken, summary.id);
      const input = `New email received.\nFrom: ${message.from}\nSubject: ${message.subject}\n\n${message.body}`;
      await runAgent(agent, input);
      await markGmailMessageRead(accessToken, summary.id);
      processed += 1;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check inbox.";
    redirect(`/agents/${agentId}?inbox_error=${encodeURIComponent(message)}`);
  }

  redirect(`/agents/${agentId}?inbox_processed=${processed}`);
}

import { z } from "zod";

import { sendGmailMessage } from "@/lib/integrations/gmail/client";
import { getValidGmailAccessToken } from "@/lib/integrations/integration-service";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";

const inputSchema = {
  to: z.email(),
  subject: z.string().min(1),
  body: z.string().min(1),
};

const outputSchema = {
  sent: z.boolean(),
};

/**
 * organisationId (and actionIntegrationId) are bound at server-construction
 * time (see lib/mcp/server.ts), never taken as a tool argument — the LLM
 * must never be able to supply which organisation's or which account's
 * credentials to use (CLAUDE.md #22), so this closes over the
 * caller-supplied values instead. actionIntegrationId null/undefined means
 * "the organisation's default Gmail account" — see
 * getValidGmailAccessToken's own doc comment.
 */
export function createSendEmailTool(
  organisationId: string,
  actionIntegrationId?: string | null,
) {
  return {
    name: "send_email",
    description:
      "Send an email reply to a customer, e.g. with a finished quote.",
    inputSchema,
    outputSchema,
    handler: async ({
      to,
      subject,
      body,
    }: {
      to: string;
      subject: string;
      body: string;
    }) => {
      try {
        const accessToken = await getValidGmailAccessToken(
          organisationId,
          actionIntegrationId,
        );
        await sendGmailMessage(accessToken, { to, subject, body });
        return toolSuccess({ sent: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send email.";
        return toolError(message);
      }
    },
  };
}

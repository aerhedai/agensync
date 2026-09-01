import { z } from "zod";

import { getSlackBotToken } from "@/lib/integrations/integration-service";
import { postSlackMessage } from "@/lib/integrations/slack/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";

const inputSchema = {
  channel: z.string().min(1),
  message: z.string().min(1),
};

const outputSchema = {
  sent: z.boolean(),
};

/**
 * organisationId (and actionIntegrationId) are bound at server-construction
 * time (see lib/mcp/server.ts), never taken as a tool argument — the LLM
 * must never be able to supply which organisation's or which workspace's
 * credentials to use (CLAUDE.md #22), so this closes over the
 * caller-supplied values instead. actionIntegrationId null/undefined means
 * "the organisation's default Slack workspace" — see getSlackBotToken's own
 * doc comment.
 */
export function createNotifySlackTool(
  organisationId: string,
  actionIntegrationId?: string | null,
) {
  return {
    name: "notify_slack",
    description:
      "Post an internal notification to a Slack channel, e.g. to alert a human that something needs attention.",
    inputSchema,
    outputSchema,
    handler: async ({
      channel,
      message,
    }: {
      channel: string;
      message: string;
    }) => {
      try {
        const botToken = await getSlackBotToken(
          organisationId,
          actionIntegrationId,
        );
        await postSlackMessage(botToken, { channel, text: message });
        return toolSuccess({ sent: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to send Slack notification.";
        return toolError(errorMessage);
      }
    },
  };
}

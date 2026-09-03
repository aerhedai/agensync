import { z } from "zod";

import { getValidTeamsAccessToken } from "@/lib/integrations/integration-service";
import { sendTeamsChannelMessage } from "@/lib/integrations/teams/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";

const inputSchema = {
  teamId: z.string().min(1),
  channelId: z.string().min(1),
  message: z.string().min(1),
};

const outputSchema = {
  sent: z.boolean(),
};

/**
 * organisationId (and actionIntegrationId) are bound at server-construction
 * time (see lib/mcp/server.ts), never taken as a tool argument (CLAUDE.md
 * #22) — same pattern as notify_slack. actionIntegrationId null/undefined
 * means "the organisation's default connected Teams account".
 *
 * Unlike notify_slack's bot token, Microsoft Graph has no plain-OAuth
 * equivalent to "post as a bot" for Teams channel messages — delegated
 * ChannelMessage.Send sends as whichever person authorized this
 * connection, not as "Aperator". A real bot identity needs Azure Bot
 * Service, a separate, materially bigger piece of infrastructure,
 * deliberately not built here — the tool description says so explicitly
 * so whoever configures an agent with this tool sees it, not just this
 * comment.
 */
export function createNotifyTeamsTool(
  organisationId: string,
  actionIntegrationId?: string | null,
) {
  return {
    name: "notify_teams",
    description:
      "Post an internal notification to a Microsoft Teams channel, e.g. to alert a human that something needs attention. Requires the channel's teamId and channelId (found via Teams' \"Get link to channel\"). Posts as whichever person connected this account, not as a separate bot.",
    inputSchema,
    outputSchema,
    handler: async ({
      teamId,
      channelId,
      message,
    }: {
      teamId: string;
      channelId: string;
      message: string;
    }) => {
      try {
        const accessToken = await getValidTeamsAccessToken(
          organisationId,
          actionIntegrationId,
        );
        await sendTeamsChannelMessage(accessToken, {
          teamId,
          channelId,
          text: message,
        });
        return toolSuccess({ sent: true });
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to send Teams notification.";
        return toolError(errorMessage);
      }
    },
  };
}

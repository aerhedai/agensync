import { z } from "zod";

import {
  getSlackBotToken,
  getValidTeamsAccessToken,
} from "@/lib/integrations/integration-service";
import { postSlackMessage } from "@/lib/integrations/slack/client";
import { sendTeamsChannelMessage } from "@/lib/integrations/teams/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";
import type { ToolName } from "@/lib/mcp/tool-registry";

const TOOL_NAME: ToolName = "notify_channel";

const inputSchema = {
  platform: z
    .enum(["slack", "teams"])
    .describe("Which chat platform to post to"),
  channel: z
    .string()
    .min(1)
    .describe(
      'Slack: the channel name or id, e.g. "#ops". Teams: the channelId.',
    ),
  teamId: z
    .string()
    .optional()
    .describe(
      'Teams only: the teamId (both ids come from Teams\' "Get link to channel"). Ignored for Slack.',
    ),
  message: z.string().min(1).describe("The message text to post"),
};

const outputSchema = {
  sent: z.boolean(),
  platform: z.string(),
};

/**
 * One tool for "tell a human something in a chat channel", across both
 * chat providers — replaced the separate notify_slack / notify_teams
 * tools. A business thinks in terms of notifying its team, not in terms
 * of which vendor backs the channel, and the registry should reflect that
 * (CLAUDE.md §4.5).
 *
 * Deliberately kept separate from send_email despite both being "send a
 * message": an internal chat notification and an outbound customer email
 * are different *consequence* classes, and the policy engine gates them
 * differently (send_email requires approval, this does not). Collapsing
 * them into one tool would erase the distinction the approval gate
 * depends on — see lib/policies/policy-engine.ts.
 *
 * Both providers' pinned-account ids are bound at server-construction
 * time (lib/mcp/server.ts), never taken as tool arguments — the model
 * must never choose whose credentials to use. Each is undefined unless
 * the agent's pinned account is actually of that provider, in which case
 * that provider falls back to the organisation's default account.
 *
 * Teams caveat, surfaced in the description rather than hidden here:
 * Microsoft Graph has no plain-OAuth "post as a bot" equivalent, so a
 * Teams message posts as whichever person authorized the connection.
 */
export function createNotifyChannelTool(
  organisationId: string,
  slackIntegrationId?: string | null,
  teamsIntegrationId?: string | null,
) {
  return {
    name: TOOL_NAME,
    description:
      'Post an internal notification to a Slack or Microsoft Teams channel, e.g. to alert a human that something needs attention. For Teams, pass both teamId and channel (its channelId), found via Teams\' "Get link to channel" — a Teams message posts as whichever person connected the account, not as a separate bot.',
    inputSchema,
    outputSchema,
    handler: async ({
      platform,
      channel,
      teamId,
      message,
    }: {
      platform: "slack" | "teams";
      channel: string;
      teamId?: string;
      message: string;
    }) => {
      try {
        if (platform === "slack") {
          const botToken = await getSlackBotToken(
            organisationId,
            slackIntegrationId,
          );
          await postSlackMessage(botToken, { channel, text: message });
          return toolSuccess({ sent: true, platform });
        }

        // Enforced here rather than in the schema: MCP input schemas are a
        // flat object per tool, so "required only when platform is teams"
        // can't be expressed as a Zod refinement the model sees. A clear
        // tool-level error it can correct on the next turn is the next
        // best thing.
        if (!teamId) {
          return toolError(
            "teamId is required when platform is teams — pass both teamId and channel (the channelId).",
          );
        }
        const accessToken = await getValidTeamsAccessToken(
          organisationId,
          teamsIntegrationId,
        );
        await sendTeamsChannelMessage(accessToken, {
          teamId,
          channelId: channel,
          text: message,
        });
        return toolSuccess({ sent: true, platform });
      } catch (error) {
        return toolError(
          error instanceof Error
            ? error.message
            : `Failed to send ${platform} notification.`,
        );
      }
    },
  };
}

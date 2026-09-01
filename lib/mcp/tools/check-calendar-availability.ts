import { z } from "zod";

import { getValidOutlookCalendarAccessToken } from "@/lib/integrations/integration-service";
import { findMeetingTimes } from "@/lib/integrations/outlook-calendar/client";
import { toolError, toolSuccess } from "@/lib/mcp/tool-result";

const inputSchema = {
  attendees: z.array(z.email()).min(1),
  durationMinutes: z.number().int().positive(),
  rangeStart: z.iso.datetime(),
  rangeEnd: z.iso.datetime(),
};

const outputSchema = {
  found: z.boolean(),
  suggestions: z.array(
    z.object({
      start: z.string(),
      end: z.string(),
      confidence: z.number(),
    }),
  ),
};

/**
 * Read-only (same readOnlyHint annotation as find_customer/check_inventory
 * in lib/mcp/server.ts) — organisationId/actionIntegrationId bound at
 * server-construction time, never a tool argument (CLAUDE.md #22).
 */
export function createCheckCalendarAvailabilityTool(
  organisationId: string,
  actionIntegrationId?: string | null,
) {
  return {
    name: "check_calendar_availability",
    description:
      "Find suggested meeting times for a set of attendees within a date range, using the connected Outlook Calendar's free/busy data.",
    inputSchema,
    outputSchema,
    handler: async ({
      attendees,
      durationMinutes,
      rangeStart,
      rangeEnd,
    }: {
      attendees: string[];
      durationMinutes: number;
      rangeStart: string;
      rangeEnd: string;
    }) => {
      try {
        const accessToken = await getValidOutlookCalendarAccessToken(
          organisationId,
          actionIntegrationId,
        );
        const suggestions = await findMeetingTimes(accessToken, {
          attendees,
          durationMinutes,
          rangeStart,
          rangeEnd,
        });
        return toolSuccess({ found: suggestions.length > 0, suggestions });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to check calendar availability.";
        return toolError(message);
      }
    },
  };
}

import { gmailOAuthAdapter } from "@/lib/integrations/gmail/oauth";
import type { OAuthAdapter } from "@/lib/integrations/oauth-adapter";
import { outlookOAuthAdapter } from "@/lib/integrations/outlook/oauth";
import { outlookCalendarOAuthAdapter } from "@/lib/integrations/outlook-calendar/oauth";
import { slackOAuthAdapter } from "@/lib/integrations/slack/oauth";
import { teamsOAuthAdapter } from "@/lib/integrations/teams/oauth";

// The one place a new OAuth provider gets wired in — the generic
// connect/callback routes (app/api/integrations/[provider]/) look up the
// adapter here rather than branching on provider themselves.
const OAUTH_ADAPTERS: Record<string, OAuthAdapter> = {
  gmail: gmailOAuthAdapter,
  slack: slackOAuthAdapter,
  outlook: outlookOAuthAdapter,
  teams: teamsOAuthAdapter,
  "outlook-calendar": outlookCalendarOAuthAdapter,
};

export function getOAuthAdapter(provider: string): OAuthAdapter | null {
  return OAUTH_ADAPTERS[provider] ?? null;
}

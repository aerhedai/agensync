import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getGmailProfile } from "@/lib/integrations/gmail/client";
import { exchangeCodeForTokens } from "@/lib/integrations/gmail/oauth";
import * as integrationRepository from "@/lib/integrations/integration-repository";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?gmail_error=${encodeURIComponent(error)}`, url.origin),
    );
  }
  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(
      new URL("/settings?gmail_error=invalid_state", url.origin),
    );
  }

  const tokens = await exchangeCodeForTokens(code);
  const profile = await getGmailProfile(tokens.accessToken);
  const organisation = await getCurrentOrganisation();

  await integrationRepository.upsertGmailIntegration(
    organisation.id,
    profile.emailAddress,
    tokens,
  );

  return NextResponse.redirect(
    new URL("/settings?gmail_connected=1", url.origin),
  );
}

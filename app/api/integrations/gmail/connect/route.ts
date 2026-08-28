import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildGoogleAuthUrl } from "@/lib/integrations/gmail/oauth";

const STATE_COOKIE = "gmail_oauth_state";

// No session system exists yet (no auth phase built) — this state value is
// pure CSRF protection for the OAuth round trip, not user identity.
export async function GET() {
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildGoogleAuthUrl(state));
}

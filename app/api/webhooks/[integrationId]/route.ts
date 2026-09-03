import { NextResponse } from "next/server";
import { z } from "zod";

import { AIProviderNotConfiguredError } from "@/lib/ai/organisation-ai-provider";
import * as integrationService from "@/lib/integrations/integration-service";
import { dispatchInboundMessage } from "@/lib/routing/dispatch";

// CLAUDE.md #19 — never trust a webhook payload without validation. The
// caller (whatever external system is configured to POST here) controls
// this shape; the email-shaped one is documented in the "Add webhook
// account" confirmation UI, not inferred or guessed at.
const emailShapedPayloadSchema = z.object({
  body: z.string().min(1),
  subject: z.string().optional(),
  senderEmail: z.email().optional(),
});

// Anything else — a structured signal from an external system (e.g. a
// Power Automate flow posting {jobId, status, ...} when a tracked item
// changes) that a HARNESS pipeline parses for itself. Deliberately
// shape-agnostic here: this route has no way to know, and shouldn't need
// to know, what fields matter to a given business's own pipeline —
// keeping this generic is what lets any business wire up their own
// signal shape without a code change here.
const structuredPayloadSchema = z.record(z.string(), z.unknown());

// Tried in this order — a payload with a valid `body` string keeps the
// exact existing email-shaped behavior; anything else falls through to
// the generic structured record.
const webhookPayloadSchema = z.union([
  emailShapedPayloadSchema,
  structuredPayloadSchema,
]);

/**
 * The one inbound entry point for the webhook trigger — no session, no
 * Clerk auth, reachable by anything on the internet that knows the URL.
 * The bearer secret (verifyWebhookSecret, constant-time compared) is the
 * entire authentication boundary, same trust model as Stripe/GitHub-style
 * webhook secrets. integrationId in the URL identifies which business
 * this belongs to; the org is only ever resolved *after* the secret
 * checks out, never trusted from the URL alone.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ integrationId: string }> },
) {
  const { integrationId } = await params;

  const authHeader = request.headers.get("authorization") ?? "";
  const [scheme, secret] = authHeader.split(" ");
  if (scheme !== "Bearer" || !secret) {
    return NextResponse.json(
      { error: "Missing bearer secret." },
      { status: 401 },
    );
  }

  const verified = await integrationService.verifyWebhookSecret(
    integrationId,
    secret,
  );
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid webhook credentials." },
      { status: 401 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = webhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const isEmailShaped = typeof parsed.data.body === "string";

  const input = isEmailShaped
    ? (() => {
        const { body, subject } = parsed.data as z.infer<
          typeof emailShapedPayloadSchema
        >;
        return subject ? `Subject: ${subject}\n\n${body}` : body;
      })()
    : JSON.stringify(parsed.data);
  const senderEmail = isEmailShaped
    ? ((parsed.data as z.infer<typeof emailShapedPayloadSchema>).senderEmail ??
      null)
    : null;

  let result;
  try {
    result = await dispatchInboundMessage(
      verified.organisationId,
      "WEBHOOK",
      input,
      undefined,
      senderEmail,
      integrationId,
    );
  } catch (error) {
    if (error instanceof AIProviderNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  if (!result.matched) {
    return NextResponse.json({ matched: false, reason: result.reason });
  }
  return NextResponse.json({
    matched: true,
    agentName: result.agentName,
    status: result.run.status,
  });
}

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST } from "@/app/api/webhooks/[integrationId]/route";
import { prisma } from "@/lib/db/prisma";
import * as integrationService from "@/lib/integrations/integration-service";

// Only the auth/validation paths and the "no active workflow" branch are
// exercised through the real route here — a full match-and-run round trip
// needs a real AI call (classification/extraction), which is what
// dispatch.test.ts already proves at the service level with a scripted
// provider. The route itself has nothing interesting left to prove past
// "did it call dispatchInboundMessage with the right arguments," which
// this does cover (via the no_workflow response, reached without ever
// calling the AI provider).
function post(
  integrationId: string,
  headers: Record<string, string>,
  body: unknown,
) {
  return POST(
    new Request(`http://localhost/api/webhooks/${integrationId}`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ integrationId }) },
  );
}

describe("webhook inbound endpoint", () => {
  const organisationId = "test-org-webhook-endpoint";
  let integrationId: string;
  let secret: string;

  beforeAll(async () => {
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Webhook Endpoint Test Org",
      },
    });
    const created = await integrationService.connectWebhookAccount(
      organisationId,
      "Test webhook",
    );
    integrationId = created.integration.id;
    secret = created.secret;
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { organisationId } });
    await prisma.customEntityRecord.deleteMany({
      where: { organisationId: organisationId },
    });
    await prisma.customEntityType.deleteMany({
      where: { organisationId: organisationId },
    });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("rejects a request with no Authorization header", async () => {
    const response = await post(integrationId, {}, { body: "hello" });
    expect(response.status).toBe(401);
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await post(
      integrationId,
      { authorization: "Bearer wrong-secret" },
      { body: "hello" },
    );
    expect(response.status).toBe(401);
  });

  it("rejects an unknown integration id even with a well-formed header", async () => {
    const response = await post(
      "nonexistent-id",
      { authorization: "Bearer anything" },
      { body: "hello" },
    );
    expect(response.status).toBe(401);
  });

  it("rejects invalid JSON", async () => {
    const response = await post(
      integrationId,
      { authorization: `Bearer ${secret}` },
      "{not json",
    );
    expect(response.status).toBe(400);
  });

  it("accepts a valid email-shaped payload and reports no_workflow when this org has none configured", async () => {
    const response = await post(
      integrationId,
      { authorization: `Bearer ${secret}` },
      { body: "hello from the form" },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ matched: false, reason: "no_workflow" });
  });

  it("accepts a structured, non-email-shaped payload too — a signal a business's own pipeline parses for itself", async () => {
    const response = await post(
      integrationId,
      { authorization: `Bearer ${secret}` },
      { jobId: "1042", status: "Approved", taskName: "Quote request" },
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ matched: false, reason: "no_workflow" });
  });

  it("rejects valid JSON that isn't an object — a bare string or array", async () => {
    const response = await post(
      integrationId,
      { authorization: `Bearer ${secret}` },
      '"just a JSON string, not an object"',
    );
    expect(response.status).toBe(400);
  });
});

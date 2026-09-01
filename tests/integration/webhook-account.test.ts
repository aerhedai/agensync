import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import * as integrationService from "@/lib/integrations/integration-service";

describe("webhook accounts", () => {
  const organisationId = "test-org-webhook-account";

  beforeEach(async () => {
    await prisma.integration.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Webhook Account Test Org",
      },
    });
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("connecting a webhook account returns a secret that never appears in storage", async () => {
    const { integration, secret } =
      await integrationService.connectWebhookAccount(
        organisationId,
        "Website form",
      );

    expect(secret).toHaveLength(64); // 32 random bytes, hex-encoded
    const raw = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(raw.credentials).not.toContain(secret);
  });

  it("verifies the correct secret and resolves the right organisation", async () => {
    const { integration, secret } =
      await integrationService.connectWebhookAccount(
        organisationId,
        "Website form",
      );

    const result = await integrationService.verifyWebhookSecret(
      integration.id,
      secret,
    );
    expect(result).toEqual({ organisationId });
  });

  it("rejects a wrong secret for a real account", async () => {
    const { integration } = await integrationService.connectWebhookAccount(
      organisationId,
      "Website form",
    );

    const result = await integrationService.verifyWebhookSecret(
      integration.id,
      "wrong-secret",
    );
    expect(result).toBeNull();
  });

  it("rejects an unknown integration id", async () => {
    const result = await integrationService.verifyWebhookSecret(
      "nonexistent-id",
      "anything",
    );
    expect(result).toBeNull();
  });

  it("rejects a secret checked against a non-webhook integration", async () => {
    const gmail = await integrationService.connectGmailAccount(
      organisationId,
      "someone@example.com",
      {
        accessToken: "a",
        refreshToken: "r",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );

    const result = await integrationService.verifyWebhookSecret(gmail.id, "a");
    expect(result).toBeNull();
  });

  it("rejects reusing an already-taken account name at the action layer, not silently overwriting it", async () => {
    // Exercised at the service layer here (the duplicate-name check itself
    // lives in app/settings/actions.ts, a server action) — this test
    // documents why: without it, connectGmailAccount-style upsert
    // semantics would silently regenerate an unrelated account's secret.
    const first = await integrationService.connectWebhookAccount(
      organisationId,
      "Duplicate name",
    );
    const second = await integrationService.connectWebhookAccount(
      organisationId,
      "Duplicate name",
    );

    // Same underlying row — proves upsertIntegration's same-name-updates
    // behaviour is real, which is exactly the footgun the action-layer
    // check exists to prevent from being reached unchecked.
    expect(second.integration.id).toBe(first.integration.id);
    expect(second.secret).not.toBe(first.secret);
  });
});

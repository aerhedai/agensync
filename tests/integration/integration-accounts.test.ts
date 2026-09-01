import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import * as integrationService from "@/lib/integrations/integration-service";

describe("multi-account integrations", () => {
  const organisationId = "test-org-integration-accounts";

  beforeEach(async () => {
    await prisma.integration.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Integration Accounts Test Org",
      },
    });
  });

  afterAll(async () => {
    await prisma.integration.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("connecting two different Gmail addresses creates two separate accounts", async () => {
    await integrationService.connectGmailAccount(
      organisationId,
      "sales@acme.test",
      {
        accessToken: "access-1",
        refreshToken: "refresh-1",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
    await integrationService.connectGmailAccount(
      organisationId,
      "support@acme.test",
      {
        accessToken: "access-2",
        refreshToken: "refresh-2",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );

    const accounts = await integrationService.listIntegrationsByProvider(
      organisationId,
      "gmail",
    );
    expect(accounts.map((a) => a.name).sort()).toEqual([
      "sales@acme.test",
      "support@acme.test",
    ]);
  });

  it("reconnecting the same address updates that account rather than duplicating it", async () => {
    await integrationService.connectGmailAccount(
      organisationId,
      "sales@acme.test",
      {
        accessToken: "access-old",
        refreshToken: "refresh-old",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
    await integrationService.connectGmailAccount(
      organisationId,
      "sales@acme.test",
      {
        accessToken: "access-new",
        refreshToken: "refresh-new",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );

    const accounts = await integrationService.listIntegrationsByProvider(
      organisationId,
      "gmail",
    );
    expect(accounts).toHaveLength(1);

    const token =
      await integrationService.getValidGmailAccessToken(organisationId);
    expect(token).toBe("access-new");
  });

  it("getValidGmailAccessToken uses the earliest-connected account as the default", async () => {
    await integrationService.connectGmailAccount(
      organisationId,
      "first@acme.test",
      {
        accessToken: "access-first",
        refreshToken: "refresh-first",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
    await integrationService.connectGmailAccount(
      organisationId,
      "second@acme.test",
      {
        accessToken: "access-second",
        refreshToken: "refresh-second",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );

    const token =
      await integrationService.getValidGmailAccessToken(organisationId);
    expect(token).toBe("access-first");
  });

  it("disconnecting one account leaves the others untouched", async () => {
    const first = await integrationService.connectGmailAccount(
      organisationId,
      "keep@acme.test",
      {
        accessToken: "a",
        refreshToken: "r",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
    await integrationService.connectGmailAccount(
      organisationId,
      "remove@acme.test",
      {
        accessToken: "a2",
        refreshToken: "r2",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );

    const toRemove = (
      await integrationService.listIntegrationsByProvider(
        organisationId,
        "gmail",
      )
    ).find((a) => a.name === "remove@acme.test")!;
    await integrationService.disconnectIntegration(organisationId, toRemove.id);

    const remaining = await integrationService.listIntegrationsByProvider(
      organisationId,
      "gmail",
    );
    expect(remaining.map((a) => a.id)).toEqual([first.id]);
  });

  it("credentials round-trip through encryption correctly — never stored as plaintext", async () => {
    await integrationService.connectGmailAccount(
      organisationId,
      "secret@acme.test",
      {
        accessToken: "super-secret-access-token",
        refreshToken: "super-secret-refresh-token",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );

    const raw = await prisma.integration.findFirstOrThrow({
      where: { organisationId, provider: "gmail" },
    });
    expect(raw.credentials).not.toContain("super-secret-access-token");
    expect(raw.credentials).toMatch(/^v1:/);

    const token =
      await integrationService.getValidGmailAccessToken(organisationId);
    expect(token).toBe("super-secret-access-token");
  });

  it("throws a clear error when no Gmail account is connected", async () => {
    await expect(
      integrationService.getValidGmailAccessToken(organisationId),
    ).rejects.toThrow(/gmail is not connected/i);
  });

  it("getValidGmailAccessToken can be pinned to a specific account, not just the default", async () => {
    await integrationService.connectGmailAccount(
      organisationId,
      "first@acme.test",
      {
        accessToken: "access-first",
        refreshToken: "refresh-first",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );
    const second = await integrationService.connectGmailAccount(
      organisationId,
      "second@acme.test",
      {
        accessToken: "access-second",
        refreshToken: "refresh-second",
        expiresAt: new Date(Date.now() + 3600_000),
      },
    );

    // The default (no id given) is still the earliest-connected account —
    // pinning to the second account's id must override that, proving an
    // agent's actionIntegrationId actually changes which credentials get
    // used rather than being silently ignored.
    const defaultToken =
      await integrationService.getValidGmailAccessToken(organisationId);
    const pinnedToken = await integrationService.getValidGmailAccessToken(
      organisationId,
      second.id,
    );
    expect(defaultToken).toBe("access-first");
    expect(pinnedToken).toBe("access-second");
  });

  it("getValidGmailAccessToken rejects a pinned id that isn't a Gmail account", async () => {
    const { integration: webhookAccount } =
      await integrationService.connectWebhookAccount(
        organisationId,
        "Not Gmail",
      );

    await expect(
      integrationService.getValidGmailAccessToken(
        organisationId,
        webhookAccount.id,
      ),
    ).rejects.toThrow(/not a gmail account/i);
  });

  function connectSlackWorkspace(teamId: string, teamName: string) {
    return integrationService.connectOAuthAccount(organisationId, "slack", {
      accountName: teamName,
      config: { teamId, teamName },
      credentials: { botToken: `xoxb-${teamId}`, botUserId: `U-${teamId}` },
      expiresAt: null,
    });
  }

  it("connecting two different Slack workspaces creates two separate accounts", async () => {
    await connectSlackWorkspace("T1", "First Workspace");
    await connectSlackWorkspace("T2", "Second Workspace");

    const accounts = await integrationService.listIntegrationsByProvider(
      organisationId,
      "slack",
    );
    expect(accounts.map((a) => a.name).sort()).toEqual([
      "First Workspace",
      "Second Workspace",
    ]);
  });

  it("reconnecting the same Slack workspace updates that account rather than duplicating it", async () => {
    await connectSlackWorkspace("T1", "Acme Workspace");
    await connectSlackWorkspace("T1", "Acme Workspace");

    const accounts = await integrationService.listIntegrationsByProvider(
      organisationId,
      "slack",
    );
    expect(accounts).toHaveLength(1);
  });

  it("getSlackBotToken can be pinned to a specific workspace, not just the default", async () => {
    await connectSlackWorkspace("T1", "First Workspace");
    const second = await connectSlackWorkspace("T2", "Second Workspace");

    const defaultToken =
      await integrationService.getSlackBotToken(organisationId);
    const pinnedToken = await integrationService.getSlackBotToken(
      organisationId,
      second.id,
    );
    expect(defaultToken).toBe("xoxb-T1");
    expect(pinnedToken).toBe("xoxb-T2");
  });

  it("getSlackBotToken rejects a pinned id that isn't a Slack account", async () => {
    const { integration: webhookAccount } =
      await integrationService.connectWebhookAccount(
        organisationId,
        "Not Slack",
      );

    await expect(
      integrationService.getSlackBotToken(organisationId, webhookAccount.id),
    ).rejects.toThrow(/not a slack account/i);
  });

  it("throws a clear error when no Slack workspace is connected", async () => {
    await expect(
      integrationService.getSlackBotToken(organisationId),
    ).rejects.toThrow(/slack is not connected/i);
  });

  it("Slack credentials round-trip through encryption correctly — never stored as plaintext", async () => {
    await connectSlackWorkspace("T1", "Secret Workspace");

    const raw = await prisma.integration.findFirstOrThrow({
      where: { organisationId, provider: "slack" },
    });
    expect(raw.credentials).not.toContain("xoxb-T1");
    expect(raw.credentials).toMatch(/^v1:/);

    const token = await integrationService.getSlackBotToken(organisationId);
    expect(token).toBe("xoxb-T1");
  });
});

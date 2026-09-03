import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { OllamaProvider } from "@/lib/ai/providers/ollama-provider";
import {
  AIProviderNotConfiguredError,
  disconnectAIProvider,
  getAIProvider,
  getOrganisationAIConnection,
  setOllamaProvider,
} from "@/lib/ai/organisation-ai-provider";
import { prisma } from "@/lib/db/prisma";

// Every organisation used to share one operator-configured Ollama instance
// via a global env var — any business that signed up, including a
// stranger, had their agent runs sent straight to it. These tests lock in
// the property that closes that: an organisation must explicitly connect
// its own provider, and one organisation's connection is never reachable
// from another's.
describe("organisation-scoped AI provider", () => {
  const organisationId = "test-org-ai-provider";
  const otherOrganisationId = "test-org-ai-provider-other";

  beforeEach(async () => {
    for (const id of [organisationId, otherOrganisationId]) {
      await prisma.integration.deleteMany({ where: { organisationId: id } });
      await prisma.organisation.deleteMany({ where: { id } });
      await prisma.organisation.create({
        data: { id, clerkOrgId: id, name: id },
      });
    }
  });

  afterAll(async () => {
    for (const id of [organisationId, otherOrganisationId]) {
      await prisma.integration.deleteMany({ where: { organisationId: id } });
      await prisma.organisation.deleteMany({ where: { id } });
    }
    await prisma.$disconnect();
  });

  it("throws AIProviderNotConfiguredError for an organisation with nothing connected", async () => {
    await expect(getAIProvider(organisationId)).rejects.toBeInstanceOf(
      AIProviderNotConfiguredError,
    );
  });

  it("returns a real OllamaProvider once connected, and getOrganisationAIConnection reflects it", async () => {
    await setOllamaProvider(organisationId, {
      baseUrl: "https://ollama.example.test",
      proxySecret: "shh",
    });

    const provider = await getAIProvider(organisationId);
    expect(provider).toBeInstanceOf(OllamaProvider);

    const connection = await getOrganisationAIConnection(organisationId);
    expect(connection).toMatchObject({
      baseUrl: "https://ollama.example.test",
    });
  });

  it("works without a proxy secret — only needed for the hosted auth proxy, not plain local Ollama", async () => {
    await setOllamaProvider(organisationId, {
      baseUrl: "http://localhost:11434",
    });

    await expect(getAIProvider(organisationId)).resolves.toBeInstanceOf(
      OllamaProvider,
    );
  });

  it("omitting proxySecret on a resave preserves the existing one, rather than clearing it", async () => {
    // The Settings form never echoes a real secret back into the password
    // field, so "submitted blank" must mean "leave it alone," not "clear
    // it" — otherwise every unrelated baseUrl edit would silently break
    // the proxy auth.
    await setOllamaProvider(organisationId, {
      baseUrl: "https://first.test",
      proxySecret: "original-secret",
    });
    await setOllamaProvider(organisationId, { baseUrl: "https://second.test" });

    const row = await prisma.integration.findFirstOrThrow({
      where: { organisationId, provider: "ollama" },
    });
    const { decryptToken } = await import("@/lib/crypto/token-cipher");
    const stored = JSON.parse(decryptToken(row.credentials!)) as {
      baseUrl: string;
      proxySecret: string | null;
    };
    expect(stored).toEqual({
      baseUrl: "https://second.test",
      proxySecret: "original-secret",
    });
  });

  it("passing an explicit empty string clears the proxy secret", async () => {
    await setOllamaProvider(organisationId, {
      baseUrl: "https://x.test",
      proxySecret: "to-be-cleared",
    });
    await setOllamaProvider(organisationId, {
      baseUrl: "https://x.test",
      proxySecret: "",
    });

    const row = await prisma.integration.findFirstOrThrow({
      where: { organisationId, provider: "ollama" },
    });
    const { decryptToken } = await import("@/lib/crypto/token-cipher");
    const stored = JSON.parse(decryptToken(row.credentials!)) as {
      proxySecret: string | null;
    };
    expect(stored.proxySecret).toBeNull();
  });

  it("reconnecting updates the same connection rather than creating a second one", async () => {
    await setOllamaProvider(organisationId, { baseUrl: "https://first.test" });
    await setOllamaProvider(organisationId, { baseUrl: "https://second.test" });

    const rows = await prisma.integration.findMany({
      where: { organisationId, provider: "ollama" },
    });
    expect(rows).toHaveLength(1);

    const connection = await getOrganisationAIConnection(organisationId);
    expect(connection).toMatchObject({ baseUrl: "https://second.test" });
  });

  it("never resolves another organisation's connection", async () => {
    await setOllamaProvider(organisationId, {
      baseUrl: "https://mine.example.test",
    });

    await expect(getAIProvider(otherOrganisationId)).rejects.toBeInstanceOf(
      AIProviderNotConfiguredError,
    );
    await expect(
      getOrganisationAIConnection(otherOrganisationId),
    ).resolves.toBeNull();
  });

  it("credentials are encrypted at rest, not stored as plaintext", async () => {
    await setOllamaProvider(organisationId, {
      baseUrl: "https://ollama.example.test",
      proxySecret: "a-real-secret-value",
    });

    const row = await prisma.integration.findFirstOrThrow({
      where: { organisationId, provider: "ollama" },
    });
    expect(row.credentials).not.toBeNull();
    expect(row.credentials).not.toContain("a-real-secret-value");
  });

  it("disconnecting removes the connection cleanly", async () => {
    await setOllamaProvider(organisationId, { baseUrl: "https://x.test" });
    await disconnectAIProvider(organisationId);

    await expect(getAIProvider(organisationId)).rejects.toBeInstanceOf(
      AIProviderNotConfiguredError,
    );
    await expect(
      getOrganisationAIConnection(organisationId),
    ).resolves.toBeNull();
  });

  it("disconnecting an organisation with nothing connected is a harmless no-op", async () => {
    await expect(disconnectAIProvider(organisationId)).resolves.toBeUndefined();
  });
});

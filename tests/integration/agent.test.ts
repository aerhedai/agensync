import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";

describe("Agent create + retrieve (real Postgres)", () => {
  const organisationId = "test-org-agent-integration";
  const agentId = "test-agent-integration";

  afterAll(async () => {
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("creates an agent and reads it back from the database", async () => {
    await prisma.organisation.create({
      data: { id: organisationId, name: "Integration Test Org" },
    });

    await prisma.agent.create({
      data: {
        id: agentId,
        organisationId,
        name: "Test Agent",
        description: "Created by an integration test.",
        instructions: "Do nothing.",
        model: "llama3",
      },
    });

    const found = await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
    });

    expect(found.name).toBe("Test Agent");
    expect(found.status).toBe("DRAFT");
    expect(found.organisationId).toBe(organisationId);
  });
});

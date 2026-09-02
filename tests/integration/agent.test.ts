import { afterAll, describe, expect, it } from "vitest";

import * as agentService from "@/lib/agents/agent-service";
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
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Integration Test Org",
      },
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

describe("agentService.updateAgentStatus", () => {
  const organisationId = "test-org-agent-status";
  const otherOrganisationId = "test-org-agent-status-other";

  afterAll(async () => {
    await prisma.agent.deleteMany({
      where: { organisationId: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.organisation.deleteMany({
      where: { id: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.$disconnect();
  });

  it("moves a DRAFT agent to ACTIVE, the only status dispatch.ts routes to", async () => {
    await prisma.organisation.create({
      data: { id: organisationId, clerkOrgId: organisationId, name: "Org" },
    });
    const agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Status Test Agent",
        description: "d",
        instructions: "i",
        model: "llama3",
      },
    });
    expect(agent.status).toBe("DRAFT");

    await agentService.updateAgentStatus(organisationId, agent.id, "ACTIVE");

    const reloaded = await prisma.agent.findUniqueOrThrow({
      where: { id: agent.id },
    });
    expect(reloaded.status).toBe("ACTIVE");
  });

  it("throws rather than activating an agent belonging to a different organisation", async () => {
    await prisma.organisation.create({
      data: {
        id: otherOrganisationId,
        clerkOrgId: otherOrganisationId,
        name: "Other Org",
      },
    });
    const agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Status Test Agent 2",
        description: "d",
        instructions: "i",
        model: "llama3",
      },
    });

    await expect(
      agentService.updateAgentStatus(otherOrganisationId, agent.id, "ACTIVE"),
    ).rejects.toThrow("Agent not found");

    const reloaded = await prisma.agent.findUniqueOrThrow({
      where: { id: agent.id },
    });
    expect(reloaded.status).toBe("DRAFT");
  });
});

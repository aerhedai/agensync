import { afterAll, describe, expect, it } from "vitest";

import * as agentService from "@/lib/agents/agent-service";
import { prisma } from "@/lib/db/prisma";

describe("Agent create + retrieve (real Postgres)", () => {
  const organisationId = "test-org-agent-integration";
  const agentId = "test-agent-integration";

  afterAll(async () => {
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.customEntityRecord.deleteMany({
      where: { organisationId: organisationId },
    });
    await prisma.customEntityType.deleteMany({
      where: { organisationId: organisationId },
    });
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

describe("agentService.deleteAgent", () => {
  const organisationId = "test-org-agent-delete";
  const otherOrganisationId = "test-org-agent-delete-other";

  afterAll(async () => {
    await prisma.agentTool.deleteMany({ where: { agent: { organisationId } } });
    await prisma.agentRun.deleteMany({ where: { organisationId } });
    await prisma.agent.deleteMany({
      where: { organisationId: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.organisation.deleteMany({
      where: { id: { in: [organisationId, otherOrganisationId] } },
    });
    await prisma.$disconnect();
  });

  it("deletes an agent with no run history, cascading its tool grants", async () => {
    await prisma.organisation.create({
      data: { id: organisationId, clerkOrgId: organisationId, name: "Org" },
    });
    const agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Delete Test Agent",
        description: "d",
        instructions: "i",
        model: "llama3",
      },
    });
    await prisma.agentTool.create({
      data: { agentId: agent.id, toolName: "send_email" },
    });

    const deleted = await agentService.deleteAgent(organisationId, agent.id);

    expect(deleted).toBe(true);
    const reloaded = await prisma.agent.findUnique({ where: { id: agent.id } });
    expect(reloaded).toBeNull();
    const tools = await prisma.agentTool.findMany({
      where: { agentId: agent.id },
    });
    expect(tools).toHaveLength(0);
  });

  it("throws a clear error and does not delete an agent with real run history", async () => {
    const agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Delete Test Agent With Runs",
        description: "d",
        instructions: "i",
        model: "llama3",
      },
    });
    await prisma.agentRun.create({
      data: {
        agentId: agent.id,
        organisationId,
        input: "test input",
        status: "COMPLETED",
      },
    });

    await expect(
      agentService.deleteAgent(organisationId, agent.id),
    ).rejects.toThrow("archive it instead");

    const reloaded = await prisma.agent.findUnique({ where: { id: agent.id } });
    expect(reloaded).not.toBeNull();
  });

  it("does not delete an agent belonging to a different organisation", async () => {
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
        name: "Delete Test Agent Cross-Org",
        description: "d",
        instructions: "i",
        model: "llama3",
      },
    });

    const deleted = await agentService.deleteAgent(
      otherOrganisationId,
      agent.id,
    );

    expect(deleted).toBe(false);
    const reloaded = await prisma.agent.findUnique({ where: { id: agent.id } });
    expect(reloaded).not.toBeNull();
  });
});

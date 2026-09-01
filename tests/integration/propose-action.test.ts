import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/prisma";
import type { Agent, Organisation } from "@/lib/generated/prisma/client";
import { proposeAction } from "@/lib/harness/propose-action";
import { connectMcpClient } from "@/lib/mcp/client";
import * as runRepository from "@/lib/runs/run-repository";

/**
 * Proves proposeAction's gate is genuinely driven by the tool being
 * called, not hardcoded to send_email — the direct motivation for
 * generalizing it (Agent.actionTool). Constructs a PipelineContext
 * directly rather than routing through a full pipeline, since the point
 * here is proposeAction's own branching, independent of any one
 * pipeline's argument shape.
 */
describe("proposeAction", () => {
  const organisationId = "test-org-propose-action";
  let organisation: Organisation;
  let agent: Agent;

  beforeAll(async () => {
    organisation = await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Propose Action Test Org",
      },
    });
    await prisma.customer.create({
      data: {
        organisationId,
        name: "Test Customer",
        email: "test@propose-action.test",
        company: "Test Co",
      },
    });
    agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Test Agent",
        description: "Used to test proposeAction directly.",
        instructions: "n/a",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "acknowledge_reply",
      },
    });
    await prisma.agentTool.createMany({
      data: ["find_customer", "send_email"].map((toolName) => ({
        agentId: agent.id,
        toolName,
      })),
    });
  });

  afterAll(async () => {
    const runs = await prisma.agentRun.findMany({
      where: { organisationId },
      select: { id: true },
    });
    const runIds = runs.map((r) => r.id);
    await prisma.approval.deleteMany({ where: { agentRunId: { in: runIds } } });
    await prisma.toolCall.deleteMany({ where: { agentRunId: { in: runIds } } });
    await prisma.runStep.deleteMany({ where: { agentRunId: { in: runIds } } });
    await prisma.agentRun.deleteMany({ where: { organisationId } });
    await prisma.agentTool.deleteMany({ where: { agentId: agent.id } });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.customer.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("pauses for approval when the configured actionTool is approval-gated (send_email)", async () => {
    const run = await runRepository.createRun(
      organisationId,
      agent.id,
      "test input",
    );
    const mcpClient = await connectMcpClient(organisationId);

    const result = await proposeAction(
      {
        runId: run.id,
        organisationId,
        organisation,
        agent,
        input: "test input",
        senderEmail: null,
        mcpClient,
        provider: { generateResponse: async () => ({ content: "" }) },
        allowedTools: new Set(["find_customer", "send_email"]),
      },
      {
        toolName: "send_email",
        args: {
          to: "test@propose-action.test",
          subject: "Hello",
          body: "Hi there.",
        },
      },
    );

    expect(result.status).toBe("WAITING_FOR_APPROVAL");
    await mcpClient.close();
  });

  it("completes immediately, no approval pause, when the configured actionTool is not approval-gated — proves the gate is driven by the tool, not hardcoded to send_email", async () => {
    const run = await runRepository.createRun(
      organisationId,
      agent.id,
      "test input",
    );
    const mcpClient = await connectMcpClient(organisationId);

    const result = await proposeAction(
      {
        runId: run.id,
        organisationId,
        organisation,
        agent,
        input: "test input",
        senderEmail: null,
        mcpClient,
        provider: { generateResponse: async () => ({ content: "" }) },
        allowedTools: new Set(["find_customer", "send_email"]),
      },
      {
        toolName: "find_customer",
        args: { query: "test@propose-action.test" },
      },
    );

    expect(result.status).toBe("COMPLETED");
    await mcpClient.close();
  });
});

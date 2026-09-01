import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AIProvider, AIResponse } from "@/lib/ai/provider";
import { prisma } from "@/lib/db/prisma";
import { dispatchInboundMessage } from "@/lib/routing/dispatch";

// Ollama isn't reachable from CI — classification and the handler's own
// run both go through the same scripted provider here, proving the real
// dispatch → classify → runAgent wiring end to end against the real DB.
function scriptedProvider(responses: AIResponse[]): AIProvider {
  let call = 0;
  return {
    generateResponse: async () => {
      const response = responses[call];
      call += 1;
      if (!response) throw new Error("scriptedProvider ran out of responses");
      return response;
    },
  };
}

describe("dispatchInboundMessage", () => {
  const organisationId = "test-org-dispatch";
  let classifierId: string;
  let quoteAgentId: string;
  let complaintsAgentId: string;
  let workflowId: string;

  beforeAll(async () => {
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Dispatch Test Org",
      },
    });

    const classifier = await prisma.agent.create({
      data: {
        organisationId,
        name: "Test Classifier",
        description: "Routes inbound messages.",
        instructions: "Decide which agent should handle this message.",
        model: "test-model",
        status: "ACTIVE",
      },
    });
    classifierId = classifier.id;

    const quoteAgent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Quote Agent",
        description: "Handles price quotes.",
        instructions: "Handle the quote request.",
        model: "test-model",
        status: "ACTIVE",
      },
    });
    quoteAgentId = quoteAgent.id;

    const complaintsAgent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Complaints Agent",
        description: "Handles complaints.",
        instructions: "Handle the complaint.",
        model: "test-model",
        status: "ACTIVE",
      },
    });
    complaintsAgentId = complaintsAgent.id;

    const workflow = await prisma.workflow.create({
      data: {
        organisationId,
        name: "Email Handling",
        description: "Test workflow.",
        trigger: "EMAIL",
        status: "ACTIVE",
      },
    });
    workflowId = workflow.id;

    await prisma.workflowAgent.createMany({
      data: [
        { workflowId, agentId: classifierId, role: "CLASSIFIER" },
        { workflowId, agentId: quoteAgentId, role: "HANDLER" },
        { workflowId, agentId: complaintsAgentId, role: "HANDLER" },
      ],
    });
  });

  afterAll(async () => {
    const runs = await prisma.agentRun.findMany({
      where: { organisationId },
      select: { id: true },
    });
    const runIds = runs.map((r) => r.id);
    await prisma.toolCall.deleteMany({ where: { agentRunId: { in: runIds } } });
    await prisma.runStep.deleteMany({ where: { agentRunId: { in: runIds } } });
    await prisma.agentRun.deleteMany({ where: { organisationId } });
    await prisma.workflowAgent.deleteMany({ where: { workflowId } });
    await prisma.workflow.deleteMany({ where: { organisationId } });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("classifies and runs the matched handler agent", async () => {
    const provider = scriptedProvider([
      { content: `{"agentId": "${quoteAgentId}"}` }, // classification
      { content: "Here's your quote." }, // the handler's own run
    ]);

    const result = await dispatchInboundMessage(
      organisationId,
      "EMAIL",
      "Can I get a quote for 500 units of Product A?",
      provider,
    );

    expect(result).toMatchObject({
      matched: true,
      agentId: quoteAgentId,
      agentName: "Quote Agent",
    });
    if (!result.matched) throw new Error("expected matched result");
    expect(result.run.status).toBe("COMPLETED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: result.run.runId },
    });
    expect(run.agentId).toBe(quoteAgentId);
  });

  it("runs nothing when the classifier finds no clear match", async () => {
    const provider = scriptedProvider([{ content: '{"agentId": null}' }]);

    const before = await prisma.agentRun.count({ where: { organisationId } });
    const result = await dispatchInboundMessage(
      organisationId,
      "EMAIL",
      "A newsletter that doesn't need a reply",
      provider,
    );
    const after = await prisma.agentRun.count({ where: { organisationId } });

    expect(result).toEqual({ matched: false, reason: "no_match" });
    expect(after).toBe(before);
  });

  it("reports no_workflow when the organisation has no active EMAIL workflow", async () => {
    const otherOrg = await prisma.organisation.create({
      data: {
        clerkOrgId: "test-clerk-org-no-workflow",
        name: "No Workflow Org",
      },
    });

    const result = await dispatchInboundMessage(
      otherOrg.id,
      "EMAIL",
      "Anything",
      scriptedProvider([]),
    );

    expect(result).toEqual({ matched: false, reason: "no_workflow" });

    await prisma.organisation.delete({ where: { id: otherOrg.id } });
  });

  it("never lets the sender's address influence classification — found live: an address containing a keyword substring silently misrouted every message", async () => {
    // Self-contained org/agents so keyword-based deterministic routing
    // (irrelevant to the rest of this file, which relies on the LLM
    // classifier always firing) can't affect the other tests above.
    const orgId = "test-org-dispatch-sender-isolation";
    await prisma.organisation.create({
      data: { id: orgId, clerkOrgId: orgId, name: "Sender Isolation Org" },
    });
    const classifier = await prisma.agent.create({
      data: {
        organisationId: orgId,
        name: "Classifier",
        description: "Routes inbound messages.",
        instructions: "Decide which agent should handle this message.",
        model: "test-model",
        status: "ACTIVE",
      },
    });
    const quoteAgent = await prisma.agent.create({
      data: {
        organisationId: orgId,
        name: "Quote Agent",
        description: "Handles price quotes.",
        instructions: "Handle the quote request.",
        model: "test-model",
        status: "ACTIVE",
        keywords: ["price"],
      },
    });
    const complaintsAgent = await prisma.agent.create({
      data: {
        organisationId: orgId,
        name: "Complaints Agent",
        description: "Handles complaints.",
        instructions: "Handle the complaint.",
        model: "test-model",
        status: "ACTIVE",
        keywords: ["broken"],
      },
    });
    const workflow = await prisma.workflow.create({
      data: {
        organisationId: orgId,
        name: "Email Handling",
        description: "Test workflow.",
        trigger: "EMAIL",
        status: "ACTIVE",
      },
    });
    await prisma.workflowAgent.createMany({
      data: [
        { workflowId: workflow.id, agentId: classifier.id, role: "CLASSIFIER" },
        { workflowId: workflow.id, agentId: quoteAgent.id, role: "HANDLER" },
        {
          workflowId: workflow.id,
          agentId: complaintsAgent.id,
          role: "HANDLER",
        },
      ],
    });

    try {
      // Message content matches only the Complaints Agent's keyword
      // ("broken"); the sender's own address happens to contain the Quote
      // Agent's keyword ("...price@..."). Only one scripted response is
      // loaded — if the sender's address leaked into the classification
      // text and caused an LLM classifier call (or a wrong deterministic
      // match), this throws "ran out of responses" or asserts the wrong
      // agent, instead of routing straight to Complaints with zero LLM
      // calls.
      const provider = scriptedProvider([{ content: "Sorry to hear that." }]);
      const result = await dispatchInboundMessage(
        orgId,
        "EMAIL",
        "The item arrived broken.",
        provider,
        "jordan.price@example.com",
      );

      expect(result).toMatchObject({
        matched: true,
        agentId: complaintsAgent.id,
        agentName: "Complaints Agent",
      });
    } finally {
      const runs = await prisma.agentRun.findMany({
        where: { organisationId: orgId },
        select: { id: true },
      });
      const runIds = runs.map((r) => r.id);
      await prisma.toolCall.deleteMany({
        where: { agentRunId: { in: runIds } },
      });
      await prisma.runStep.deleteMany({
        where: { agentRunId: { in: runIds } },
      });
      await prisma.agentRun.deleteMany({ where: { organisationId: orgId } });
      await prisma.workflowAgent.deleteMany({
        where: { workflowId: workflow.id },
      });
      await prisma.workflow.deleteMany({ where: { organisationId: orgId } });
      await prisma.agent.deleteMany({ where: { organisationId: orgId } });
      await prisma.organisation.deleteMany({ where: { id: orgId } });
    }
  });
});

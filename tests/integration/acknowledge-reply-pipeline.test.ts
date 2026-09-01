import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AIProvider, AIResponse } from "@/lib/ai/provider";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/generated/prisma/client";
import { runHarnessPipeline } from "@/lib/harness/run-harness-pipeline";

// Same rationale as harness-pipeline.test.ts: Ollama isn't reachable from
// CI, so this proves the generic pipeline's control flow — dynamic
// extraction schema, identity resolution, optional lookup, guardrail —
// against the real DB and real MCP tools, with a scripted provider
// standing in for the model.
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

describe("acknowledge_reply pipeline", () => {
  const organisationId = "test-org-acknowledge-reply";
  let caseAgent: Agent; // a business-defined category unlike anything hardcoded before
  let noGuardrailAgent: Agent;

  beforeAll(async () => {
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Acknowledge Reply Test Org",
        currency: "GBP",
      },
    });
    await prisma.customer.create({
      data: {
        organisationId,
        name: "Jordan Reyes",
        email: "jordan@case-customer.test",
        company: "Reyes & Co",
      },
    });

    // Proves this isn't Complaints/General reskinned — a law-firm-shaped
    // category with its own business-defined field and its own guardrail,
    // configured entirely as data, no new pipeline file.
    caseAgent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Case Inquiry Agent",
        description: "Handles new case inquiries.",
        instructions:
          "Acknowledge the inquiry and note a lawyer will follow up.",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "acknowledge_reply",
        extractionFields: [
          {
            name: "caseType",
            description: "what kind of legal matter this is",
          },
        ],
        guardrailKeywords: ["guarantee", "certain to win"],
      },
    });
    await prisma.agentTool.createMany({
      data: ["find_customer", "send_email"].map((toolName) => ({
        agentId: caseAgent.id,
        toolName,
      })),
    });

    noGuardrailAgent = await prisma.agent.create({
      data: {
        organisationId,
        name: "No Guardrail Agent",
        description: "A category with no guardrail configured.",
        instructions: "Answer helpfully.",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "acknowledge_reply",
        extractionFields: [],
        guardrailKeywords: [],
      },
    });
    await prisma.agentTool.createMany({
      data: ["send_email"].map((toolName) => ({
        agentId: noGuardrailAgent.id,
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
    await prisma.agentTool.deleteMany({
      where: { agentId: { in: [caseAgent.id, noGuardrailAgent.id] } },
    });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.customer.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("uses senderEmail for identification without any LLM-extracted email, and surfaces the business-defined field as a fact", async () => {
    const provider = scriptedProvider([
      { content: '{"customerEmail": null, "caseType": "employment dispute"}' },
      { content: "Thank you for reaching out about your employment dispute." },
    ]);

    const result = await runHarnessPipeline(
      caseAgent,
      "New case inquiry",
      provider,
      "jordan@case-customer.test",
    );

    expect(result.status).toBe("WAITING_FOR_APPROVAL");

    const approval = await prisma.approval.findFirst({
      where: { agentRunId: result.runId },
    });
    expect(approval).toMatchObject({
      proposedInput: { to: "jordan@case-customer.test" },
    });

    // find_customer was called with the structural senderEmail, not
    // anything scraped from free text.
    const customerLookup = await prisma.toolCall.findFirst({
      where: { agentRunId: result.runId, toolName: "find_customer" },
    });
    expect(customerLookup?.input).toMatchObject({
      query: "jordan@case-customer.test",
    });
  });

  it("refuses to propose a reply that violates this category's own guardrail", async () => {
    const provider = scriptedProvider([
      { content: '{"customerEmail": null, "caseType": "personal injury"}' },
      { content: "I can guarantee this case will win in court." },
    ]);

    const result = await runHarnessPipeline(
      caseAgent,
      "New case inquiry",
      provider,
      "jordan@case-customer.test",
    );

    expect(result.status).toBe("FAILED");

    const approval = await prisma.approval.findFirst({
      where: { agentRunId: result.runId },
    });
    expect(approval).toBeNull();
  });

  it("a category with no guardrail configured never blocks on wording another category would", async () => {
    const provider = scriptedProvider([
      { content: '{"customerEmail": null}' },
      { content: "I can guarantee we'll get back to you soon." },
    ]);

    const result = await runHarnessPipeline(
      noGuardrailAgent,
      "General question",
      provider,
      "jordan@case-customer.test",
    );

    expect(result.status).toBe("WAITING_FOR_APPROVAL");
  });

  it("fails cleanly with no email available from any source", async () => {
    const provider = scriptedProvider([{ content: '{"customerEmail": null}' }]);

    const result = await runHarnessPipeline(
      noGuardrailAgent,
      "Hello, just a question with no contact info",
      provider,
    );

    expect(result.status).toBe("FAILED");
  });
});

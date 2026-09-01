import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AIProvider, AIResponse } from "@/lib/ai/provider";
import { prisma } from "@/lib/db/prisma";
import type { Agent, User } from "@/lib/generated/prisma/client";
import { runHarnessPipeline } from "@/lib/harness/run-harness-pipeline";
import { resumeRun } from "@/lib/runtime/agent-runtime";

// Same rationale as agent-runtime.test.ts: Ollama isn't reachable from CI,
// so the harness's control flow — extraction, deterministic tool
// sequencing, approval gating, resume — is proven here with a scripted
// provider against the real DB and real MCP tools.

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

describe("harness pipeline", () => {
  const organisationId = "test-org-harness";
  let quoteAgent: Agent;
  let restrictedQuoteAgent: Agent;
  let approver: User;

  beforeAll(async () => {
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Harness Test Org",
        currency: "GBP",
      },
    });
    // Real per-org catalog rows the pipeline's real find_product/
    // find_customer/check_inventory/calculate_quote tool calls resolve
    // against — replaces the old shared lib/mcp/mock-data.ts arrays.
    await prisma.product.create({
      data: {
        organisationId,
        sku: "TEST-WIDGET-A",
        name: "Product A",
        unitPrice: 15,
        stockQuantity: 700,
      },
    });
    await prisma.customer.create({
      data: {
        organisationId,
        name: "Test Customer",
        email: "buyer@customer-abc.test",
        company: "Customer ABC Ltd",
      },
    });

    quoteAgent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Quote Agent",
        description: "Handles price quotes.",
        instructions: "A customer is asking for a price quote.",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "quote",
      },
    });
    await prisma.agentTool.createMany({
      data: [
        "find_customer",
        "find_product",
        "check_inventory",
        "calculate_quote",
        "send_email",
      ].map((toolName) => ({ agentId: quoteAgent.id, toolName })),
    });

    restrictedQuoteAgent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Restricted Quote Agent",
        description: "Used to test tool restriction inside a pipeline.",
        instructions: "A customer is asking for a price quote.",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "quote",
      },
    });
    // Deliberately missing calculate_quote and send_email.
    await prisma.agentTool.createMany({
      data: ["find_customer", "find_product", "check_inventory"].map(
        (toolName) => ({ agentId: restrictedQuoteAgent.id, toolName }),
      ),
    });

    approver = await prisma.user.create({
      data: {
        organisationId,
        clerkUserId: "test-approver-harness",
        email: "approver@harness-test.local",
        name: "Test Approver",
        role: "APPROVER",
      },
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
      where: { agentId: { in: [quoteAgent.id, restrictedQuoteAgent.id] } },
    });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.user.deleteMany({ where: { organisationId } });
    await prisma.product.deleteMany({ where: { organisationId } });
    await prisma.customer.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  const extractionResponse: AIResponse = {
    content:
      '{"product": "Product A", "quantity": 500, "customerEmail": "buyer@customer-abc.test"}',
    usage: { promptTokens: 100, completionTokens: 20 },
  };
  const composeResponse: AIResponse = {
    content: "Dear customer, your quote is £7,500.",
    usage: { promptTokens: 80, completionTokens: 15 },
  };

  it("runs the deterministic pipeline, records token usage per LLM call, and pauses for approval on send_email", async () => {
    const provider = scriptedProvider([extractionResponse, composeResponse]);

    const result = await runHarnessPipeline(
      quoteAgent,
      "Quote 500 units of Product A",
      provider,
    );

    expect(result.status).toBe("WAITING_FOR_APPROVAL");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: result.runId },
      include: {
        steps: { orderBy: { createdAt: "asc" }, include: { toolCall: true } },
      },
    });

    expect(run.steps.map((s) => s.stepType)).toEqual([
      "INPUT_RECEIVED",
      "AGENT_DECISION", // extraction
      "TOOL_CALL", // find_customer
      "TOOL_CALL", // find_product
      "TOOL_CALL", // check_inventory
      "TOOL_CALL", // calculate_quote
      "AGENT_DECISION", // compose
      "APPROVAL_REQUESTED",
    ]);

    // Tool sequencing was entirely deterministic — no LLM decided which
    // tool to call, so exactly these four, in this order, every time.
    const toolSteps = run.steps.filter((s) => s.stepType === "TOOL_CALL");
    expect(toolSteps.map((s) => s.toolCall?.toolName)).toEqual([
      "find_customer",
      "find_product",
      "check_inventory",
      "calculate_quote",
    ]);
    expect(toolSteps.every((s) => s.toolCall?.status === "SUCCESS")).toBe(true);

    // Token usage recorded on both LLM-backed steps, matching the scripted
    // usage exactly.
    const decisionSteps = run.steps.filter(
      (s) => s.stepType === "AGENT_DECISION",
    );
    expect(
      decisionSteps.map((s) => [s.promptTokens, s.completionTokens]),
    ).toEqual([
      [100, 20],
      [80, 15],
    ]);

    const approval = await prisma.approval.findFirst({
      where: { agentRunId: result.runId },
    });
    expect(approval).toMatchObject({
      status: "PENDING",
      requestedAction: "send_email",
      proposedInput: {
        to: "buyer@customer-abc.test",
        subject: "Quote for 500 x Product A",
      },
    });
  });

  it("resumes with no further LLM call — the pipeline already finished its work before proposing the send", async () => {
    const provider = scriptedProvider([extractionResponse, composeResponse]);
    const paused = await runHarnessPipeline(
      quoteAgent,
      "Quote 500 units of Product A",
      provider,
    );
    expect(paused.status).toBe("WAITING_FOR_APPROVAL");

    // No responses left in the queue — if resume tried to call the LLM
    // again, scriptedProvider would throw, which is itself part of what
    // this test proves.
    const resumeProvider = scriptedProvider([]);
    const resumed = await resumeRun(
      paused.runId,
      organisationId,
      "APPROVED",
      approver.id,
      resumeProvider,
    );

    // send_email genuinely runs here (the real tool, not a mock) — it
    // fails because this test org has no Gmail integration connected,
    // same as the equivalent LOOP-mode test. That's the correct, realistic
    // outcome to assert: the call only happens post-approval, and a real
    // failure doesn't crash the run or fall back to another LLM call.
    expect(resumed.status).toBe("FAILED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: paused.runId },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });
    expect(run.steps.at(-1)).toMatchObject({ stepType: "RUN_FAILED" });

    const sentToolCall = await prisma.toolCall.findFirst({
      where: { agentRunId: paused.runId, toolName: "send_email" },
    });
    expect(sentToolCall).toMatchObject({ status: "FAILED" });
    expect(sentToolCall?.error).toMatch(/no email account.*is connected/i);
  });

  it("cancels cleanly on rejection — send_email never runs", async () => {
    const provider = scriptedProvider([extractionResponse, composeResponse]);
    const paused = await runHarnessPipeline(
      quoteAgent,
      "Quote 500 units of Product A",
      provider,
    );
    expect(paused.status).toBe("WAITING_FOR_APPROVAL");

    const resumed = await resumeRun(
      paused.runId,
      organisationId,
      "REJECTED",
      approver.id,
    );
    expect(resumed.status).toBe("CANCELLED");

    const sentToolCall = await prisma.toolCall.findFirst({
      where: { agentRunId: paused.runId, toolName: "send_email" },
    });
    expect(sentToolCall).toBeNull();
  });

  it("fails cleanly when extraction can't find a product and quantity — no tool calls attempted", async () => {
    const provider = scriptedProvider([
      { content: '{"product": null, "quantity": null, "customerEmail": null}' },
    ]);

    const result = await runHarnessPipeline(
      quoteAgent,
      "Hello, just saying hi",
      provider,
    );

    expect(result.status).toBe("FAILED");

    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: result.runId },
    });
    expect(toolCalls).toHaveLength(0);
  });

  it("respects per-agent tool restriction inside the pipeline — a disallowed tool is refused, not silently used", async () => {
    const provider = scriptedProvider([extractionResponse]);

    const result = await runHarnessPipeline(
      restrictedQuoteAgent,
      "Quote 500 units of Product A",
      provider,
    );

    // find_customer/find_product/check_inventory all succeed (granted);
    // calculate_quote is refused (not granted), which the pipeline treats
    // as a failed step and stops — the fixed sequence doesn't bypass
    // AgentTool just because it's hardcoded in code.
    expect(result.status).toBe("FAILED");

    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: result.runId },
      orderBy: { createdAt: "asc" },
    });
    expect(toolCalls.map((t) => [t.toolName, t.status])).toEqual([
      ["find_customer", "SUCCESS"],
      ["find_product", "SUCCESS"],
      ["check_inventory", "SUCCESS"],
      ["calculate_quote", "FAILED"],
    ]);
    expect(
      toolCalls.find((t) => t.toolName === "calculate_quote")?.error,
    ).toMatch(/does not have access/i);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AIProvider, AIResponse } from "@/lib/ai/provider";
import { prisma } from "@/lib/db/prisma";
import type { Agent, User } from "@/lib/generated/prisma/client";
import { resumeRun, runAgent } from "@/lib/runtime/agent-runtime";

// Ollama isn't reachable from CI, so the runtime's loop logic — step
// counting, persistence, tool execution, error handling — is proven here
// with a scripted AIProvider against the real DB and the real MCP tools.
// A live run against the real model happens separately, outside CI.

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

function throwingProvider(message: string): AIProvider {
  return {
    generateResponse: async () => {
      throw new Error(message);
    },
  };
}

describe("agent runtime", () => {
  const organisationId = "test-org-runtime";
  let agent: Agent;
  let restrictedAgent: Agent;
  let approver: User;

  beforeAll(async () => {
    await prisma.organisation.create({
      data: { id: organisationId, name: "Runtime Test Org" },
    });
    agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Runtime Test Agent",
        description: "Used by agent-runtime.test.ts",
        instructions: "Quote requests using the available tools.",
        model: "test-model",
        status: "ACTIVE",
      },
    });
    await prisma.agentTool.createMany({
      data: [
        "find_customer",
        "find_product",
        "check_inventory",
        "calculate_quote",
        "send_email",
      ].map((toolName) => ({ agentId: agent.id, toolName })),
    });

    restrictedAgent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Restricted Test Agent",
        description: "Used to test per-agent tool access control.",
        instructions: "Only ever use the tools you actually have access to.",
        model: "test-model",
        status: "ACTIVE",
      },
    });
    await prisma.agentTool.create({
      data: { agentId: restrictedAgent.id, toolName: "send_email" },
    });

    approver = await prisma.user.create({
      data: {
        organisationId,
        email: "approver@runtime-test.local",
        name: "Test Approver",
        role: "APPROVER",
      },
    });
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({
      where: { agentRunId: { in: await runIds() } },
    });
    await prisma.toolCall.deleteMany({
      where: { agentRunId: { in: await runIds() } },
    });
    await prisma.runStep.deleteMany({
      where: { agentRunId: { in: await runIds() } },
    });
    await prisma.agentRun.deleteMany({ where: { organisationId } });
    await prisma.agentTool.deleteMany({
      where: { agentId: { in: [agent.id, restrictedAgent.id] } },
    });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.user.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  async function runIds(): Promise<string[]> {
    const runs = await prisma.agentRun.findMany({
      where: { organisationId },
      select: { id: true },
    });
    return runs.map((r) => r.id);
  }

  it("completes a run that calls a tool then answers, persisting the full trace", async () => {
    const provider = scriptedProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "call_0",
            name: "calculate_quote",
            arguments: { productId: "prod-1", quantity: 500 },
          },
        ],
      },
      { content: "That will be £7,500." },
    ]);

    const result = await runAgent(
      agent,
      "Quote 500 units of Product A",
      provider,
    );

    expect(result.status).toBe("COMPLETED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: result.runId },
      include: {
        steps: { orderBy: { createdAt: "asc" }, include: { toolCall: true } },
      },
    });

    expect(run.status).toBe("COMPLETED");
    expect(run.startedAt).not.toBeNull();
    expect(run.completedAt).not.toBeNull();

    expect(run.steps.map((s) => s.stepType)).toEqual([
      "INPUT_RECEIVED",
      "AGENT_DECISION",
      "TOOL_CALL",
      "AGENT_DECISION",
      "RUN_COMPLETED",
    ]);

    const toolStep = run.steps.find((s) => s.stepType === "TOOL_CALL");
    expect(toolStep?.toolCall).toMatchObject({
      toolName: "calculate_quote",
      status: "SUCCESS",
      output: { total: 7500 },
    });
  });

  const sendEmailCall = {
    id: "call_1",
    name: "send_email",
    arguments: {
      to: "customer@example.test",
      subject: "Your quote",
      body: "£7,500 for 500 units of Product A.",
    },
  };

  it("pauses before send_email executes at all — no amount threshold, always gated", async () => {
    const provider = scriptedProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "call_0",
            name: "calculate_quote",
            arguments: { productId: "prod-1", quantity: 500 },
          },
        ],
      },
      {
        content: "",
        toolCalls: [sendEmailCall],
      },
      // Should never be reached — the run must pause before a third
      // generateResponse call happens.
      { content: "This should not run." },
    ]);

    const result = await runAgent(
      agent,
      "Quote 500 units of Product A for customer@example.test",
      provider,
    );

    expect(result.status).toBe("WAITING_FOR_APPROVAL");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: result.runId },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });

    expect(run.status).toBe("WAITING_FOR_APPROVAL");
    expect(run.completedAt).toBeNull();
    expect(run.steps.map((s) => s.stepType)).toEqual([
      "INPUT_RECEIVED",
      "AGENT_DECISION",
      "TOOL_CALL",
      "AGENT_DECISION",
      "APPROVAL_REQUESTED",
    ]);

    const approvalStep = run.steps.find(
      (s) => s.stepType === "APPROVAL_REQUESTED",
    );
    expect(approvalStep?.detail).toMatch(/send_email.*approval/i);

    // send_email must never have actually executed before approval.
    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: result.runId },
    });
    expect(toolCalls.map((t) => t.toolName)).toEqual(["calculate_quote"]);

    const approval = await prisma.approval.findFirst({
      where: { agentRunId: result.runId },
    });
    expect(approval).toMatchObject({
      status: "PENDING",
      requestedAction: "send_email",
      proposedInput: sendEmailCall.arguments,
      proposedToolCallId: sendEmailCall.id,
    });
  });

  it("resumes and executes send_email only after approval, continuing the same conversation", async () => {
    const pauseProvider = scriptedProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "call_0",
            name: "calculate_quote",
            arguments: { productId: "prod-1", quantity: 500 },
          },
        ],
      },
      { content: "", toolCalls: [sendEmailCall] },
    ]);
    const paused = await runAgent(
      agent,
      "Quote 500 units of Product A for customer@example.test",
      pauseProvider,
    );
    expect(paused.status).toBe("WAITING_FOR_APPROVAL");

    const resumeProvider = scriptedProvider([
      { content: "Done — I let the customer know what happened." },
    ]);
    const resumed = await resumeRun(
      paused.runId,
      organisationId,
      "APPROVED",
      approver.id,
      resumeProvider,
    );

    expect(resumed.status).toBe("COMPLETED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: paused.runId },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });
    expect(run.status).toBe("COMPLETED");
    expect(run.steps.map((s) => s.stepType)).toEqual([
      "INPUT_RECEIVED",
      "AGENT_DECISION",
      "TOOL_CALL",
      "AGENT_DECISION",
      "APPROVAL_REQUESTED",
      "APPROVAL_GRANTED",
      "TOOL_CALL",
      "AGENT_DECISION",
      "RUN_COMPLETED",
    ]);

    // send_email now genuinely ran (against the real tool, not a mock) —
    // it fails because this test org has no Gmail integration connected,
    // which is itself the correct, realistic outcome to assert: the call
    // only happens post-approval, and a real failure doesn't crash the run.
    const sentToolCall = await prisma.toolCall.findFirst({
      where: { agentRunId: paused.runId, toolName: "send_email" },
    });
    expect(sentToolCall).toMatchObject({ status: "FAILED" });
    expect(sentToolCall?.error).toMatch(/gmail is not connected/i);

    const approval = await prisma.approval.findFirst({
      where: { agentRunId: paused.runId },
    });
    expect(approval).toMatchObject({
      status: "APPROVED",
      approverId: approver.id,
    });
  });

  it("cancels the run when the approver rejects it — send_email never runs", async () => {
    const pauseProvider = scriptedProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "call_0",
            name: "calculate_quote",
            arguments: { productId: "prod-1", quantity: 500 },
          },
        ],
      },
      { content: "", toolCalls: [sendEmailCall] },
    ]);
    const paused = await runAgent(
      agent,
      "Quote 500 units of Product A for customer@example.test",
      pauseProvider,
    );
    expect(paused.status).toBe("WAITING_FOR_APPROVAL");

    const resumed = await resumeRun(
      paused.runId,
      organisationId,
      "REJECTED",
      approver.id,
    );

    expect(resumed.status).toBe("CANCELLED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: paused.runId },
      include: { steps: { orderBy: { createdAt: "asc" } } },
    });
    expect(run.status).toBe("CANCELLED");
    expect(run.steps.at(-1)).toMatchObject({ stepType: "RUN_CANCELLED" });

    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: paused.runId },
    });
    expect(toolCalls.map((t) => t.toolName)).toEqual(["calculate_quote"]);

    const approval = await prisma.approval.findFirst({
      where: { agentRunId: paused.runId },
    });
    expect(approval).toMatchObject({
      status: "REJECTED",
      approverId: approver.id,
    });
  });

  it("fails the run rather than claiming success when the model writes a tool call as plain text instead of a real one", async () => {
    // Regression test for a real live-testing failure: the model sometimes
    // writes its intended call as JSON text in `content` instead of using
    // the provider's tool-calling mechanism. With an empty toolCalls array
    // this used to read as "no more action needed" and mark the run
    // COMPLETED — even though send_email was never actually invoked.
    const provider = scriptedProvider([
      {
        content:
          '{"name": "send_email", "arguments": {"to": "customer@example.test", "subject": "Hi", "body": "..."}}',
      },
    ]);

    const result = await runAgent(
      agent,
      "Quote 500 units of Product A",
      provider,
    );

    expect(result.status).toBe("FAILED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: result.runId },
      include: { steps: true },
    });
    const failedStep = run.steps.find((s) => s.stepType === "RUN_FAILED");
    expect(failedStep?.detail).toMatch(
      /plain text instead of a real tool call/i,
    );

    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: result.runId },
    });
    expect(toolCalls).toHaveLength(0);
  });

  it("fails the run on a second observed shape: <tool_call> tags leaked into plain text", async () => {
    // Regression test for a second real live-testing failure — the same
    // underlying problem (tool call written as text, not a real toolCalls
    // entry) but in a different shape: Qwen's own <tool_call> chat-template
    // token leaking into content, sometimes with garbled characters before
    // it and multiple fragments. This one isn't valid JSON on its own, so
    // it needs its own detection path rather than the single-object check.
    const provider = scriptedProvider([
      {
        content:
          '遆\n{"name": "find_product", "arguments": {"query": "Product A"}}\n</tool_call>\n{"name": "find_customer", "arguments": {"query": "buyer@customer-abc.test"}}\n</tool_call>',
      },
    ]);

    const result = await runAgent(
      agent,
      "Quote 500 units of Product A",
      provider,
    );

    expect(result.status).toBe("FAILED");

    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: result.runId },
    });
    expect(toolCalls).toHaveLength(0);
  });

  it("still completes normally on an ordinary plain-text reply that isn't a disguised tool call", async () => {
    const provider = scriptedProvider([
      { content: "Thanks for reaching out, we'll be in touch shortly." },
    ]);

    const result = await runAgent(
      agent,
      "A message needing a plain reply",
      provider,
    );

    expect(result.status).toBe("COMPLETED");
  });

  it("refuses a tool call outside the agent's granted tools without ever reaching the real tool", async () => {
    const provider = scriptedProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "call_0",
            name: "calculate_quote",
            arguments: { productId: "prod-1", quantity: 500 },
          },
        ],
      },
      { content: "I couldn't calculate that." },
    ]);

    const result = await runAgent(
      restrictedAgent,
      "Quote 500 units of Product A",
      provider,
    );

    expect(result.status).toBe("COMPLETED");

    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: result.runId },
    });
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      toolName: "calculate_quote",
      status: "FAILED",
    });
    expect(toolCalls[0]?.error).toMatch(/does not have access/i);
  });

  it("marks the run FAILED with a tool-error record when a tool call fails", async () => {
    const provider = scriptedProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "call_0",
            name: "calculate_quote",
            arguments: { productId: "does-not-exist", quantity: 1 },
          },
        ],
      },
      { content: "I couldn't find that product." },
    ]);

    const result = await runAgent(agent, "Quote an unknown product", provider);

    expect(result.status).toBe("COMPLETED");

    const toolCalls = await prisma.toolCall.findMany({
      where: { agentRunId: result.runId },
    });
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({ status: "FAILED" });
    expect(toolCalls[0]?.error).toMatch(/no product found/i);
  });

  it("fails the run after exceeding the step limit", async () => {
    const infiniteToolCalls: AIResponse = {
      content: "",
      toolCalls: [
        {
          id: "call_0",
          name: "check_inventory",
          arguments: { productId: "prod-1" },
        },
      ],
    };
    const provider = scriptedProvider(
      Array.from({ length: 25 }, () => infiniteToolCalls),
    );

    const result = await runAgent(
      agent,
      "Never stop checking inventory",
      provider,
    );

    expect(result.status).toBe("FAILED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: result.runId },
      include: { steps: true },
    });
    expect(run.status).toBe("FAILED");
    expect(run.steps.some((s) => s.stepType === "RUN_FAILED")).toBe(true);
  });

  it("fails the run and records the error when the provider itself throws", async () => {
    const result = await runAgent(
      agent,
      "This will error",
      throwingProvider("Ollama is unreachable"),
    );

    expect(result.status).toBe("FAILED");

    const run = await prisma.agentRun.findUniqueOrThrow({
      where: { id: result.runId },
      include: { steps: true },
    });
    const failedStep = run.steps.find((s) => s.stepType === "RUN_FAILED");
    expect(failedStep?.detail).toBe("Ollama is unreachable");
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AIProvider, AIResponse } from "@/lib/ai/provider";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/generated/prisma/client";
import { runAgent } from "@/lib/runtime/agent-runtime";

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
  });

  afterAll(async () => {
    await prisma.toolCall.deleteMany({
      where: { agentRunId: { in: await runIds() } },
    });
    await prisma.runStep.deleteMany({
      where: { agentRunId: { in: await runIds() } },
    });
    await prisma.agentRun.deleteMany({ where: { organisationId } });
    await prisma.agent.deleteMany({ where: { organisationId } });
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

  it("pauses the run for approval instead of completing when a quote meets the threshold", async () => {
    const provider = scriptedProvider([
      {
        content: "",
        toolCalls: [
          {
            id: "call_0",
            name: "calculate_quote",
            arguments: { productId: "prod-1", quantity: 1000 },
          },
        ],
      },
      // Should never be reached — the run must pause before a second
      // generateResponse call happens.
      { content: "This should not run." },
    ]);

    const result = await runAgent(
      agent,
      "Quote 1000 units of Product A",
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
      "APPROVAL_REQUESTED",
    ]);

    const approvalStep = run.steps.find(
      (s) => s.stepType === "APPROVAL_REQUESTED",
    );
    expect(approvalStep?.detail).toMatch(/£15,000.*£10,000/);
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

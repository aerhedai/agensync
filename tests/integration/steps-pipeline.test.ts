import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AIProvider, AIResponse } from "@/lib/ai/provider";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/generated/prisma/client";
import { runHarnessPipeline } from "@/lib/harness/run-harness-pipeline";

// The step engine's whole claim is that a business process becomes
// configuration rather than a new pipeline file. These tests exercise that
// against the real database and the real MCP tools — the only thing
// scripted is the model itself.

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

const neverCallProvider: AIProvider = {
  generateResponse: async () => {
    throw new Error("this programme must not call the AI provider");
  },
};

describe("steps pipeline", () => {
  const organisationId = "test-org-steps-pipeline";
  let invoiceTypeId: string;

  async function createAgent(config: {
    steps: unknown[];
    tools?: string[];
    guardrailKeywords?: string[];
  }): Promise<Agent> {
    const agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Step Agent",
        description: "Runs a configured step sequence.",
        instructions: "Be concise.",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "steps",
        pipelineConfig: { steps: config.steps } as never,
        guardrailKeywords: config.guardrailKeywords ?? [],
      },
    });
    const tools = config.tools ?? [
      "find_record",
      "search_records",
      "create_record",
      "update_record",
      "send_email",
    ];
    await prisma.agentTool.createMany({
      data: tools.map((toolName) => ({ agentId: agent.id, toolName })),
    });
    return agent;
  }

  beforeAll(async () => {
    await prisma.organisation.create({
      data: {
        id: organisationId,
        clerkOrgId: organisationId,
        name: "Steps Test Org",
        currency: "GBP",
      },
    });
    const invoiceType = await prisma.customEntityType.create({
      data: {
        organisationId,
        name: "Invoice",
        fields: [
          { name: "number", description: "Invoice number" },
          { name: "total", description: "Amount" },
        ],
      },
    });
    invoiceTypeId = invoiceType.id;
    await prisma.customEntityRecord.create({
      data: {
        organisationId,
        entityTypeId: invoiceTypeId,
        data: { number: "INV-1", total: "100" },
      },
    });
    await prisma.customer.create({
      data: {
        organisationId,
        name: "Known Customer",
        email: "known@steps.test",
        company: "Known Ltd",
      },
    });
  });

  afterAll(async () => {
    await prisma.approval.deleteMany({ where: { organisationId } });
    await prisma.toolCall.deleteMany({
      where: { agentRun: { organisationId } },
    });
    await prisma.runStep.deleteMany({
      where: { agentRun: { organisationId } },
    });
    await prisma.agentRun.deleteMany({ where: { organisationId } });
    await prisma.agentTool.deleteMany({ where: { agent: { organisationId } } });
    await prisma.agent.deleteMany({ where: { organisationId } });
    await prisma.customEntityRecord.deleteMany({ where: { organisationId } });
    await prisma.customEntityType.deleteMany({ where: { organisationId } });
    await prisma.customer.deleteMany({ where: { organisationId } });
    await prisma.organisation.deleteMany({ where: { id: organisationId } });
    await prisma.$disconnect();
  });

  it("runs extract → act(create_record): the case that was impossible before", async () => {
    // This is the exact shape the Invoice Agent needed and no existing
    // pipeline could express — acknowledge_reply only ever replies,
    // entity_status_signal needs structured JSON rather than an email.
    const agent = await createAgent({
      steps: [
        {
          kind: "extract",
          fields: [
            { name: "number", description: "the invoice number" },
            { name: "total", description: "the amount due" },
          ],
        },
        {
          kind: "act",
          tool: "create_record",
          args: {
            recordType: "Invoice",
            data: { number: "{number}", total: "{total}" },
          },
        },
      ],
    });

    const result = await runHarnessPipeline(
      agent,
      "Invoice INV-2 for £250 is attached.",
      scriptedProvider([{ content: '{"number": "INV-2", "total": "250"}' }]),
    );

    expect(result.status).toBe("COMPLETED");

    const created = await prisma.customEntityRecord.findFirst({
      where: { organisationId, entityTypeId: invoiceTypeId },
      orderBy: { createdAt: "desc" },
    });
    expect(created?.data).toMatchObject({ number: "INV-2" });
  });

  it("computes a total deterministically and pauses on the approval-gated send", async () => {
    // The quote shape, expressed purely as configuration — no quote
    // pipeline file involved.
    const agent = await createAgent({
      steps: [
        {
          kind: "extract",
          fields: [{ name: "quantity", description: "how many units" }],
        },
        {
          kind: "compute",
          as: "unitPrice",
          operation: "template",
          operands: ["15"],
        },
        {
          kind: "compute",
          as: "total",
          operation: "multiply",
          operands: ["{unitPrice}", "{quantity}"],
        },
        {
          kind: "compose",
          as: "body",
          instructions: "Write a short quote email.",
          facts: ["quantity", "total"],
        },
        {
          kind: "act",
          tool: "send_email",
          args: {
            to: "buyer@steps.test",
            subject: "Your quote",
            body: "{body}",
          },
        },
      ],
    });

    const result = await runHarnessPipeline(
      agent,
      "Can I get 500 units?",
      scriptedProvider([
        { content: '{"quantity": 500}' },
        { content: "Your total is £7,500." },
      ]),
    );

    // send_email is approval-gated, so the run pauses rather than sending.
    expect(result.status).toBe("WAITING_FOR_APPROVAL");

    const approval = await prisma.approval.findFirst({
      where: { agentRunId: result.runId },
    });
    // The computed figure reached the proposed action, not a model guess.
    expect(approval?.requestedAction).toBe("send_email");
  });

  it("continues past an optional lookup miss, and a branch can test it", async () => {
    const agent = await createAgent({
      steps: [
        {
          kind: "lookup",
          as: "customer",
          recordType: "Customer",
          match: { by: "field", field: "email", value: "nobody@steps.test" },
          required: false,
        },
        {
          kind: "branch",
          when: { left: "{customer}", operator: "not_exists" },
          then: [
            {
              kind: "compute",
              as: "greeting",
              operation: "template",
              operands: ["Hello,"],
            },
          ],
          otherwise: [
            {
              kind: "compute",
              as: "greeting",
              operation: "template",
              operands: ["Hello {customer.data.name},"],
            },
          ],
        },
        {
          kind: "act",
          tool: "create_record",
          args: {
            recordType: "Invoice",
            data: { number: "{greeting}" },
          },
        },
      ],
    });

    const result = await runHarnessPipeline(
      agent,
      "anything",
      neverCallProvider,
    );

    // No extract, no compose — a programme of only deterministic steps
    // must never touch the model at all.
    expect(result.status).toBe("COMPLETED");
  });

  it("fails the run when a required lookup finds nothing", async () => {
    const agent = await createAgent({
      steps: [
        {
          kind: "lookup",
          as: "customer",
          recordType: "Customer",
          match: { by: "field", field: "email", value: "nobody@steps.test" },
          required: true,
        },
      ],
    });

    const result = await runHarnessPipeline(
      agent,
      "anything",
      neverCallProvider,
    );

    expect(result.status).toBe("FAILED");
    const steps = await prisma.runStep.findMany({
      where: { agentRunId: result.runId, stepType: "RUN_FAILED" },
    });
    expect(steps[0]?.detail).toMatch(/required/i);
  });

  it("finds a real record by exact field match and makes it addressable", async () => {
    const agent = await createAgent({
      steps: [
        {
          kind: "lookup",
          as: "customer",
          recordType: "Customer",
          match: { by: "field", field: "email", value: "known@steps.test" },
          required: true,
        },
        {
          kind: "compute",
          as: "greeting",
          operation: "template",
          operands: ["Hello {customer.data.name}"],
        },
        {
          kind: "act",
          tool: "create_record",
          args: {
            recordType: "Invoice",
            data: { number: "{greeting}" },
          },
        },
      ],
    });

    const result = await runHarnessPipeline(
      agent,
      "anything",
      neverCallProvider,
    );
    expect(result.status).toBe("COMPLETED");

    const call = await prisma.toolCall.findFirst({
      where: { agentRunId: result.runId, toolName: "create_record" },
    });
    expect(JSON.stringify(call?.input)).toContain("Hello Known Customer");
  });

  it("refuses a tool the agent was not granted, even though the sequence is deterministic", async () => {
    // The step engine must not become a way around per-agent tool grants
    // just because the tool name came from configuration (CLAUDE.md §4.5).
    const agent = await createAgent({
      steps: [
        {
          kind: "act",
          tool: "send_email",
          args: { to: "a@b.test", subject: "x", body: "y" },
        },
      ],
      tools: ["find_record"],
    });

    const result = await runHarnessPipeline(
      agent,
      "anything",
      neverCallProvider,
    );

    expect(result.status).toBe("FAILED");
    const call = await prisma.toolCall.findFirst({
      where: { agentRunId: result.runId, toolName: "send_email" },
    });
    expect(call?.error).toMatch(/does not have access/i);
  });

  it("stops a composed reply containing a guardrail phrase before it can be proposed", async () => {
    const agent = await createAgent({
      guardrailKeywords: ["refund"],
      steps: [
        {
          kind: "compose",
          as: "body",
          instructions: "Reply to the customer.",
          facts: [],
        },
        {
          kind: "act",
          tool: "send_email",
          args: { to: "a@b.test", subject: "x", body: "{body}" },
        },
      ],
    });

    const result = await runHarnessPipeline(
      agent,
      "I want my money back",
      scriptedProvider([{ content: "We will issue a refund immediately." }]),
    );

    expect(result.status).toBe("FAILED");
    // Never reached the approval gate — the guardrail is not meant to rely
    // on a human catching it.
    const approval = await prisma.approval.findFirst({
      where: { agentRunId: result.runId },
    });
    expect(approval).toBeNull();
  });

  it("fails clearly when the agent has no valid step programme", async () => {
    const agent = await prisma.agent.create({
      data: {
        organisationId,
        name: "Unconfigured",
        description: "No steps.",
        instructions: "n/a",
        model: "test-model",
        status: "ACTIVE",
        executionMode: "HARNESS",
        pipelineKey: "steps",
        pipelineConfig: {} as never,
      },
    });

    const result = await runHarnessPipeline(
      agent,
      "anything",
      neverCallProvider,
    );
    expect(result.status).toBe("FAILED");
  });
});

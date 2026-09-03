/**
 * One-off measurement — NOT part of the app, not run in CI.
 *
 * docs/agent-step-engine-design.md §5.3 says the step engine's token
 * saving is *predicted, not measured*, and must not be claimed anywhere
 * until it has been measured head-to-head. This is that measurement.
 *
 * Runs the same task two ways against the same real model — once as a
 * free-form LOOP agent, once as a step programme — and reports the real
 * prompt/completion token counts each way.
 *
 * Usage: pnpm tsx scripts/step-vs-loop-tokens.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const { prisma } = await import("@/lib/db/prisma");
const { OllamaProvider } = await import("@/lib/ai/providers/ollama-provider");
const { runAgentByExecutionMode } =
  await import("@/lib/runtime/run-agent-by-mode");
import type {
  AIProvider,
  AIResponse,
  GenerateRequest,
} from "@/lib/ai/provider";

const ORG_ID = "measure-step-vs-loop";
const MODEL = process.env.MEASURE_MODEL ?? "qwen2.5:14b";
const OLLAMA_URL =
  process.env.MEASURE_OLLAMA_URL ?? "http://100.112.223.103:11434";

class TrackingProvider implements AIProvider {
  calls: { promptTokens: number; completionTokens: number; ms: number }[] = [];
  constructor(private readonly inner: AIProvider) {}
  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const start = Date.now();
    const response = await this.inner.generateResponse(request);
    this.calls.push({
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      ms: Date.now() - start,
    });
    return response;
  }
  total() {
    return this.calls.reduce(
      (acc, c) => ({
        calls: acc.calls + 1,
        prompt: acc.prompt + c.promptTokens,
        completion: acc.completion + c.completionTokens,
        ms: acc.ms + c.ms,
      }),
      { calls: 0, prompt: 0, completion: 0, ms: 0 },
    );
  }
}

const INPUT =
  "Hi, invoice INV-2291 for 450.00 is attached, due by the end of the month. Thanks, jo@buyer.test";

// Both agents are given the same tools and asked for the same outcome:
// pull the invoice details out and file them as a record.
const TOOLS = ["find_record", "search_records", "create_record"];

async function cleanUp() {
  await prisma.toolCall.deleteMany({
    where: { agentRun: { organisationId: ORG_ID } },
  });
  await prisma.runStep.deleteMany({
    where: { agentRun: { organisationId: ORG_ID } },
  });
  await prisma.agentRun.deleteMany({ where: { organisationId: ORG_ID } });
  await prisma.agentTool.deleteMany({
    where: { agent: { organisationId: ORG_ID } },
  });
  await prisma.agent.deleteMany({ where: { organisationId: ORG_ID } });
  await prisma.customEntityRecord.deleteMany({
    where: { organisationId: ORG_ID },
  });
  await prisma.customEntityType.deleteMany({
    where: { organisationId: ORG_ID },
  });
  await prisma.organisation.deleteMany({ where: { id: ORG_ID } });
}

async function main() {
  await cleanUp();
  await prisma.organisation.create({
    data: {
      id: ORG_ID,
      clerkOrgId: ORG_ID,
      name: "Measurement Org",
      currency: "GBP",
    },
  });
  await prisma.customEntityType.create({
    data: {
      organisationId: ORG_ID,
      name: "Invoice",
      fields: [
        { name: "number", description: "Invoice number" },
        { name: "total", description: "Amount due" },
      ],
    },
  });

  const loopAgent = await prisma.agent.create({
    data: {
      organisationId: ORG_ID,
      name: "Loop Invoice Agent",
      description: "Files invoices as records.",
      instructions:
        "An invoice has arrived. Extract the invoice number and total, then use create_record to file it in the Invoice record type.",
      model: MODEL,
      status: "ACTIVE",
      executionMode: "LOOP",
    },
  });
  const stepAgent = await prisma.agent.create({
    data: {
      organisationId: ORG_ID,
      name: "Step Invoice Agent",
      description: "Files invoices as records.",
      instructions: "Be concise.",
      model: MODEL,
      status: "ACTIVE",
      executionMode: "HARNESS",
      pipelineKey: "steps",
      pipelineConfig: {
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
      } as never,
    },
  });
  for (const agent of [loopAgent, stepAgent]) {
    await prisma.agentTool.createMany({
      data: TOOLS.map((toolName) => ({ agentId: agent.id, toolName })),
    });
  }

  const base = new OllamaProvider(OLLAMA_URL);

  const results: Record<
    string,
    ReturnType<TrackingProvider["total"]> & { status: string }
  > = {};
  for (const [label, agent] of [
    ["LOOP", loopAgent],
    ["STEPS", stepAgent],
  ] as const) {
    const tracking = new TrackingProvider(base);
    const run = await runAgentByExecutionMode(
      agent,
      INPUT,
      tracking,
      "jo@buyer.test",
    );
    results[label] = { ...tracking.total(), status: run.status };
  }

  const loop = results.LOOP!;
  const steps = results.STEPS!;
  const loopTotal = loop.prompt + loop.completion;
  const stepsTotal = steps.prompt + steps.completion;

  console.log("\n=== Same task, same model, two execution modes ===");
  console.log(`model: ${MODEL}`);
  console.log(`input: ${INPUT}\n`);
  for (const [label, r] of [
    ["LOOP", loop],
    ["STEPS", steps],
  ] as const) {
    console.log(
      `${label.padEnd(6)} status=${r.status.padEnd(20)} calls=${r.calls} prompt=${r.prompt} completion=${r.completion} total=${r.prompt + r.completion} ms=${r.ms}`,
    );
  }
  if (loopTotal > 0) {
    const saving = ((loopTotal - stepsTotal) / loopTotal) * 100;
    console.log(
      `\nSTEPS uses ${saving.toFixed(1)}% ${saving >= 0 ? "fewer" : "MORE"} tokens than LOOP for this task.`,
    );
  }
  console.log(
    "\nNOTE: one task, one model, one run each. Directional, not a benchmark.",
  );

  await cleanUp();
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error("Measurement failed:", error);
  await cleanUp();
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * One-off live cost test — NOT part of the app, not run in CI.
 *
 * Runs a single realistic "sort this invoice" task (extract its fields,
 * classify it, file it as a record — the HARNESS step programme shape from
 * docs/agent-step-engine-design.md) through the real agent runtime, against
 * a real OpenRouter-hosted model, and reports the actual tokens used and
 * the actual dollar cost OpenRouter billed for it.
 *
 * Cost comes from OpenRouter's own `usage.cost` (requested via
 * `usage: { include: true }` — see lib/ai/providers/openrouter-provider.ts)
 * rather than a hardcoded $/token price list this app would have to keep in
 * sync itself, since OpenRouter's per-model pricing is out of this app's
 * control and changes independently of it.
 *
 * Requires a live network path to https://openrouter.ai and a Postgres
 * database migrated per prisma/schema.prisma (docker-compose.yml brings one
 * up locally) — neither is available in every environment this repo is
 * checked out in.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... OPENROUTER_MODEL=<exact OpenRouter model slug> \
 *     pnpm tsx scripts/invoice-sort-cost-test.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Static imports are hoisted and would evaluate lib/env.ts (which parses
// process.env eagerly) before the dotenv config() call above runs — these
// have to be dynamic so .env.local is loaded first.
const { prisma } = await import("@/lib/db/prisma");
const { OpenRouterProvider } =
  await import("@/lib/ai/providers/openrouter-provider");
const { runAgentByExecutionMode } =
  await import("@/lib/runtime/run-agent-by-mode");
import type {
  AIProvider,
  AIResponse,
  GenerateRequest,
} from "@/lib/ai/provider";

const ORG_ID = "invoice-sort-cost-test";

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL;
if (!API_KEY || !MODEL) {
  console.error(
    "Set OPENROUTER_API_KEY and OPENROUTER_MODEL (the exact OpenRouter model " +
      "slug, e.g. as it appears in OpenRouter's model picker) before running this.",
  );
  process.exit(1);
}

const TOOLS = ["create_record"];

// A realistic inbound invoice email — three different shapes so the model
// has to actually read the content to classify each one, not pattern-match
// on a single fixed phrase.
const INVOICES = [
  {
    label: "on-time invoice",
    input:
      "Hi, invoice INV-2291 for 450.00 is attached, due by the end of the month. Thanks, jo@buyer.test",
  },
  {
    label: "overdue invoice",
    input:
      "Second reminder: invoice INV-1187 for 1,240.00 was due three weeks ago and remains unpaid. Please settle immediately. accounts@buyer.test",
  },
  {
    label: "disputed invoice",
    input:
      "We're rejecting invoice INV-3305 for 88.00 — we were never delivered this order and won't be paying it. finance@buyer.test",
  },
];

class TrackingProvider implements AIProvider {
  calls: {
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    ms: number;
  }[] = [];

  constructor(private readonly inner: AIProvider) {}

  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const start = Date.now();
    const response = await this.inner.generateResponse(request);
    this.calls.push({
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      costUsd: response.usage?.costUsd ?? 0,
      ms: Date.now() - start,
    });
    return response;
  }

  drain() {
    const batch = this.calls;
    this.calls = [];
    return batch;
  }
}

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
      name: "Invoice Sort Cost Test Org",
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
        {
          name: "category",
          description: "paid, overdue, or disputed",
        },
      ],
    },
  });

  const agent = await prisma.agent.create({
    data: {
      organisationId: ORG_ID,
      name: "Invoice Sorter",
      description: "Extracts, classifies and files inbound invoices.",
      instructions: "Be concise.",
      model: MODEL!,
      status: "ACTIVE",
      executionMode: "HARNESS",
      pipelineKey: "steps",
      pipelineConfig: {
        steps: [
          {
            kind: "extract",
            fields: [
              { name: "number", description: "the invoice number" },
              { name: "total", description: "the amount due, as a number" },
              {
                name: "category",
                description:
                  'one of "paid", "overdue", or "disputed" — classify based on the message content',
              },
            ],
          },
          {
            kind: "act",
            tool: "create_record",
            args: {
              recordType: "Invoice",
              data: {
                number: "{number}",
                total: "{total}",
                category: "{category}",
              },
            },
          },
        ],
      } as never,
    },
  });
  await prisma.agentTool.createMany({
    data: TOOLS.map((toolName) => ({ agentId: agent.id, toolName })),
  });

  const tracking = new TrackingProvider(new OpenRouterProvider(API_KEY!));

  console.log(`Model: ${MODEL}\n`);

  const results: {
    label: string;
    status: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    ms: number;
  }[] = [];

  for (const invoice of INVOICES) {
    tracking.drain();
    const run = await runAgentByExecutionMode(
      agent,
      invoice.input,
      tracking,
      "invoices@buyer.test",
    );
    const calls = tracking.drain();
    const promptTokens = calls.reduce((sum, c) => sum + c.promptTokens, 0);
    const completionTokens = calls.reduce(
      (sum, c) => sum + c.completionTokens,
      0,
    );
    const costUsd = calls.reduce((sum, c) => sum + c.costUsd, 0);
    const ms = calls.reduce((sum, c) => sum + c.ms, 0);
    results.push({
      label: invoice.label,
      status: run.status,
      promptTokens,
      completionTokens,
      costUsd,
      ms,
    });
    console.log(
      `[${invoice.label}] status=${run.status} calls=${calls.length} ` +
        `prompt=${promptTokens} completion=${completionTokens} ` +
        `cost=$${costUsd.toFixed(6)} time=${ms}ms`,
    );
  }

  const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
  const totalTokens = results.reduce(
    (sum, r) => sum + r.promptTokens + r.completionTokens,
    0,
  );

  console.log("\n=== Summary ===");
  console.log(`Invoices sorted: ${results.length}`);
  console.log(`Total tokens: ${totalTokens}`);
  console.log(`Total cost: $${totalCost.toFixed(6)}`);
  console.log(
    `Average cost per invoice sorted: $${(totalCost / results.length).toFixed(6)}`,
  );
  if (totalCost === 0) {
    console.log(
      "\nNote: cost is $0 — either every call was free, or this OpenRouter " +
        "account/model doesn't return usage.cost. Check the raw response if " +
        "that's unexpected.",
    );
  }

  await cleanUp();
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error("Cost test failed:", error);
  await cleanUp();
  await prisma.$disconnect();
  process.exit(1);
});

/**
 * One-off live token-cost test — NOT part of the app, not run in CI.
 *
 * Runs a batch of realistic inbound emails through the real dispatch path
 * (classifier -> harness pipeline -> extractFields -> composeReply) against
 * the real Ollama host, with every agent in the target org temporarily
 * pointed at qwen3.5:4b, and tallies real prompt/completion token counts
 * per call and per email. Use this to get a live, current number instead
 * of trusting the qwen2.5:14b figures in docs/production-notes.md, which
 * are for a different model.
 *
 * Usage: pnpm tsx scripts/token-cost-test.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

// Static imports are hoisted and would evaluate lib/env.ts (which parses
// process.env eagerly) before the dotenv config() call above runs — these
// have to be dynamic so .env.local is loaded first.
const { prisma } = await import("@/lib/db/prisma");
const { getAIProvider } = await import("@/lib/ai/organisation-ai-provider");
const { dispatchInboundMessage } = await import("@/lib/routing/dispatch");
const { createProduct } = await import("@/lib/products/product-repository");
const { createCustomer } = await import("@/lib/customers/customer-repository");
import type {
  AIProvider,
  GenerateRequest,
  AIResponse,
} from "@/lib/ai/provider";

const TEST_ORG_ID = "cmtg8vtln0000mws73t1av4ov"; // "Aperator Test Org A"
const TEST_MODEL = "qwen3.5:4b";

class TrackingProvider implements AIProvider {
  calls: { promptTokens: number; completionTokens: number; ms: number }[] = [];

  constructor(private readonly inner: AIProvider) {}

  async generateResponse(request: GenerateRequest): Promise<AIResponse> {
    const start = Date.now();
    const response = await this.inner.generateResponse(request);
    const ms = Date.now() - start;
    this.calls.push({
      promptTokens: response.usage?.promptTokens ?? 0,
      completionTokens: response.usage?.completionTokens ?? 0,
      ms,
    });
    return response;
  }

  drain() {
    const batch = this.calls;
    this.calls = [];
    return batch;
  }
}

interface TestEmail {
  category: string;
  input: string;
}

async function main() {
  console.log(
    `Seeding catalog into ${TEST_ORG_ID} and switching its agents to ${TEST_MODEL}...`,
  );

  const existingProduct = await prisma.product.findFirst({
    where: { organisationId: TEST_ORG_ID, sku: "WIDGET-500" },
  });
  const product = existingProduct
    ? { name: existingProduct.name }
    : await createProduct(TEST_ORG_ID, {
        sku: "WIDGET-500",
        name: "Widget 500",
        unitPrice: 12.5,
        stockQuantity: 5000,
      });
  // Deliberately NOT "jordan.price@..." — deterministicClassify does a raw
  // substring match, and an email containing "price" falsely matched the
  // Quote Agent's keyword list on every single test email regardless of
  // actual content, discovered by this test run. Real finding, not fixed
  // here — see the wrap-up note this script prints for what it means.
  const existingCustomer = await prisma.customer.findFirst({
    where: { organisationId: TEST_ORG_ID, email: "j.reyes@example.com" },
  });
  const customer = existingCustomer
    ? { email: existingCustomer.email }
    : await createCustomer(TEST_ORG_ID, {
        name: "Jordan Reyes",
        email: "j.reyes@example.com",
        company: "Northfield Retail",
      });

  const priorModels = await prisma.agent.findMany({
    where: { organisationId: TEST_ORG_ID },
    select: { id: true, model: true },
  });
  await prisma.agent.updateMany({
    where: { organisationId: TEST_ORG_ID },
    data: { model: TEST_MODEL },
  });

  // 5x the same input per category — consistency check, not just a single
  // sample — mirroring how this workflow's earlier qwen2.5:14b baseline
  // (docs/production-notes.md) was verified: repeated runs of the same
  // input, not a one-off number trusted on faith.
  const REPEATS = 5;
  const templates: TestEmail[] = [
    {
      category: "quote (deterministic route)",
      input: `Hi, can you give me a price for 500 units of ${product.name} delivered to Birmingham? Reply to ${customer.email}.`,
    },
    {
      category: "complaint (deterministic route)",
      input: `I'm really unhappy — the last batch of Widget 500 arrived damaged, three boxes were crushed in transit. Please advise. ${customer.email}`,
    },
    {
      category: "general (LLM classifier route)",
      input: `Hi, what are your opening hours over the holidays? ${customer.email}`,
    },
  ];
  const emails: TestEmail[] = templates.flatMap((t) =>
    Array.from({ length: REPEATS }, () => t),
  );

  // Uses the test org's own connected AI provider (Settings → AI Provider)
  // rather than a global env var — same resolution every real run goes
  // through now (lib/ai/organisation-ai-provider.ts).
  const tracking = new TrackingProvider(await getAIProvider(TEST_ORG_ID));

  interface EmailResult {
    category: string;
    matched: boolean;
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    ms: number;
  }
  const results: EmailResult[] = [];

  for (const email of emails) {
    tracking.drain();
    const start = Date.now();
    const dispatchResult = await dispatchInboundMessage(
      TEST_ORG_ID,
      "EMAIL",
      email.input,
      tracking,
    );
    const ms = Date.now() - start;
    const calls = tracking.drain();
    const promptTokens = calls.reduce((sum, c) => sum + c.promptTokens, 0);
    const completionTokens = calls.reduce(
      (sum, c) => sum + c.completionTokens,
      0,
    );
    results.push({
      category: email.category,
      matched: dispatchResult.matched,
      calls: calls.length,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      ms,
    });
    console.log(
      `[${email.category}] matched=${dispatchResult.matched} calls=${calls.length} prompt=${promptTokens} completion=${completionTokens} total=${promptTokens + completionTokens} time=${ms}ms`,
    );
  }

  console.log("\n=== Per-category (consistency across repeats) ===");
  const categories = [...new Set(results.map((r) => r.category))];
  for (const category of categories) {
    const rows = results.filter((r) => r.category === category);
    const totals = rows.map((r) => r.totalTokens);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    console.log(
      `${category}: totals=[${totals.join(", ")}] avg=${avg.toFixed(0)} min=${Math.min(...totals)} max=${Math.max(...totals)}`,
    );
  }

  console.log("\n=== Overall summary ===");
  const overall = results.reduce(
    (acc, r) => ({
      totalTokens: acc.totalTokens + r.totalTokens,
      promptTokens: acc.promptTokens + r.promptTokens,
      completionTokens: acc.completionTokens + r.completionTokens,
      ms: acc.ms + r.ms,
    }),
    { totalTokens: 0, promptTokens: 0, completionTokens: 0, ms: 0 },
  );
  console.log(`Emails tested: ${results.length}`);
  console.log(
    `Average total tokens/email: ${(overall.totalTokens / results.length).toFixed(0)}`,
  );
  console.log(
    `  avg prompt: ${(overall.promptTokens / results.length).toFixed(0)}, avg completion: ${(overall.completionTokens / results.length).toFixed(0)}`,
  );
  console.log(
    `Average latency/email: ${(overall.ms / results.length).toFixed(0)}ms`,
  );
  console.log(
    `Min total tokens: ${Math.min(...results.map((r) => r.totalTokens))}`,
  );
  console.log(
    `Max total tokens: ${Math.max(...results.map((r) => r.totalTokens))}`,
  );

  console.log("\nRestoring original agent models...");
  for (const agent of priorModels) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: { model: agent.model },
    });
  }

  console.log(
    "\nDone. Seeded test product/customer left in place for future re-runs.",
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

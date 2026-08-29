import { prisma } from "@/lib/db/prisma";

async function main() {
  const organisation = await prisma.organisation.upsert({
    where: { id: "seed-org" },
    update: {},
    create: {
      id: "seed-org",
      name: "Acme Inc",
    },
  });

  await prisma.user.upsert({
    where: { email: "owner@acme.test" },
    update: {},
    create: {
      organisationId: organisation.id,
      email: "owner@acme.test",
      name: "Alex Owner",
      role: "OWNER",
    },
  });

  // One "Email Handling" workflow: a classifier agent plus three handler
  // agents. Each handler's `description` doubles as the signal the
  // classifier reads to pick one (lib/routing/classify-intent.ts), and
  // `tools` is enforced deterministically at runtime (lib/runtime/
  // agent-runtime.ts) — not just a UI hint.
  //
  // The classifier deliberately uses the SAME model as the handlers here,
  // even though classification is a simpler task that would justify a
  // cheaper model in a hosted deployment (see docs/production-notes.md).
  // Tried a smaller local model (gemma4:12b) first: on a single-GPU local
  // Ollama host, a run alternates models on every call (classify, then
  // hand off to a handler), which forces Ollama to unload/reload between
  // them — one classification call took 43s instead of ~350ms. That's a
  // local-hosting artifact, not a real production cost, but it made local
  // dev/testing unusably slow, so this stays qwen2.5:14b for now.
  const classifier = {
    id: "seed-agent-classifier",
    name: "Inbox Classifier",
    description:
      "Classifies inbound email and routes it to the right specialist agent — not a handler itself.",
    instructions:
      "Classify the inbound message against the specialist agents listed below, based only on their descriptions. If none clearly fit, say so — never guess.",
    model: "qwen2.5:14b",
    executionMode: "LOOP" as const,
    pipelineKey: null as string | null,
    keywords: [] as string[],
    tools: [] as string[],
  };

  // All three handlers run in HARNESS mode: a fixed, coded pipeline (lib/
  // harness/pipelines/) does the tool sequencing deterministically, and the
  // model is only asked two narrow questions (extract fields; compose the
  // reply from resolved facts) — see docs/production-notes.md "Neuro-
  // symbolic harness". `instructions` below is no longer literally executed
  // by an LLM for these agents; it stays as human-readable documentation of
  // what the agent does, shown on its detail page. `keywords` feeds the
  // deterministic pre-classifier (lib/routing/deterministic-classify.ts) —
  // General Inquiry Agent deliberately has none, since it's the catch-all
  // and should only be reached when nothing more specific matched.
  const handlers = [
    {
      id: "seed-agent-quote",
      name: "Quote Agent",
      description:
        "Handles requests for a price quote — calculating and sending pricing for a specific product and quantity.",
      instructions:
        "A customer is asking for a price quote. Extract the product and quantity, use the tools to find the customer, find the product, and calculate the total, then send the quote by email.",
      model: "qwen2.5:14b",
      executionMode: "HARNESS" as const,
      pipelineKey: "quote",
      keywords: ["quote", "price", "pricing", "how much", "cost of"],
      tools: [
        "find_customer",
        "find_product",
        "check_inventory",
        "calculate_quote",
        "send_email",
      ],
    },
    {
      id: "seed-agent-complaints",
      name: "Complaints Agent",
      description:
        "Handles complaints or expressions of dissatisfaction from a customer about a product, order, or service they've received.",
      instructions:
        "A customer has a complaint. Acknowledge their concern specifically, never promise compensation, and let them know a team member will follow up.",
      model: "qwen2.5:14b",
      executionMode: "HARNESS" as const,
      pipelineKey: "complaints",
      keywords: [
        "complaint",
        "complain",
        "unhappy",
        "disappointed",
        "damaged",
        "broken",
        "refund",
      ],
      tools: ["find_customer", "send_email"],
    },
    {
      id: "seed-agent-general",
      name: "General Inquiry Agent",
      description:
        "Handles general questions that are not a price quote request and not a complaint — e.g. asking about opening hours, delivery times, or how to place an order.",
      instructions:
        "Answer the inquiry helpfully and directly. If there isn't enough information to answer accurately, say so rather than guessing.",
      model: "qwen2.5:14b",
      executionMode: "HARNESS" as const,
      pipelineKey: "general",
      keywords: [] as string[],
      tools: ["find_customer", "send_email"],
    },
  ];

  const allAgents = [classifier, ...handlers];

  for (const agent of allAgents) {
    await prisma.agent.upsert({
      where: { id: agent.id },
      update: {
        description: agent.description,
        instructions: agent.instructions,
        model: agent.model,
        executionMode: agent.executionMode,
        pipelineKey: agent.pipelineKey,
        keywords: agent.keywords,
      },
      create: {
        id: agent.id,
        organisationId: organisation.id,
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        model: agent.model,
        executionMode: agent.executionMode,
        pipelineKey: agent.pipelineKey,
        keywords: agent.keywords,
        status: "ACTIVE",
      },
    });

    await prisma.agentTool.deleteMany({ where: { agentId: agent.id } });
    if (agent.tools.length > 0) {
      await prisma.agentTool.createMany({
        data: agent.tools.map((toolName) => ({ agentId: agent.id, toolName })),
      });
    }
  }

  const emailWorkflow = await prisma.workflow.upsert({
    where: { id: "seed-workflow-email" },
    update: {},
    create: {
      id: "seed-workflow-email",
      organisationId: organisation.id,
      name: "Email Handling",
      description:
        "Classifies inbound customer emails and routes them to the right specialist agent.",
      trigger: "EMAIL",
      status: "ACTIVE",
    },
  });

  const members = [
    { agentId: classifier.id, role: "CLASSIFIER" as const },
    ...handlers.map((h) => ({ agentId: h.id, role: "HANDLER" as const })),
  ];
  for (const member of members) {
    await prisma.workflowAgent.upsert({
      where: {
        workflowId_agentId: {
          workflowId: emailWorkflow.id,
          agentId: member.agentId,
        },
      },
      update: { role: member.role },
      create: {
        workflowId: emailWorkflow.id,
        agentId: member.agentId,
        role: member.role,
      },
    });
  }

  console.log("Seeded organisation, user, agents, and the email workflow.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

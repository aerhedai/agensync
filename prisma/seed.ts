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

  // Shared by every handler agent below, kept as short as the safety
  // properties allow — this text is resent on every single LLM call in a
  // run, so its length is a direct, repeated cost (see docs/
  // production-notes.md "Token/cost optimization"). Covers two directives
  // learned the hard way during live testing: (1) call the tool, don't
  // draft text and ask permission — approval is already deterministic at
  // the runtime level; (2) never send twice — the model has been observed
  // re-attempting send_email after it already succeeded, which the
  // approval gate correctly re-blocks, but it's wasted turns/tokens to
  // prompt for in the first place.
  const sendEmailInstruction =
    "Once you've decided a reply is needed, call send_email — never draft it as plain text and ask permission; a human reviews the content before it sends, so just call the tool. Never call send_email more than once per conversation.";

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
    tools: [] as string[],
  };

  const handlers = [
    {
      id: "seed-agent-quote",
      name: "Quote Agent",
      description:
        "Handles requests for a price quote — calculating and sending pricing for a specific product and quantity.",
      instructions:
        // The opening sentence isn't decoration — it's load-bearing. An
        // earlier trim that removed it (jumping straight to "Extract the
        // product...") was A/B tested head to head against this version on
        // the same input: 4/4 failures without it (the model wrote its
        // tool call as text instead of a real one — see agent-runtime.ts's
        // looksLikeAbortedToolCall) vs 4/4 successes with it restored. The
        // rest of the trim (this sentence's own wording, sendEmailInstruction,
        // the retry/placeholder clause below) tested fine either way.
        "A customer is asking for a price quote. Extract the product and quantity, use the tools to find the customer, find the product, and calculate the total. " +
        sendEmailInstruction +
        " If a tool call fails, retry with corrected arguments — never send a placeholder, estimate, or made-up figure instead of a real result.",
      model: "qwen2.5:14b",
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
        // Same "restore the opening framing sentence" fix validated for
        // Quote Agent above — this trim removed the same kind of sentence
        // ("A customer has a complaint."), so it's restored here too on
        // the same evidence rather than waiting to independently observe
        // the same failure mode on this agent.
        "A customer has a complaint. Acknowledge their concern specifically — reference what they're unhappy about, don't reply generically. Never promise a refund, replacement, discount, or other compensation, and don't try to resolve the complaint yourself — just say a team member will follow up. " +
        sendEmailInstruction,
      model: "qwen2.5:14b",
      tools: ["find_customer", "send_email"],
    },
    {
      id: "seed-agent-general",
      name: "General Inquiry Agent",
      description:
        "Handles general questions that are not a price quote request and not a complaint — e.g. asking about opening hours, delivery times, or how to place an order.",
      instructions:
        "Answer the inquiry helpfully and directly. If you lack enough information to answer accurately, say so rather than guessing. " +
        sendEmailInstruction,
      model: "qwen2.5:14b",
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
      },
      create: {
        id: agent.id,
        organisationId: organisation.id,
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        model: agent.model,
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

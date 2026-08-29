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

  // Shared by every handler agent below: enforces that "done" means calling
  // the tool, not drafting text and asking permission — approval already
  // happens deterministically at the runtime level (send_email is always
  // gated), so the agent doesn't need to ask itself.
  const sendEmailInstruction =
    "Once you've decided a reply is needed, call send_email with that reply as your action — do not just draft the email as plain text and ask whether to send it; calling the tool is how you complete the task. A human always reviews the exact content before it's actually sent, so you don't need to ask permission yourself — just call the tool with your best, complete reply.";

  // One "Email Handling" workflow: a classifier agent plus three handler
  // agents. Each handler's `description` doubles as the signal the
  // classifier reads to pick one (lib/routing/classify-intent.ts), and
  // `tools` is enforced deterministically at runtime (lib/runtime/
  // agent-runtime.ts) — not just a UI hint.
  const classifier = {
    id: "seed-agent-classifier",
    name: "Inbox Classifier",
    description:
      "Classifies inbound email and routes it to the right specialist agent — not a handler itself.",
    instructions:
      "You are an email triage classifier for this business. Read the inbound message and decide which single specialist agent should handle it, based only on what each agent is described as handling. Do not guess if none of them are a clear fit.",
    tools: [] as string[],
  };

  const handlers = [
    {
      id: "seed-agent-quote",
      name: "Quote Agent",
      description:
        "Handles requests for a price quote — calculating and sending pricing for a specific product and quantity.",
      instructions:
        "A customer is asking for a price quote. Extract the product and quantity, use the available tools to look up customer and product details and calculate the total. " +
        sendEmailInstruction +
        " If a tool call fails or doesn't return the number you need, retry it with corrected arguments before replying. Never send an email containing a placeholder, estimate, or made-up figure in place of a real tool result — get the real number first, or explain the problem instead of quoting a price.",
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
        "A customer has a complaint. Acknowledge their concern politely and specifically — reference what they're actually unhappy about, don't reply generically. " +
        "Do not promise a refund, replacement, discount, or any other compensation, and do not attempt to resolve the substance of the complaint yourself — just acknowledge it and say a member of the team will follow up. " +
        sendEmailInstruction,
      tools: ["find_customer", "send_email"],
    },
    {
      id: "seed-agent-general",
      name: "General Inquiry Agent",
      description:
        "Handles general questions that are not a price quote request and not a complaint — e.g. asking about opening hours, delivery times, or how to place an order.",
      instructions:
        "Answer the inquiry helpfully and directly using send_email. If you don't have enough information available to answer accurately, say so honestly rather than guessing. " +
        sendEmailInstruction,
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
      },
      create: {
        id: agent.id,
        organisationId: organisation.id,
        name: agent.name,
        description: agent.description,
        instructions: agent.instructions,
        model: "qwen2.5:14b",
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

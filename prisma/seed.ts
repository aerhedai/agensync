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

  const quoteAgentInstructions =
    "Read incoming messages and work out what's actually being asked before acting. " +
    "If it's a request for a price quote, extract the customer, product and quantity, use the available tools to look up customer and product details, and never send a quote above £10,000 without approval. " +
    "If it's some other kind of business inquiry that needs a reply, respond directly and helpfully using send_email — don't force it through the quoting tools if a quote isn't what's being asked for. " +
    "If the message doesn't need a reply at all (e.g. a newsletter or unrelated notification), take no action. " +
    "Once you've decided a reply is needed, call send_email immediately with that reply — never draft the email as plain text and ask whether to send it. There is no one to ask; sending is the final step of the task. " +
    "If a tool call fails or doesn't return the number you need, retry it with corrected arguments before replying. Never send an email containing a placeholder, estimate, or made-up figure in place of a real tool result — get the real number first, or explain the problem instead of quoting a price.";

  await prisma.agent.upsert({
    where: { id: "seed-agent-quote" },
    update: {
      description:
        "Processes incoming quote requests and other customer inquiries.",
      instructions: quoteAgentInstructions,
    },
    create: {
      id: "seed-agent-quote",
      organisationId: organisation.id,
      name: "Quote Agent",
      description:
        "Processes incoming quote requests and other customer inquiries.",
      instructions: quoteAgentInstructions,
      model: "qwen2.5:14b",
      status: "ACTIVE",
    },
  });

  console.log("Seeded organisation, user, and agent.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

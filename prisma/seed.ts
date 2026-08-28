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

  await prisma.agent.upsert({
    where: { id: "seed-agent-quote" },
    update: {},
    create: {
      id: "seed-agent-quote",
      organisationId: organisation.id,
      name: "Quote Agent",
      description: "Processes incoming quote requests.",
      instructions:
        "Read quote requests and extract the relevant information. Use the available tools to retrieve customer and product information. Never send a quote above £10,000 without approval.",
      model: "llama3",
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

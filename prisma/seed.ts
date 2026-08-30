import { prisma } from "@/lib/db/prisma";
import { provisionEmailWorkflow } from "@/lib/workflows/provision-email-workflow";

async function main() {
  // Two organisations, deliberately different across every dimension the
  // Email Handling workflow can now be configured on — currency, catalog,
  // business name (hence the compose sign-off) — as the concrete, live
  // proof that provisionEmailWorkflow() is genuinely reusable per business,
  // not just refactored-and-still-only-called-once, and that two
  // businesses stay correctly isolated (no shared catalog, no cross-org
  // data bleed).

  const acme = await prisma.organisation.upsert({
    where: { id: "seed-org" },
    update: {},
    create: { id: "seed-org", name: "Acme Inc" },
  });
  await prisma.user.upsert({
    where: { email: "owner@acme.test" },
    update: {},
    create: {
      organisationId: acme.id,
      email: "owner@acme.test",
      name: "Alex Owner",
      role: "OWNER",
    },
  });
  await provisionEmailWorkflow({
    organisationId: acme.id,
    currency: "GBP",
    model: "qwen2.5:14b",
    quoteKeywords: ["quote", "price", "pricing", "how much", "cost of"],
    complaintsKeywords: [
      "complaint",
      "complain",
      "unhappy",
      "disappointed",
      "damaged",
      "broken",
      "refund",
    ],
    products: [
      { sku: "WIDGET-A", name: "Product A", unitPrice: 15, stockQuantity: 700 },
      {
        sku: "WIDGET-B",
        name: "Product B",
        unitPrice: 42.5,
        stockQuantity: 120,
      },
    ],
    customers: [
      {
        name: "Customer ABC",
        email: "buyer@customer-abc.test",
        company: "Customer ABC Ltd",
      },
      {
        name: "Priya Shah",
        email: "priya@globex.test",
        company: "Globex Corp",
      },
    ],
  });

  const northwind = await prisma.organisation.upsert({
    where: { id: "seed-org-2" },
    update: {},
    create: { id: "seed-org-2", name: "Northwind Fasteners" },
  });
  await prisma.user.upsert({
    where: { email: "owner@northwind.test" },
    update: {},
    create: {
      organisationId: northwind.id,
      email: "owner@northwind.test",
      name: "Jordan Owner",
      role: "OWNER",
    },
  });
  await provisionEmailWorkflow({
    organisationId: northwind.id,
    currency: "USD",
    model: "qwen2.5:14b",
    quoteKeywords: ["quote", "price", "pricing", "how much", "cost of"],
    complaintsKeywords: [
      "complaint",
      "complain",
      "unhappy",
      "disappointed",
      "damaged",
      "broken",
      "refund",
    ],
    products: [
      {
        sku: "BOLT-M8",
        name: "M8 Steel Bolt (100-pack)",
        unitPrice: 8.25,
        stockQuantity: 2400,
      },
      {
        sku: "BRKT-A1",
        name: "Aluminium Bracket",
        unitPrice: 23.0,
        stockQuantity: 340,
      },
    ],
    customers: [
      {
        name: "Dana Wallace",
        email: "dana@ferrousworks.test",
        company: "Ferrousworks Ltd",
      },
      {
        name: "Sam Okafor",
        email: "sam@buildright.test",
        company: "BuildRight Co",
      },
    ],
  });

  console.log(
    `Seeded two organisations:\n` +
      `  Acme Inc (GBP):             ${acme.id}\n` +
      `  Northwind Fasteners (USD):  ${northwind.id}\n` +
      `No org-switcher UI exists yet — getCurrentOrganisation() resolves the ` +
      `first organisation (Acme Inc). Use these ids directly (Prisma Studio, ` +
      `a script, or a temporary query) to inspect or exercise the second one.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

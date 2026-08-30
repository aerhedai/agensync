import { prisma } from "@/lib/db/prisma";
import type { CustomerInput } from "@/lib/customers/schemas";

export function findCustomersByOrganisation(organisationId: string) {
  return prisma.customer.findMany({
    where: { organisationId },
    orderBy: { createdAt: "desc" },
  });
}

// Case-insensitive substring match on name, email, or company, mirroring
// the old mock-data.ts .find() behaviour.
export function searchCustomers(organisationId: string, query: string) {
  return prisma.customer.findMany({
    where: {
      organisationId,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { company: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
  });
}

export function createCustomer(organisationId: string, input: CustomerInput) {
  return prisma.customer.create({
    data: { ...input, organisationId },
  });
}

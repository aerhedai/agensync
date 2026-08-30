import { prisma } from "@/lib/db/prisma";
import type { Product } from "@/lib/generated/prisma/client";
import type { ProductInput } from "@/lib/products/schemas";

export interface ResolvedProduct {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
  stockQuantity: number;
}

// Decimal -> number conversion happens here, and only here — nothing above
// the repository layer (tool handlers, pipelines, Zod schemas) ever touches
// a raw Prisma Decimal instance, which keeps the one place money could
// silently drift or serialize wrong (e.g. into a customer-facing email) to
// a single, easy-to-audit spot.
function toResolved(product: Product): ResolvedProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    unitPrice: product.unitPrice.toNumber(),
    stockQuantity: product.stockQuantity,
  };
}

export async function findProductsByOrganisation(
  organisationId: string,
): Promise<ResolvedProduct[]> {
  const products = await prisma.product.findMany({
    where: { organisationId },
    orderBy: { createdAt: "desc" },
  });
  return products.map(toResolved);
}

export async function findProductById(
  organisationId: string,
  id: string,
): Promise<ResolvedProduct | null> {
  const product = await prisma.product.findFirst({
    where: { id, organisationId },
  });
  return product ? toResolved(product) : null;
}

// Case-insensitive substring match on name or SKU, mirroring the old
// mock-data.ts .find() behaviour — first match wins, callers that want
// "the" match just take searchProducts(...)[0].
export async function searchProducts(
  organisationId: string,
  query: string,
): Promise<ResolvedProduct[]> {
  const products = await prisma.product.findMany({
    where: {
      organisationId,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { sku: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { name: "asc" },
  });
  return products.map(toResolved);
}

export async function createProduct(
  organisationId: string,
  input: ProductInput,
): Promise<ResolvedProduct> {
  const product = await prisma.product.create({
    data: { ...input, organisationId },
  });
  return toResolved(product);
}

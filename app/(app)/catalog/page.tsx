import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import * as customerRepository from "@/lib/customers/customer-repository";
import * as entityTypeService from "@/lib/entities/entity-type-service";
import * as productRepository from "@/lib/products/product-repository";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const organisation = await getCurrentOrganisation();
  const [products, customers, entityTypes] = await Promise.all([
    productRepository.findProductsByOrganisation(organisation.id),
    customerRepository.findCustomersByOrganisation(organisation.id),
    entityTypeService.listEntityTypes(organisation.id),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Catalog</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/catalog/products">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="font-medium">Products</span>
              <span className="text-sm text-muted-foreground">
                {products.length} product{products.length === 1 ? "" : "s"} —
                what agents find with find_record and search_records.
              </span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/catalog/customers">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="font-medium">Customers</span>
              <span className="text-sm text-muted-foreground">
                {customers.length} customer{customers.length === 1 ? "" : "s"} —
                what agents find with find_record and search_records.
              </span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/catalog/entities">
          <Card className="transition-colors hover:border-primary/40">
            <CardContent className="flex flex-col gap-1 py-4">
              <span className="font-medium">Custom entities</span>
              <span className="text-sm text-muted-foreground">
                {entityTypes.length} type{entityTypes.length === 1 ? "" : "s"} —
                your own data (Property, Case, ...) a category can look up.
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

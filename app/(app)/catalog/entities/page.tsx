import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import * as entityTypeService from "@/lib/entities/entity-type-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

export default async function EntityTypesPage() {
  const organisation = await getCurrentOrganisation();
  const entityTypes = await entityTypeService.listEntityTypes(organisation.id);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Custom entities</h1>
          <p className="text-sm text-muted-foreground">
            Your own data — Property, Case, Candidate, whatever a category needs
            to look something up in beyond Products and Customers.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/catalog/entities/new" />}
        >
          Create entity type
        </Button>
      </div>

      {entityTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No custom entity types yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {entityTypes.map((entityType) => (
            <Link
              key={entityType.id}
              href={`/catalog/entities/${entityType.id}`}
            >
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between py-4">
                  <span className="font-medium">{entityType.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {entityType._count.records} record
                    {entityType._count.records === 1 ? "" : "s"}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

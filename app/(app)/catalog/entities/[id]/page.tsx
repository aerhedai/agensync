import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import * as entityRecordService from "@/lib/entities/entity-record-service";
import * as entityTypeService from "@/lib/entities/entity-type-service";
import { entityFieldsSchema } from "@/lib/entities/schemas";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

export default async function EntityTypeDetailPage({
  params,
}: PageProps<"/catalog/entities/[id]">) {
  const { id } = await params;
  const organisation = await getCurrentOrganisation();
  const entityType = await entityTypeService.getEntityType(organisation.id, id);

  if (!entityType) {
    notFound();
  }

  const fields = entityFieldsSchema.parse(entityType.fields);
  const records = await entityRecordService.listRecords(organisation.id, id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{entityType.name}</h1>
        <Button
          nativeButton={false}
          render={<Link href={`/catalog/entities/${id}/records/new`} />}
        >
          Add record
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Fields
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {fields.map((field) => (
            <p key={field.name} className="text-sm">
              <span className="font-mono text-xs text-muted-foreground">
                {field.name}
              </span>{" "}
              — {field.description}
            </p>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {records.map((record) => {
                const data = record.data as Record<string, unknown>;
                return (
                  <div
                    key={record.id}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    {fields.map((field) => (
                      <p key={field.name}>
                        <span className="text-muted-foreground">
                          {field.name}:
                        </span>{" "}
                        {String(data[field.name] ?? "")}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

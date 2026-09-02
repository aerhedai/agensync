import { createAgentAction } from "@/app/(app)/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";
import { entityFieldsSchema } from "@/lib/entities/schemas";
import * as entityTypeService from "@/lib/entities/entity-type-service";
import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export default async function NewAgentPage() {
  const organisation = await getCurrentOrganisation();
  const [entityTypes, gmailIntegrations] = await Promise.all([
    entityTypeService.listEntityTypes(organisation.id),
    integrationService.listIntegrationsByProvider(organisation.id, "gmail"),
  ]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Create agent</h1>
      <AgentForm
        action={createAgentAction}
        submitLabel="Create agent"
        entityTypes={entityTypes.map((e) => ({
          name: e.name,
          fields: entityFieldsSchema.parse(e.fields).map((f) => f.name),
        }))}
        gmailIntegrations={gmailIntegrations.map((i) => ({
          id: i.id,
          name: i.name,
        }))}
      />
    </div>
  );
}

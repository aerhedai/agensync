import { createAgentAction } from "@/app/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";
import * as entityTypeService from "@/lib/entities/entity-type-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export default async function NewAgentPage() {
  const organisation = await getCurrentOrganisation();
  const entityTypes = await entityTypeService.listEntityTypes(organisation.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Create agent</h1>
      <AgentForm
        action={createAgentAction}
        submitLabel="Create agent"
        entityTypeNames={entityTypes.map((e) => e.name)}
      />
    </div>
  );
}

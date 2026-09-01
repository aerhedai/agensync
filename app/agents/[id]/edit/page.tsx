import { notFound } from "next/navigation";

import { updateAgentAction } from "@/app/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";
import * as agentService from "@/lib/agents/agent-service";
import { extractionFieldsSchema } from "@/lib/agents/extraction-fields";
import * as entityTypeService from "@/lib/entities/entity-type-service";
import * as integrationService from "@/lib/integrations/integration-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export default async function EditAgentPage({
  params,
}: PageProps<"/agents/[id]/edit">) {
  const { id } = await params;
  const organisation = await getCurrentOrganisation();
  const [agent, entityTypes, gmailIntegrations] = await Promise.all([
    agentService.getAgent(organisation.id, id),
    entityTypeService.listEntityTypes(organisation.id),
    integrationService.listIntegrationsByProvider(organisation.id, "gmail"),
  ]);

  if (!agent) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Edit {agent.name}</h1>
      <AgentForm
        action={updateAgentAction.bind(null, agent.id)}
        agent={{
          ...agent,
          toolNames: agent.tools.map((t) => t.toolName),
          extractionFields: extractionFieldsSchema.parse(
            agent.extractionFields,
          ),
        }}
        submitLabel="Save changes"
        entityTypeNames={entityTypes.map((e) => e.name)}
        gmailIntegrations={gmailIntegrations.map((i) => ({
          id: i.id,
          name: i.name,
        }))}
      />
    </div>
  );
}

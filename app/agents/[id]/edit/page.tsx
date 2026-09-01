import { notFound } from "next/navigation";

import { updateAgentAction } from "@/app/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";
import * as agentService from "@/lib/agents/agent-service";
import { extractionFieldsSchema } from "@/lib/agents/extraction-fields";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export default async function EditAgentPage({
  params,
}: PageProps<"/agents/[id]/edit">) {
  const { id } = await params;
  const organisation = await getCurrentOrganisation();
  const agent = await agentService.getAgent(organisation.id, id);

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
          extractionFields: extractionFieldsSchema.parse(agent.extractionFields),
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}

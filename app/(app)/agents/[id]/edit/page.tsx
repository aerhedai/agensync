import { notFound } from "next/navigation";

import { updateAgentAction } from "@/app/(app)/agents/actions";
import { AgentForm } from "@/components/agents/agent-form";
import * as agentService from "@/lib/agents/agent-service";
import { extractionFieldsSchema } from "@/lib/agents/extraction-fields";
import { entityFieldsSchema } from "@/lib/entities/schemas";
import * as entityTypeService from "@/lib/entities/entity-type-service";
import { pipelineConfigSchema as entityCorrespondenceArchiveConfigSchema } from "@/lib/harness/pipelines/entity-correspondence-archive-pipeline";
import { pipelineConfigSchema as entityStatusSignalConfigSchema } from "@/lib/harness/pipelines/entity-status-signal-pipeline";
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

  // Parsed server-side, against each pipeline's own schema, so the "use
  // client" AgentForm never needs to import a pipeline module itself (see
  // its own prop doc comment). A parse failure (e.g. hand-edited or
  // pre-this-feature data) just means no pre-fill, not an error — the
  // form still renders with blank fields for that pipeline.
  const initialEntityStatusSignalConfig =
    agent.pipelineKey === "entity_status_signal"
      ? entityStatusSignalConfigSchema.safeParse(agent.pipelineConfig).data
      : undefined;
  const initialEntityCorrespondenceArchiveConfig =
    agent.pipelineKey === "entity_correspondence_archive"
      ? entityCorrespondenceArchiveConfigSchema.safeParse(agent.pipelineConfig)
          .data
      : undefined;
  // Passed through raw rather than schema-parsed: the step editor
  // round-trips JSON, and pre-filling with exactly what's stored — even if
  // it no longer validates — is what lets someone repair a broken
  // programme instead of losing it.
  const initialStepsConfig =
    agent.pipelineKey === "steps" &&
    agent.pipelineConfig &&
    typeof agent.pipelineConfig === "object" &&
    !Array.isArray(agent.pipelineConfig)
      ? (agent.pipelineConfig as Record<string, unknown>)
      : undefined;

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
        entityTypes={entityTypes.map((e) => ({
          name: e.name,
          fields: entityFieldsSchema.parse(e.fields).map((f) => f.name),
        }))}
        gmailIntegrations={gmailIntegrations.map((i) => ({
          id: i.id,
          name: i.name,
        }))}
        initialEntityStatusSignalConfig={initialEntityStatusSignalConfig}
        initialEntityCorrespondenceArchiveConfig={
          initialEntityCorrespondenceArchiveConfig
        }
        initialStepsConfig={initialStepsConfig}
      />
    </div>
  );
}

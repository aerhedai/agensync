"use server";

import { redirect } from "next/navigation";

import * as agentService from "@/lib/agents/agent-service";
import { agentInputSchema } from "@/lib/agents/schemas";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export type AgentFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function parseAgentForm(formData: FormData) {
  return agentInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    instructions: formData.get("instructions"),
    model: formData.get("model"),
  });
}

export async function createAgentAction(
  _prevState: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const parsed = parseAgentForm(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  await agentService.createAgent(organisation.id, parsed.data);
  redirect("/agents");
}

export async function updateAgentAction(
  agentId: string,
  _prevState: AgentFormState,
  formData: FormData,
): Promise<AgentFormState> {
  const parsed = parseAgentForm(formData);
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  try {
    await agentService.updateAgent(organisation.id, agentId, parsed.data);
  } catch {
    return { error: "Agent not found." };
  }
  redirect(`/agents/${agentId}`);
}

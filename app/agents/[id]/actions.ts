"use server";

import { notFound, redirect } from "next/navigation";

import * as agentService from "@/lib/agents/agent-service";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import { runAgentByExecutionMode } from "@/lib/runtime/run-agent-by-mode";

export type RunAgentFormState = {
  error?: string;
};

export async function runAgentAction(
  agentId: string,
  _prevState: RunAgentFormState,
  formData: FormData,
): Promise<RunAgentFormState> {
  const input = formData.get("input");
  if (typeof input !== "string" || input.trim().length === 0) {
    return { error: "Enter some input for the agent to process." };
  }

  const organisation = await getCurrentOrganisation();
  const agent = await agentService.getAgent(organisation.id, agentId);
  if (!agent) {
    notFound();
  }

  const result = await runAgentByExecutionMode(agent, input.trim());
  redirect(`/runs/${result.runId}`);
}

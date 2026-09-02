"use server";

import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import * as workflowService from "@/lib/workflows/workflow-service";

const ROLES = new Set(["CLASSIFIER", "HANDLER"]);

export async function addWorkflowMemberAction(
  workflowId: string,
  formData: FormData,
) {
  const agentId = formData.get("agentId");
  const role = formData.get("role");
  if (
    typeof agentId !== "string" ||
    agentId.length === 0 ||
    typeof role !== "string" ||
    !ROLES.has(role)
  ) {
    notFound();
  }

  const organisation = await getCurrentOrganisation();
  await workflowService.addMember(
    organisation.id,
    workflowId,
    agentId,
    role as "CLASSIFIER" | "HANDLER",
  );
  redirect(`/workflows/${workflowId}`);
}

export async function activateWorkflowAction(workflowId: string) {
  const organisation = await getCurrentOrganisation();
  try {
    await workflowService.activateWorkflow(organisation.id, workflowId);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not activate this workflow.";
    redirect(
      `/workflows/${workflowId}?activation_error=${encodeURIComponent(message)}`,
    );
  }
  redirect(`/workflows/${workflowId}`);
}

export async function deactivateWorkflowAction(workflowId: string) {
  const organisation = await getCurrentOrganisation();
  await workflowService.deactivateWorkflow(organisation.id, workflowId);
  redirect(`/workflows/${workflowId}`);
}

// Removes the membership row only — the agent itself is untouched (see
// workflow-service.ts's removeMember doc comment). Deliberately no
// confirmation dialog: reversible in one click via "Add agent to this
// workflow" below, same lightweight-destructive-action precedent as
// disconnecting a single integration account.
export async function removeWorkflowMemberAction(
  workflowId: string,
  agentId: string,
) {
  const organisation = await getCurrentOrganisation();
  const removed = await workflowService.removeMember(
    organisation.id,
    workflowId,
    agentId,
  );
  if (!removed) {
    notFound();
  }
  revalidatePath(`/workflows/${workflowId}`);
}

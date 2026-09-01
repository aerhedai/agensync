"use server";

import { notFound, redirect } from "next/navigation";

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

"use server";

import { redirect } from "next/navigation";

import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";
import { workflowInputSchema } from "@/lib/workflows/schemas";
import * as workflowService from "@/lib/workflows/workflow-service";

export type WorkflowFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createWorkflowAction(
  _prevState: WorkflowFormState,
  formData: FormData,
): Promise<WorkflowFormState> {
  const parsed = workflowInputSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    trigger: formData.get("trigger"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  const workflow = await workflowService.createWorkflow(
    organisation.id,
    parsed.data,
  );
  redirect(`/workflows/${workflow.id}`);
}

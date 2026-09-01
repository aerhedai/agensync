"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createWorkflowAction,
  type WorkflowFormState,
} from "@/app/workflows/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating…" : "Create workflow"}
    </Button>
  );
}

export function WorkflowForm() {
  const [state, formAction] = useActionState<WorkflowFormState, FormData>(
    createWorkflowAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Invoice Processing"
          required
        />
        {state.fieldErrors?.name && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="What this workflow is for"
          required
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="trigger">Trigger</Label>
        <select
          id="trigger"
          name="trigger"
          defaultValue="EMAIL"
          className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
        >
          <option value="EMAIL">Email</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Email is the only trigger available today — more (Slack, forms,
          webhooks) are on the way. This workflow starts as a draft: build it
          out by adding a classifier and handler agents, then activate it when
          it&rsquo;s ready to receive real traffic.
        </p>
        {state.fieldErrors?.trigger && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.trigger[0]}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}

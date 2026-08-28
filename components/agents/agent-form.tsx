"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AgentFormState } from "@/app/agents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Agent } from "@/lib/generated/prisma/client";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

type AgentFormValues = Pick<
  Agent,
  "name" | "description" | "instructions" | "model"
>;

export function AgentForm({
  action,
  agent,
  submitLabel,
}: {
  action: (
    prevState: AgentFormState,
    formData: FormData,
  ) => Promise<AgentFormState>;
  agent?: AgentFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<AgentFormState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={agent?.name} required />
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
          defaultValue={agent?.description}
          required
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="instructions">Instructions</Label>
        <Textarea
          id="instructions"
          name="instructions"
          rows={6}
          defaultValue={agent?.instructions}
          required
        />
        {state.fieldErrors?.instructions && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.instructions[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="model">Model</Label>
        <Input
          id="model"
          name="model"
          defaultValue={agent?.model}
          required
          placeholder="e.g. qwen2.5:14b"
        />
        {state.fieldErrors?.model && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.model[0]}
          </p>
        )}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}

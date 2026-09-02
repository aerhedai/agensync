"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createRecordAction,
  type RecordFormState,
} from "@/app/(app)/catalog/entities/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityFieldConfig } from "@/lib/entities/schemas";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Add record"}
    </Button>
  );
}

export function EntityRecordForm({
  entityTypeId,
  fields,
}: {
  entityTypeId: string;
  fields: EntityFieldConfig[];
}) {
  const [state, formAction] = useActionState<RecordFormState, FormData>(
    createRecordAction.bind(null, entityTypeId),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      {fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Label htmlFor={field.name}>{field.name}</Label>
          <Input
            id={field.name}
            name={field.name}
            placeholder={field.description}
            required
          />
          {state.fieldErrors?.[field.name]?.[0] && (
            <p className="text-sm text-destructive">
              {state.fieldErrors[field.name]?.[0]}
            </p>
          )}
        </div>
      ))}

      <SubmitButton />
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createEntityTypeAction,
  updateEntityTypeAction,
  type EntityTypeFormState,
} from "@/app/(app)/catalog/entities/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EntityFieldConfig } from "@/lib/entities/schemas";

function SubmitButton({
  pendingLabel,
  label,
}: {
  pendingLabel: string;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function EntityTypeForm({
  editing,
}: {
  // Omitted: create mode. Present: edit mode, pre-filled and bound to
  // updateEntityTypeAction for this entity type's id.
  editing?: { id: string; name: string; fields: EntityFieldConfig[] };
} = {}) {
  const [state, formAction] = useActionState<EntityTypeFormState, FormData>(
    editing
      ? updateEntityTypeAction.bind(null, editing.id)
      : createEntityTypeAction,
    {},
  );
  const [fields, setFields] = useState<EntityFieldConfig[]>(
    editing?.fields ?? [{ name: "", description: "" }],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          placeholder="e.g. Property"
          defaultValue={editing?.name}
          required
        />
        {state.fieldErrors?.name && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Fields</Label>
        <p className="text-xs text-muted-foreground">
          What a record of this type looks like. An agent category can be
          configured to look one of these up by any of its fields.
        </p>
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          {fields.map((field, index) => (
            <div key={index} className="flex flex-col gap-2 sm:flex-row">
              <Input
                name="fieldName"
                placeholder="Field name, e.g. address"
                value={field.name}
                onChange={(e) =>
                  setFields((f) =>
                    f.map((item, i) =>
                      i === index ? { ...item, name: e.target.value } : item,
                    ),
                  )
                }
                className="sm:w-48"
              />
              <Input
                name="fieldDescription"
                placeholder="What it is, e.g. the property's full address"
                value={field.description}
                onChange={(e) =>
                  setFields((f) =>
                    f.map((item, i) =>
                      i === index
                        ? { ...item, description: e.target.value }
                        : item,
                    ),
                  )
                }
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setFields((f) => f.filter((_, i) => i !== index))
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() =>
              setFields((f) => [...f, { name: "", description: "" }])
            }
          >
            Add field
          </Button>
        </div>
        {state.fieldErrors?.fields && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.fields[0]}
          </p>
        )}
      </div>

      <SubmitButton
        label={editing ? "Save changes" : "Create entity type"}
        pendingLabel={editing ? "Saving…" : "Creating…"}
      />
    </form>
  );
}

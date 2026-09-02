"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createCustomerAction,
  type CustomerFormState,
} from "@/app/(app)/catalog/customers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Add customer"}
    </Button>
  );
}

export function CustomerForm() {
  const [state, formAction] = useActionState<CustomerFormState, FormData>(
    createCustomerAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required />
        {state.fieldErrors?.name && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
        {state.fieldErrors?.email && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="company">Company</Label>
        <Input id="company" name="company" required />
        {state.fieldErrors?.company && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.company[0]}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}

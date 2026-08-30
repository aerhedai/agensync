"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createProductAction,
  type ProductFormState,
} from "@/app/catalog/products/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Add product"}
    </Button>
  );
}

export function ProductForm() {
  const [state, formAction] = useActionState<ProductFormState, FormData>(
    createProductAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-col gap-2">
        <Label htmlFor="sku">SKU</Label>
        <Input id="sku" name="sku" required />
        {state.fieldErrors?.sku && (
          <p className="text-sm text-destructive">{state.fieldErrors.sku[0]}</p>
        )}
      </div>

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
        <Label htmlFor="unitPrice">Unit price</Label>
        <Input
          id="unitPrice"
          name="unitPrice"
          type="number"
          step="0.01"
          min="0"
          required
        />
        {state.fieldErrors?.unitPrice && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.unitPrice[0]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="stockQuantity">Stock quantity</Label>
        <Input
          id="stockQuantity"
          name="stockQuantity"
          type="number"
          step="1"
          min="0"
          required
        />
        {state.fieldErrors?.stockQuantity && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.stockQuantity[0]}
          </p>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}

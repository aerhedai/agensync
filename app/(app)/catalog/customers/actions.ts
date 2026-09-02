"use server";

import { redirect } from "next/navigation";

import * as customerRepository from "@/lib/customers/customer-repository";
import { customerInputSchema } from "@/lib/customers/schemas";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createCustomerAction(
  _prevState: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  const parsed = customerInputSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    company: formData.get("company"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  try {
    await customerRepository.createCustomer(organisation.id, parsed.data);
  } catch {
    return { error: "A customer with that email already exists." };
  }
  redirect("/catalog/customers");
}

"use server";

import { redirect } from "next/navigation";

import * as productRepository from "@/lib/products/product-repository";
import { productInputSchema } from "@/lib/products/schemas";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export type ProductFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const parsed = productInputSchema.safeParse({
    sku: formData.get("sku"),
    name: formData.get("name"),
    unitPrice: formData.get("unitPrice"),
    stockQuantity: formData.get("stockQuantity"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const organisation = await getCurrentOrganisation();
  try {
    await productRepository.createProduct(organisation.id, parsed.data);
  } catch {
    return { error: "A product with that SKU already exists." };
  }
  redirect("/catalog/products");
}

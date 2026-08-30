import { z } from "zod";

export const productInputSchema = z.object({
  sku: z.string().trim().min(1, "SKU is required").max(100),
  name: z.string().trim().min(1, "Name is required").max(200),
  unitPrice: z.coerce.number().positive("Unit price must be positive"),
  stockQuantity: z.coerce
    .number()
    .int()
    .nonnegative("Stock quantity can't be negative"),
});

export type ProductInput = z.infer<typeof productInputSchema>;

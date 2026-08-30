import { ProductForm } from "@/components/products/product-form";

export default function NewProductPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Add product</h1>
      <ProductForm />
    </div>
  );
}

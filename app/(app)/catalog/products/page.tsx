import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import * as productRepository from "@/lib/products/product-repository";
import { currencySymbol } from "@/lib/currency/currency-symbols";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const organisation = await getCurrentOrganisation();
  const products = await productRepository.findProductsByOrganisation(
    organisation.id,
  );
  const symbol = currencySymbol(organisation.currency);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <Button
          nativeButton={false}
          render={<Link href="/catalog/products/new" />}
        >
          Add product
        </Button>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No products yet. Add one so find_record and search_records have real
          data to look up.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((product) => (
            <Card key={product.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{product.name}</span>
                  <span className="text-sm text-muted-foreground">
                    SKU: {product.sku}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>
                    {symbol}
                    {product.unitPrice.toFixed(2)}
                  </span>
                  <span>{product.stockQuantity} in stock</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

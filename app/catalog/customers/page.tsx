import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import * as customerRepository from "@/lib/customers/customer-repository";
import { getCurrentOrganisation } from "@/lib/organisations/current-organisation";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const organisation = await getCurrentOrganisation();
  const customers = await customerRepository.findCustomersByOrganisation(
    organisation.id,
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Customers</h1>
        <Button
          nativeButton={false}
          render={<Link href="/catalog/customers/new" />}
        >
          Add customer
        </Button>
      </div>

      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No customers yet. Add one so find_customer has real data to look up.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {customers.map((customer) => (
            <Card key={customer.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{customer.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {customer.email}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {customer.company}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

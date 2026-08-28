// In-memory mock data for Phase 5's tools. Not Prisma models — Customer/Product
// aren't in CLAUDE.md's schema list (#17), and shouldn't be added before a real
// need exists. Figures line up with the worked example in CLAUDE.md #2/#25.

export interface Customer {
  id: string;
  name: string;
  email: string;
  company: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  unitPrice: number;
}

export const customers: Customer[] = [
  {
    id: "cust-1",
    name: "Customer ABC",
    email: "buyer@customer-abc.test",
    company: "Customer ABC Ltd",
  },
  {
    id: "cust-2",
    name: "Priya Shah",
    email: "priya@globex.test",
    company: "Globex Corp",
  },
];

export const products: Product[] = [
  { id: "prod-1", sku: "WIDGET-A", name: "Product A", unitPrice: 15 },
  { id: "prod-2", sku: "WIDGET-B", name: "Product B", unitPrice: 42.5 },
];

export const inventory: Record<string, number> = {
  "prod-1": 700,
  "prod-2": 120,
};

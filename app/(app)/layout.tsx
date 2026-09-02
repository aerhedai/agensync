import type { ReactNode } from "react";

import { Nav } from "@/components/layout/nav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      {children}
    </>
  );
}

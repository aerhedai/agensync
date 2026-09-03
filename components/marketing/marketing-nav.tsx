import Link from "next/link";

import { Button } from "@/components/ui/button";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-base font-semibold tracking-tight">
          Aperator
        </Link>

        <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground sm:flex">
          <Link
            href="/#product"
            className="transition-colors hover:text-foreground"
          >
            Product
          </Link>
          <Link
            href="/pricing"
            className="transition-colors hover:text-foreground"
          >
            Pricing
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/sign-in"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Button
            nativeButton={false}
            render={<Link href="/sign-up" />}
            className="bg-marketing-amber text-marketing-amber-foreground hover:bg-marketing-amber/85"
          >
            Get started
          </Button>
        </div>
      </nav>
    </header>
  );
}

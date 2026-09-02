import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function PricingPage() {
  return (
    <section className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-24 text-center sm:py-32">
      <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
        Pricing
      </p>
      <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
        We&rsquo;re early — pricing is tailored to your business.
      </h1>
      <p className="text-lg text-muted-foreground">
        Agensync isn&rsquo;t on a fixed price list yet. Get started and
        we&rsquo;ll work out what fits, based on the processes you actually want
        automated.
      </p>
      <div className="pt-2">
        <Button
          size="lg"
          nativeButton={false}
          render={<Link href="/sign-up" />}
          className="h-11 bg-marketing-amber px-6 text-base text-marketing-amber-foreground hover:bg-marketing-amber/85"
        >
          Get started
        </Button>
      </div>
    </section>
  );
}

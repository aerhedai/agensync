import Link from "next/link";

import { RunTraceCard } from "@/components/marketing/run-trace-card";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
      <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-6">
          <p className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
            Agentic business automation
          </p>
          <h1 className="font-heading text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Not a chatbot.{" "}
            <span className="text-muted-foreground">
              A worker that shows its work.
            </span>
          </h1>
          <p className="max-w-lg text-lg text-muted-foreground text-pretty">
            Aperator agents read what comes in, decide what needs to happen, act
            through the tools you allow, and stop for a human before anything
            consequential goes out. Every step is recorded.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Button
              size="lg"
              nativeButton={false}
              render={<Link href="/sign-up" />}
              className="h-11 bg-marketing-amber px-6 text-base text-marketing-amber-foreground hover:bg-marketing-amber/85"
            >
              Get started
            </Button>
            <Link
              href="/#product"
              className="text-sm font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              See how it works
            </Link>
          </div>
        </div>

        <RunTraceCard />
      </div>
    </section>
  );
}

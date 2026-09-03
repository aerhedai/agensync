import Link from "next/link";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] =
  [
    {
      heading: "Product",
      links: [
        { label: "Product", href: "/#product" },
        { label: "Pricing", href: "/pricing" },
      ],
    },
    {
      heading: "Account",
      links: [
        { label: "Sign in", href: "/sign-in" },
        { label: "Get started", href: "/sign-up" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Terms", href: "/terms" },
        { label: "Privacy", href: "/privacy" },
      ],
    },
  ];

export function MarketingFooter() {
  return (
    <footer className="bg-marketing-ink text-marketing-ink-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-6 py-16 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-2">
          <span className="text-base font-semibold tracking-tight">
            Aperator
          </span>
          <p className="max-w-xs text-sm text-marketing-ink-foreground/60">
            Agentic AI business automation — controlled by rules, gated by
            approval, recorded end to end.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.heading} className="flex flex-col gap-3">
              <p className="text-xs font-medium tracking-wide text-marketing-ink-foreground/50 uppercase">
                {column.heading}
              </p>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-marketing-ink-foreground/80 transition-colors hover:text-marketing-ink-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-marketing-ink-foreground/10">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-marketing-ink-foreground/50">
          © {new Date().getFullYear()} Aperator
        </div>
      </div>
    </footer>
  );
}
